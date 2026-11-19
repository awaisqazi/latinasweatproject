# 03. Grant phases: backend contract

Migration (production, ledgered 2026-11-18): `supabase/migrations/20261118140000_grant_phases.sql`.

## Phases

`fundraising_prospects.stage` is checked against, in order:

`Prospecting`, `Viable`, `Drafted`, `Submitted`, `Committed`, `Received`, `Declined`

The default is `Prospecting`. Old names (`Research`, `Outreach`, ...) are rejected with `23514`.
`Declined` keeps its meaning: the Workspace sync completes the owner's card on Declined and recreates
it when a prospect leaves Declined (`app_private.sync_fundraising_prospect_workspace`, unchanged).
The activity log writes "Moved from X to Y." with the new names.

Relabel of existing rows (same transaction, prospect triggers disabled for the relabel only, so it
wrote no activity entries, left `updated_at` alone and changed no Workspace cards):

| old | new | before | after |
| --- | --- | --- | --- |
| Research | Prospecting | 80 | 80 |
| Outreach | Viable | 3 | |
| In Conversation | Viable | 1 | 4 (Viable total) |
| Application | Drafted | 0 | 0 |
| Committed | Committed | 0 | 0 |
| Stewardship | Received | 0 | 0 |
| Declined | Declined | 0 | 0 |

Checked: every non-stage column is byte-identical before and after (row fingerprint), and
`workspace_tasks` (413 rows, 186 open, fundraising cards fingerprint) and `fundraising_interactions`
(260) are unchanged.

## Columns

| column | type | notes |
| --- | --- | --- |
| `ask_amount` | numeric(12,2), null | dollars; not backfilled from `suggested_ask` (free text stays) |
| `committed_amount` | numeric(12,2), null | dollars |
| `committed_on` | date, null | stamped on entry to Committed or Received if null |
| `received_on` | date, null | stamped on entry to Received if null |

Trigger `stamp_fundraising_prospect_phase_dates` (before insert or update): when the stage changes to
(or a row is inserted in) `Committed` or `Received` and `committed_on` is null, it sets today's
America/Chicago date; same for `received_on` on `Received`. A date the client sends is never
overwritten. Moving back out of those phases leaves amounts and dates alone; the counting rule
ignores them.

## Counting rule

A grant counts toward fundraising totals when `stage in ('Committed','Received')` and
`committed_amount` is not null, in the calendar year of `committed_on`. View
`public.fundraising_grants_committed` (security invoker, anon revoked; module users only via
prospect RLS): `id, name, kind, stage, committed_amount, committed_on, received_on`.

Used by:

- `fundraising_live(p_tz)` -> top-level `grants` block (shape in `01-backend-contract.md`, section 3a).
  Not added to the Zeffy totals.
- `fundraising_goal_rollup(p_cycle)` -> new key `grants_committed_cents` (counted grants with
  `committed_on` in the cycle year; 0 when none; null if the cycle is not a 4-digit year). Everything
  else in the rollup is unchanged.

## Rollback SQL (stage relabel)

Restores the old vocabulary. `Viable` maps back to `Outreach` except the one row that was
`In Conversation`. Rows moved to `Submitted` after the migration have no old equivalent; this maps them
to `Application`. Drop the new trigger first so it cannot stamp dates.

```sql
begin;
drop trigger if exists stamp_fundraising_prospect_phase_dates on public.fundraising_prospects;
alter table public.fundraising_prospects drop constraint fundraising_prospects_stage_check;
alter table public.fundraising_prospects disable trigger log_fundraising_prospect_activity;
alter table public.fundraising_prospects disable trigger set_fundraising_prospects_updated_at;
alter table public.fundraising_prospects disable trigger sync_fundraising_prospect_workspace;
update public.fundraising_prospects set stage = case
  when id = '8fbc1e47-1ab5-4f26-8206-7a923e9d7c93' and stage = 'Viable' then 'In Conversation'
  when stage = 'Prospecting' then 'Research'
  when stage = 'Viable' then 'Outreach'
  when stage in ('Drafted', 'Submitted') then 'Application'
  when stage = 'Received' then 'Stewardship'
  else stage end
where stage in ('Prospecting', 'Viable', 'Drafted', 'Submitted', 'Received');
alter table public.fundraising_prospects enable trigger log_fundraising_prospect_activity;
alter table public.fundraising_prospects enable trigger set_fundraising_prospects_updated_at;
alter table public.fundraising_prospects enable trigger sync_fundraising_prospect_workspace;
alter table public.fundraising_prospects alter column stage set default 'Research';
alter table public.fundraising_prospects add constraint fundraising_prospects_stage_check check (
  stage in ('Research', 'Outreach', 'In Conversation', 'Application', 'Committed', 'Stewardship', 'Declined'));
commit;
```

The new columns, view and the `grants` / `grants_committed_cents` keys can stay after a rollback
(the view would count `Committed` and `Stewardship` only if its filter is edited to match).
