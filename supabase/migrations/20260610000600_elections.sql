-- Board elections. Replaces the lspelections Firestore project.
-- Ballots are never readable with the anon key; voting status, the
-- has-voted check, and vote casting are RPC-only for the public page.
-- NOTE: email dedup remains honor-system (same as the legacy app). A future
-- integrity upgrade is Supabase Auth email OTP with a voter_id column.

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  opens_at timestamptz,
  closes_at timestamptz,
  override text check (override is null or override in ('open', 'closed')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists elections_one_current
  on public.elections(is_current) where is_current;

create table if not exists public.election_votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  email text not null check (
    email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254
  ),
  president text check (president is null or char_length(president) <= 120),
  vice_president text check (vice_president is null or char_length(vice_president) <= 120),
  treasurer text check (treasurer is null or char_length(treasurer) <= 120),
  secretary text check (secretary is null or char_length(secretary) <= 120),
  created_at timestamptz not null default now()
);

create unique index if not exists election_votes_dedupe
  on public.election_votes(election_id, lower(email));
create index if not exists election_votes_election_idx
  on public.election_votes(election_id, created_at);

alter table public.elections enable row level security;
alter table public.election_votes enable row level security;

revoke all on table public.elections from anon;
revoke all on table public.election_votes from anon;

grant select, insert, update on table public.elections to authenticated;
grant select, delete on table public.election_votes to authenticated;

grant all on table public.elections to service_role;
grant all on table public.election_votes to service_role;

drop trigger if exists set_elections_updated_at on public.elections;
create trigger set_elections_updated_at
before update on public.elections
for each row execute function public.set_updated_at();

-- A current election always exists; closed until the board schedules or
-- overrides it (data migration copies the legacy override state).
insert into public.elections (name, is_current, override)
select 'LSP Board Elections', true, 'closed'
where not exists (select 1 from public.elections where is_current);

create or replace function public.get_voting_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  election_record record;
  is_open boolean;
begin
  select * into election_record
  from public.elections
  where is_current
  limit 1;

  if not found then
    return jsonb_build_object('open', false, 'electionName', null);
  end if;

  if election_record.override = 'open' then
    is_open := true;
  elsif election_record.override = 'closed' then
    is_open := false;
  else
    is_open := election_record.opens_at is not null
      and election_record.closes_at is not null
      and now() between election_record.opens_at and election_record.closes_at;
  end if;

  return jsonb_build_object(
    'open', is_open,
    'electionName', election_record.name,
    'opensAt', election_record.opens_at,
    'closesAt', election_record.closes_at
  );
end;
$$;

revoke all on function public.get_voting_status() from public;
grant execute on function public.get_voting_status() to anon, authenticated, service_role;

create or replace function public.has_voted(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.election_votes v
    join public.elections e on e.id = v.election_id and e.is_current
    where lower(v.email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.has_voted(text) from public;
grant execute on function public.has_voted(text) to anon, authenticated, service_role;

create or replace function public.cast_vote(
  p_email text,
  p_president text,
  p_vice_president text,
  p_treasurer text,
  p_secretary text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  election_record record;
  status jsonb;
begin
  status := public.get_voting_status();

  if not coalesce((status ->> 'open')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select * into election_record
  from public.elections
  where is_current
  limit 1;

  insert into public.election_votes (
    election_id, email, president, vice_president, treasurer, secretary
  )
  values (
    election_record.id,
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_president, '')), ''),
    nullif(btrim(coalesce(p_vice_president, '')), ''),
    nullif(btrim(coalesce(p_treasurer, '')), ''),
    nullif(btrim(coalesce(p_secretary, '')), '')
  );

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

revoke all on function public.cast_vote(text, text, text, text, text) from public;
grant execute on function public.cast_vote(text, text, text, text, text)
  to anon, authenticated, service_role;

-- Elections-module RLS for the admin dashboard.
drop policy if exists "Elections module can read elections" on public.elections;
create policy "Elections module can read elections"
on public.elections
for select
to authenticated
using ((select app_private.has_module('elections')));

drop policy if exists "Elections module can insert elections" on public.elections;
create policy "Elections module can insert elections"
on public.elections
for insert
to authenticated
with check ((select app_private.has_module('elections')));

drop policy if exists "Elections module can update elections" on public.elections;
create policy "Elections module can update elections"
on public.elections
for update
to authenticated
using ((select app_private.has_module('elections')))
with check ((select app_private.has_module('elections')));

drop policy if exists "Elections module can read votes" on public.election_votes;
create policy "Elections module can read votes"
on public.election_votes
for select
to authenticated
using ((select app_private.has_module('elections')));

drop policy if exists "Admins can delete votes" on public.election_votes;
create policy "Admins can delete votes"
on public.election_votes
for delete
to authenticated
using ((select app_private.is_admin()));

notify pgrst, 'reload schema';
