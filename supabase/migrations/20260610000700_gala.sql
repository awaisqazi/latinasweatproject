-- Gala guests and donations. Replaces the galathermometerapp Firestore project.
-- Staff tools (check-in, paddles, donation terminal) require the gala module;
-- the public thermometer/ticker reads gala_donations_public by polling.

create table if not exists public.gala_guests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  paddle_number integer not null unique check (paddle_number > 0),
  first_name text,
  last_name text,
  checked_in boolean not null default false,
  check_in_time timestamptz,
  original_paddle integer,
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gala_donations (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  paddle_number integer,
  amount numeric(10, 2) not null check (amount >= 0),
  donor_name text check (donor_name is null or char_length(donor_name) <= 200),
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gala_donations_created_idx
  on public.gala_donations(created_at desc);
create index if not exists gala_guests_paddle_idx
  on public.gala_guests(paddle_number);

alter table public.gala_guests enable row level security;
alter table public.gala_donations enable row level security;

revoke all on table public.gala_guests from anon;
revoke all on table public.gala_donations from anon;

grant select, insert, update, delete on table public.gala_guests to authenticated;
grant select, insert, update, delete on table public.gala_donations to authenticated;

grant all on table public.gala_guests to service_role;
grant all on table public.gala_donations to service_role;

drop trigger if exists set_gala_guests_updated_at on public.gala_guests;
create trigger set_gala_guests_updated_at
before update on public.gala_guests
for each row execute function public.set_updated_at();

-- Public donation feed for the thermometer/ticker. Donor display name only.
create or replace view public.gala_donations_public as
select
  d.id,
  d.amount,
  coalesce(
    nullif(btrim(coalesce(g.first_name, '') || ' ' || coalesce(g.last_name, '')), ''),
    d.donor_name,
    'Anonymous'
  ) as donor_name,
  d.paddle_number,
  d.created_at
from public.gala_donations d
left join public.gala_guests g on g.paddle_number = d.paddle_number;

grant select on public.gala_donations_public to anon, authenticated;

-- Gala-module RLS for staff tools.
drop policy if exists "Gala module can read guests" on public.gala_guests;
create policy "Gala module can read guests"
on public.gala_guests
for select
to authenticated
using ((select app_private.has_module('gala')));

drop policy if exists "Gala module can insert guests" on public.gala_guests;
create policy "Gala module can insert guests"
on public.gala_guests
for insert
to authenticated
with check ((select app_private.has_module('gala')));

drop policy if exists "Gala module can update guests" on public.gala_guests;
create policy "Gala module can update guests"
on public.gala_guests
for update
to authenticated
using ((select app_private.has_module('gala')))
with check ((select app_private.has_module('gala')));

drop policy if exists "Gala module can delete guests" on public.gala_guests;
create policy "Gala module can delete guests"
on public.gala_guests
for delete
to authenticated
using ((select app_private.has_module('gala')));

drop policy if exists "Gala module can read donations" on public.gala_donations;
create policy "Gala module can read donations"
on public.gala_donations
for select
to authenticated
using ((select app_private.has_module('gala')));

drop policy if exists "Gala module can insert donations" on public.gala_donations;
create policy "Gala module can insert donations"
on public.gala_donations
for insert
to authenticated
with check ((select app_private.has_module('gala')));

drop policy if exists "Gala module can update donations" on public.gala_donations;
create policy "Gala module can update donations"
on public.gala_donations
for update
to authenticated
using ((select app_private.has_module('gala')))
with check ((select app_private.has_module('gala')));

drop policy if exists "Admins can delete donations" on public.gala_donations;
create policy "Admins can delete donations"
on public.gala_donations
for delete
to authenticated
using ((select app_private.is_admin()));

notify pgrst, 'reload schema';
