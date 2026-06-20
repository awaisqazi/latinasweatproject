-- Small key/value settings table. Readable by any signed-in user (so the
-- feedback form knows who to deliver to); only superusers can change settings.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "app_settings_select" on public.app_settings
  for select to authenticated using (true);

create policy "app_settings_write" on public.app_settings
  for all to authenticated
  using ((select app_private.is_superuser()))
  with check ((select app_private.is_superuser()));

create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function set_updated_at();

-- Default the feedback recipient to awais.a.qazi@gmail.com (resolved by email).
insert into public.app_settings (key, value)
select 'feedback_recipient_id', to_jsonb(id::text)
from public.profiles
where email = 'awais.a.qazi@gmail.com'
limit 1
on conflict (key) do nothing;
