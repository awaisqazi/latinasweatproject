-- 2026 Junior Board election.
-- Archives the 2025 election as historical data (rows are never deleted) and
-- opens a new current election, closed until the board schedules it.
-- The ballot now collects the voter's name + affiliation and requires an
-- acknowledgment that they watched/read the candidate speeches, so cast_vote
-- gains three parameters. The previously deployed public site mounts no
-- ballot, so replacing the RPC signature has no live callers.

-- 1. Ballot metadata columns on the vote rows.
alter table public.election_votes
  add column if not exists voter_name text,
  add column if not exists affiliation text,
  add column if not exists speeches_acknowledged boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.election_votes'::regclass
      and conname = 'election_votes_voter_name_check'
  ) then
    alter table public.election_votes
      add constraint election_votes_voter_name_check
      check (voter_name is null or char_length(voter_name) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.election_votes'::regclass
      and conname = 'election_votes_affiliation_check'
  ) then
    alter table public.election_votes
      add constraint election_votes_affiliation_check
      check (
        affiliation is null or affiliation in (
          'instructor', 'ytt-student', 'board-member', 'community-member'
        )
      );
  end if;
end
$$;

-- 2. Archive the 2025 election, then stand up the 2026 one.
-- Order matters: elections_one_current is a partial unique index on
-- (is_current) where is_current, so the old row has to be flipped to false
-- before a new current row can be inserted.
-- The name predicate makes this a no-op on re-run and guarantees a row
-- already named '2026 Junior Board Elections' is never touched.
update public.elections
set
  name = '2025 Junior Board Elections',
  is_current = false,
  override = 'closed'
where name = 'LSP Board Elections'
  and is_current;

insert into public.elections (name, is_current, override, opens_at, closes_at)
select '2026 Junior Board Elections', true, 'closed', null, null
where not exists (select 1 from public.elections where is_current);

-- 3. Public voting RPC: name + affiliation + speeches acknowledgment.
-- get_voting_status() and has_voted() key off is_current and keep working
-- against the new election untouched.
drop function if exists public.cast_vote(text, text, text, text, text);

create or replace function public.cast_vote(
  p_email text,
  p_name text,
  p_affiliation text,
  p_president text,
  p_vice_president text,
  p_treasurer text,
  p_secretary text,
  p_speeches_acknowledged boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  election_record record;
  status jsonb;
  clean_name text;
begin
  status := public.get_voting_status();

  if not coalesce((status ->> 'open')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if not coalesce(p_speeches_acknowledged, false) then
    return jsonb_build_object('ok', false, 'reason', 'acknowledgment_required');
  end if;

  clean_name := btrim(coalesce(p_name, ''));

  if char_length(clean_name) < 1
    or char_length(clean_name) > 120
    or p_affiliation is null
    or p_affiliation not in (
      'instructor', 'ytt-student', 'board-member', 'community-member'
    )
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select * into election_record
  from public.elections
  where is_current
  limit 1;

  insert into public.election_votes (
    election_id, email, voter_name, affiliation, speeches_acknowledged,
    president, vice_president, treasurer, secretary
  )
  values (
    election_record.id,
    lower(btrim(p_email)),
    clean_name,
    p_affiliation,
    true,
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

revoke all on function public.cast_vote(
  text, text, text, text, text, text, text, boolean
) from public;
grant execute on function public.cast_vote(
  text, text, text, text, text, text, text, boolean
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
