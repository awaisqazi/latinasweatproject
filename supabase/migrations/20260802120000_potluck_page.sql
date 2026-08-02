-- Community potluck planner (/potluck).
-- Anyone with the link can watch the table fill up live and add what they are
-- bringing. No accounts: writes go through SECURITY DEFINER RPCs that hand
-- back a per-row secret token, and that token (kept in the browser's
-- localStorage) is the only way to edit or remove an entry. Tokens live in
-- private side tables the Data API roles cannot read, so potluck_items and
-- potluck_rsvps contain no secrets and are safe to expose read-only and to
-- broadcast over Realtime (postgres_changes payloads always carry full rows).

-- 1) Tables ------------------------------------------------------------------

create table if not exists public.potluck_items (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  contributor_name text not null,
  item_name text not null,
  category text not null,
  serves integer,
  dietary_tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint potluck_items_event_slug_check
    check (char_length(event_slug) between 1 and 80),
  constraint potluck_items_contributor_name_check
    check (char_length(contributor_name) between 1 and 80),
  constraint potluck_items_item_name_check
    check (char_length(item_name) between 1 and 120),
  constraint potluck_items_category_check
    check (category in ('main', 'side', 'appetizer', 'dessert', 'drink', 'supplies', 'other')),
  constraint potluck_items_serves_check
    check (serves is null or serves between 1 and 200),
  constraint potluck_items_notes_check
    check (notes is null or char_length(notes) <= 280),
  constraint potluck_items_dietary_tags_check
    check (coalesce(array_length(dietary_tags, 1), 0) <= 6)
);

create index if not exists potluck_items_event_created_idx
  on public.potluck_items (event_slug, created_at);

create table if not exists public.potluck_item_tokens (
  item_id uuid primary key references public.potluck_items (id) on delete cascade,
  token uuid not null default gen_random_uuid()
);

create table if not exists public.potluck_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  name text not null,
  party_size integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint potluck_rsvps_event_slug_check
    check (char_length(event_slug) between 1 and 80),
  constraint potluck_rsvps_name_check
    check (char_length(name) between 1 and 80),
  constraint potluck_rsvps_party_size_check
    check (party_size between 1 and 20)
);

create index if not exists potluck_rsvps_event_created_idx
  on public.potluck_rsvps (event_slug, created_at);

create table if not exists public.potluck_rsvp_tokens (
  rsvp_id uuid primary key references public.potluck_rsvps (id) on delete cascade,
  token uuid not null default gen_random_uuid()
);

-- 2) RLS + grants ------------------------------------------------------------
-- Items and RSVPs: world-readable, never directly writable (RPCs only).
-- Token tables: RLS on, zero Data API grants, zero policies. Deny by default
-- means even a stray future grant exposes nothing.

alter table public.potluck_items enable row level security;
alter table public.potluck_rsvps enable row level security;
alter table public.potluck_item_tokens enable row level security;
alter table public.potluck_rsvp_tokens enable row level security;

revoke all on table public.potluck_items from anon, authenticated;
revoke all on table public.potluck_rsvps from anon, authenticated;
revoke all on table public.potluck_item_tokens from anon, authenticated;
revoke all on table public.potluck_rsvp_tokens from anon, authenticated;

grant select on table public.potluck_items to anon, authenticated;
grant select on table public.potluck_rsvps to anon, authenticated;

grant all on table public.potluck_items to service_role;
grant all on table public.potluck_rsvps to service_role;
grant all on table public.potluck_item_tokens to service_role;
grant all on table public.potluck_rsvp_tokens to service_role;

drop policy if exists "Potluck items are public" on public.potluck_items;
create policy "Potluck items are public"
  on public.potluck_items
  for select to anon, authenticated
  using (true);

drop policy if exists "Potluck rsvps are public" on public.potluck_rsvps;
create policy "Potluck rsvps are public"
  on public.potluck_rsvps
  for select to anon, authenticated
  using (true);

-- 3) Helpers -----------------------------------------------------------------
-- Dietary tags are normalized against a whitelist so free-form junk can never
-- land in the array. Not callable through the Data API; the definer RPCs run
-- as the function owner, which keeps execute rights regardless of grants.

create or replace function public.potluck_clean_dietary(p_tags text[])
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct tag), '{}')
  from unnest(coalesce(p_tags, '{}')) as tag
  where tag in ('vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'contains-nuts', 'spicy')
$$;

revoke all on function public.potluck_clean_dietary(text[]) from public, anon, authenticated;

-- 4) Public RPCs -------------------------------------------------------------
-- All validation happens inside the functions (the anon role has no direct
-- write grants at all). Every write answers jsonb {ok, ...} instead of
-- raising, mirroring cast_vote.

create or replace function public.potluck_add_item(
  p_event_slug text,
  p_contributor_name text,
  p_item_name text,
  p_category text,
  p_serves integer default null,
  p_dietary_tags text[] default '{}',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_slug text := btrim(coalesce(p_event_slug, ''));
  clean_name text := btrim(coalesce(p_contributor_name, ''));
  clean_item text := btrim(coalesce(p_item_name, ''));
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  new_id uuid;
  new_token uuid;
begin
  if char_length(clean_slug) not between 1 and 80
    or char_length(clean_name) not between 1 and 80
    or char_length(clean_item) not between 1 and 120
    or p_category is null
    or p_category not in ('main', 'side', 'appetizer', 'dessert', 'drink', 'supplies', 'other')
    or (p_serves is not null and p_serves not between 1 and 200)
    or (clean_notes is not null and char_length(clean_notes) > 280)
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Abuse ceiling: one potluck does not need more rows than this.
  if (select count(*) from public.potluck_items where event_slug = clean_slug) >= 300 then
    return jsonb_build_object('ok', false, 'reason', 'event_full');
  end if;

  insert into public.potluck_items (
    event_slug, contributor_name, item_name, category, serves, dietary_tags, notes
  )
  values (
    clean_slug, clean_name, clean_item, p_category, p_serves,
    public.potluck_clean_dietary(p_dietary_tags), clean_notes
  )
  returning id into new_id;

  insert into public.potluck_item_tokens (item_id)
  values (new_id)
  returning token into new_token;

  return jsonb_build_object('ok', true, 'id', new_id, 'token', new_token);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

create or replace function public.potluck_update_item(
  p_item_id uuid,
  p_token uuid,
  p_contributor_name text,
  p_item_name text,
  p_category text,
  p_serves integer default null,
  p_dietary_tags text[] default '{}',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_contributor_name, ''));
  clean_item text := btrim(coalesce(p_item_name, ''));
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if p_item_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if char_length(clean_name) not between 1 and 80
    or char_length(clean_item) not between 1 and 120
    or p_category is null
    or p_category not in ('main', 'side', 'appetizer', 'dessert', 'drink', 'supplies', 'other')
    or (p_serves is not null and p_serves not between 1 and 200)
    or (clean_notes is not null and char_length(clean_notes) > 280)
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not exists (
    select 1 from public.potluck_item_tokens
    where item_id = p_item_id and token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.potluck_items
  set contributor_name = clean_name,
      item_name = clean_item,
      category = p_category,
      serves = p_serves,
      dietary_tags = public.potluck_clean_dietary(p_dietary_tags),
      notes = clean_notes,
      updated_at = now()
  where id = p_item_id;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

create or replace function public.potluck_remove_item(
  p_item_id uuid,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_item_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not exists (
    select 1 from public.potluck_item_tokens
    where item_id = p_item_id and token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  delete from public.potluck_items where id = p_item_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.potluck_add_rsvp(
  p_event_slug text,
  p_name text,
  p_party_size integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_slug text := btrim(coalesce(p_event_slug, ''));
  clean_name text := btrim(coalesce(p_name, ''));
  new_id uuid;
  new_token uuid;
begin
  if char_length(clean_slug) not between 1 and 80
    or char_length(clean_name) not between 1 and 80
    or p_party_size is null
    or p_party_size not between 1 and 20
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if (select count(*) from public.potluck_rsvps where event_slug = clean_slug) >= 400 then
    return jsonb_build_object('ok', false, 'reason', 'event_full');
  end if;

  insert into public.potluck_rsvps (event_slug, name, party_size)
  values (clean_slug, clean_name, p_party_size)
  returning id into new_id;

  insert into public.potluck_rsvp_tokens (rsvp_id)
  values (new_id)
  returning token into new_token;

  return jsonb_build_object('ok', true, 'id', new_id, 'token', new_token);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

create or replace function public.potluck_update_rsvp(
  p_rsvp_id uuid,
  p_token uuid,
  p_name text,
  p_party_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
begin
  if p_rsvp_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if char_length(clean_name) not between 1 and 80
    or p_party_size is null
    or p_party_size not between 1 and 20
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not exists (
    select 1 from public.potluck_rsvp_tokens
    where rsvp_id = p_rsvp_id and token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.potluck_rsvps
  set name = clean_name,
      party_size = p_party_size,
      updated_at = now()
  where id = p_rsvp_id;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

create or replace function public.potluck_remove_rsvp(
  p_rsvp_id uuid,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_rsvp_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not exists (
    select 1 from public.potluck_rsvp_tokens
    where rsvp_id = p_rsvp_id and token = p_token
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  delete from public.potluck_rsvps where id = p_rsvp_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.potluck_add_item(text, text, text, text, integer, text[], text) from public;
grant execute on function public.potluck_add_item(text, text, text, text, integer, text[], text) to anon, authenticated, service_role;

revoke all on function public.potluck_update_item(uuid, uuid, text, text, text, integer, text[], text) from public;
grant execute on function public.potluck_update_item(uuid, uuid, text, text, text, integer, text[], text) to anon, authenticated, service_role;

revoke all on function public.potluck_remove_item(uuid, uuid) from public;
grant execute on function public.potluck_remove_item(uuid, uuid) to anon, authenticated, service_role;

revoke all on function public.potluck_add_rsvp(text, text, integer) from public;
grant execute on function public.potluck_add_rsvp(text, text, integer) to anon, authenticated, service_role;

revoke all on function public.potluck_update_rsvp(uuid, uuid, text, integer) from public;
grant execute on function public.potluck_update_rsvp(uuid, uuid, text, integer) to anon, authenticated, service_role;

revoke all on function public.potluck_remove_rsvp(uuid, uuid) from public;
grant execute on function public.potluck_remove_rsvp(uuid, uuid) to anon, authenticated, service_role;

-- 5) Realtime ----------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.potluck_items;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.potluck_rsvps;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
