-- Public events, managed from the dashboard (events module) and read by the
-- public /events page through the anon key. Replaces hardcoded src/data/events.js.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) > 0),
  image_src text,
  image_frame_class text,
  image_class text,
  date_label text,
  time_label text,
  starts_on date,
  ends_on date,
  location text,
  address text,
  description text,
  registration_link text,
  registration_label text,
  conversion_event text,
  conversion_provider text,
  conversion_booking_path text,
  featured boolean not null default false,
  recurring boolean not null default false,
  tags text[] not null default '{}',
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_published_idx on public.events(published, sort_order, starts_on);

alter table public.events enable row level security;

revoke all on table public.events from anon;
grant select on table public.events to anon;
grant select, insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop policy if exists "Anyone can read published events" on public.events;
create policy "Anyone can read published events"
on public.events
for select
to anon
using (published);

drop policy if exists "Events module can read all events" on public.events;
create policy "Events module can read all events"
on public.events
for select
to authenticated
using (published or (select app_private.has_module('events')));

drop policy if exists "Events module can insert events" on public.events;
create policy "Events module can insert events"
on public.events
for insert
to authenticated
with check ((select app_private.has_module('events')));

drop policy if exists "Events module can update events" on public.events;
create policy "Events module can update events"
on public.events
for update
to authenticated
using ((select app_private.has_module('events')))
with check ((select app_private.has_module('events')));

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
on public.events
for delete
to authenticated
using ((select app_private.is_admin()));

-- Seed the events currently hardcoded in src/data/events.js (content preserved verbatim).
insert into public.events (
  slug, title, image_src, image_frame_class, image_class, date_label, time_label,
  starts_on, ends_on, location, address, description,
  registration_link, registration_label,
  conversion_event, conversion_provider, conversion_booking_path,
  featured, recurring, tags, sort_order
)
values
  (
    'world-cup-watch-party',
    'LSP World Cup Watch Party',
    '/images/world-cup-watch-party.png',
    'aspect-[4/5]',
    'h-full w-full object-contain',
    'June 11 - July 4',
    'Starts at 1:00 PM on June 11',
    '2026-06-11',
    '2026-07-04',
    'LSP Studio',
    '949 W 16th St, Chicago, IL',
    'Join us for a fun watch party where futbol, community, and wellness come together with a live DJ, games, soccer-themed face painting, cotton candy, popcorn, and aguas frescas. Your registration helps us keep creating safe, supportive spaces for our community to move, recharge, and grow together.',
    'https://www.zeffy.com/en-US/ticketing/lsp-world-cup-watch-party',
    'Save Your Spot',
    'event_registration_start',
    'zeffy',
    'world_cup_ticketing',
    true,
    false,
    array['Watch Party', '$10', 'Community'],
    10
  ),
  (
    'dia-del-nino-kids-day',
    'Kids Day at LSP',
    '/images/dia-del-nino-kids-day-en.png',
    'aspect-[4/5]',
    'h-full w-full object-contain',
    'Sunday, June 14',
    '1:00 PM - 4:15 PM',
    '2026-06-14',
    '2026-06-14',
    'LSP Studio',
    '949 W 16th St, Chicago, IL',
    'Celebrate Kids Day at LSP with four free movement, play, and wellness classes grouped by age. Each registration includes a free yoga class and goody bag.',
    'https://www.zeffy.com/en-US/ticketing/lsp-dia-del-nino-kids-day',
    null,
    null,
    null,
    null,
    true,
    false,
    array['Free', 'Kids', 'Wellness'],
    20
  ),
  (
    'monday-miles',
    'Monday Miles — Community Run & Walk',
    '/images/monday-miles-runner.png',
    null,
    null,
    'Every Monday',
    '6:30 PM',
    null,
    null,
    'LSP Studio Cafe',
    'Pilsen, Chicago, IL',
    'Mondays just got better! Meet in the cafe, warm up together, and head out. Walk 1 mile or jog/run 2 — you set the pace. All levels welcome. Movement is medicine, and it''s better in community.',
    '/schedule',
    null,
    null,
    null,
    null,
    true,
    true,
    array['Free', 'All Levels', 'Weekly'],
    30
  )
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
