-- Inventory module: coordinators log remaining supply counts at the end of
-- each shift from an unlisted public form (/inventory); the admin dashboard
-- gets a grantable "inventory" module with stock levels, history, and trends.
-- Public reads go through get_inventory_form_data(); public writes go only
-- through the inventory-log edge function (service role), which verifies a
-- Cloudflare Turnstile token first.

-- 1) Register the module so User Access can grant it.
alter table public.profile_modules drop constraint profile_modules_module_check;
alter table public.profile_modules add constraint profile_modules_module_check check (
  module in (
    'marketing',
    'board_projects',
    'volunteers',
    'subs',
    'events',
    'elections',
    'gala',
    'users',
    'spaces',
    'fundraising',
    'inventory'
  )
);

-- 2) Tables. Items are the scalable registry; logs are one submission per
-- shift; log items are the per-item counts (quantity = what remains).
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unit text check (unit is null or char_length(unit) <= 40),
  low_threshold integer not null default 0 check (low_threshold >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  coordinator_name text not null check (char_length(btrim(coordinator_name)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  source text not null default 'form' check (source in ('form', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_log_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.inventory_logs(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  -- Snapshot of the previous count at submit time, for delta displays that
  -- survive item re-sorting and concurrent logs.
  previous_quantity integer check (previous_quantity is null or previous_quantity >= 0),
  unique (log_id, item_id)
);

create index if not exists inventory_logs_created_idx on public.inventory_logs(created_at desc);
create index if not exists inventory_log_items_item_idx on public.inventory_log_items(item_id);
create index if not exists inventory_log_items_log_idx on public.inventory_log_items(log_id);

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

-- 3) RLS: dashboard users with the inventory module manage everything;
-- the anon form never touches the tables directly.
alter table public.inventory_items enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.inventory_log_items enable row level security;

revoke all on table public.inventory_items from anon;
revoke all on table public.inventory_logs from anon;
revoke all on table public.inventory_log_items from anon;

grant select, insert, update, delete on table public.inventory_items to authenticated;
grant select, insert, update, delete on table public.inventory_logs to authenticated;
grant select, insert, update, delete on table public.inventory_log_items to authenticated;

grant all on table public.inventory_items to service_role;
grant all on table public.inventory_logs to service_role;
grant all on table public.inventory_log_items to service_role;

drop policy if exists "Inventory module full access items" on public.inventory_items;
create policy "Inventory module full access items"
on public.inventory_items
for all
to authenticated
using ((select app_private.has_module('inventory')))
with check ((select app_private.has_module('inventory')));

drop policy if exists "Inventory module full access logs" on public.inventory_logs;
create policy "Inventory module full access logs"
on public.inventory_logs
for all
to authenticated
using ((select app_private.has_module('inventory')))
with check ((select app_private.has_module('inventory')));

drop policy if exists "Inventory module full access log items" on public.inventory_log_items;
create policy "Inventory module full access log items"
on public.inventory_log_items
for all
to authenticated
using ((select app_private.has_module('inventory')))
with check ((select app_private.has_module('inventory')));

-- 4) Public form bootstrap: active items with their latest counts, who
-- logged last, and the Turnstile site key (swappable via app_settings).
create or replace function public.get_inventory_form_data()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'name', i.name,
            'unit', i.unit,
            'sortOrder', i.sort_order,
            'lastQuantity', latest.quantity,
            'lastLoggedAt', latest.created_at
          )
          order by i.sort_order, i.name
        )
        from public.inventory_items i
        left join lateral (
          select li.quantity, l.created_at
          from public.inventory_log_items li
          join public.inventory_logs l on l.id = li.log_id
          where li.item_id = i.id
          order by l.created_at desc
          limit 1
        ) latest on true
        where i.active
      ),
      '[]'::jsonb
    ),
    'lastLog', (
      select jsonb_build_object(
        'coordinatorName', coordinator_name,
        'createdAt', created_at
      )
      from public.inventory_logs
      order by created_at desc
      limit 1
    ),
    'turnstileSiteKey', (
      select value #>> '{}' from public.app_settings where key = 'turnstile_site_key'
    )
  );
$$;

revoke all on function public.get_inventory_form_data() from public;
grant execute on function public.get_inventory_form_data() to anon, authenticated, service_role;

-- 5) Low-stock alerts: when a logged count is at or below the item's
-- threshold, drop a Workspace task in each configured recipient's inbox.
-- One open alert per item per recipient; clearing it re-arms the alert.
create or replace function app_private.notify_low_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_item record;
  v_coordinator text;
  v_recipient uuid;
begin
  select name, unit, low_threshold into v_item
  from public.inventory_items
  where id = new.item_id;

  if v_item is null or new.quantity > v_item.low_threshold then
    return new;
  end if;

  select coordinator_name into v_coordinator
  from public.inventory_logs
  where id = new.log_id;

  for v_recipient in
    select value::uuid
    from jsonb_array_elements_text(
      coalesce(
        (select value from public.app_settings where key = 'inventory_alert_recipients'),
        '[]'::jsonb
      )
    ) as t(value)
  loop
    if exists (select 1 from public.profiles where id = v_recipient)
      and not exists (
        select 1 from public.workspace_tasks
        where assignee_id = v_recipient
          and source_ref = 'inventory_alert:' || new.item_id
          and status = 'open'
      )
    then
      insert into public.workspace_tasks (
        assignee_id, assigned_by, title, note, priority,
        source_module, source_label, source_ref
      )
      values (
        v_recipient,
        v_recipient,
        'Low inventory: ' || v_item.name,
        v_item.name || ' is down to ' || new.quantity
          || coalesce(' ' || v_item.unit, '')
          || ' (low threshold: ' || v_item.low_threshold || '). Logged by '
          || coalesce(v_coordinator, 'unknown') || '.',
        'P1',
        'inventory',
        'Inventory alert',
        'inventory_alert:' || new.item_id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_low_inventory on public.inventory_log_items;
create trigger notify_low_inventory
after insert on public.inventory_log_items
for each row execute function app_private.notify_low_inventory();

-- 6) Seeds. Thresholds are starting guesses; both are editable from the
-- admin Inventory module.
create unique index if not exists inventory_items_name_key
  on public.inventory_items (lower(name));

insert into public.inventory_items (name, unit, low_threshold, sort_order)
values
  ('Lysol wipes', 'containers', 2, 10),
  ('Water jugs', 'jugs', 2, 20),
  ('Towels for class (sweat)', 'towels', 10, 30),
  ('Towels to clean (studio)', 'towels', 5, 40),
  ('Water bottles', 'bottles', 12, 50),
  ('Toilet paper', 'rolls', 4, 60),
  ('Paper towels', 'rolls', 4, 70)
on conflict do nothing;

-- Alert recipients: Fez Qazi + Veronica Quinones (profile ids).
insert into public.app_settings (key, value)
values (
  'inventory_alert_recipients',
  '["d361f84a-0fb4-4503-b1af-71076b404017","6fba10ad-f784-4f3d-9a02-a9318533bfd1"]'::jsonb
)
on conflict (key) do nothing;

-- Cloudflare Turnstile site key. Seeded with Cloudflare's official
-- always-passes TEST key; swap the real key in via this setting (and the
-- TURNSTILE_SECRET_KEY edge-function secret) without a deploy.
insert into public.app_settings (key, value)
values ('turnstile_site_key', to_jsonb('1x00000000000000000000AA'::text))
on conflict (key) do nothing;

notify pgrst, 'reload schema';
