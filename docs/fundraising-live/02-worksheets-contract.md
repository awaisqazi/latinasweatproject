# 02. Fundraising board worksheets: backend contract

Each subcommittee's getting-started worksheet (take stock, research, size your share, what you
need), stored in Supabase so the board can add up the numbers against the 2027 goal.

Applied migration (production, ledgered 2026-11-18):
`supabase/migrations/20261118130000_fundraising_worksheets.sql`.

Anything not written here is not promised.

---

## 1. Table `public.fundraising_worksheet_rows`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `cycle` | text, default `'2027'` | |
| `subcommittee` | text | `events`, `grants`, `donors`, `upskilling` (check constraint) |
| `section` | text | free text; the rollup reads `size_share` |
| `row_key` | text, nullable | stable key for fixed rows (`low`, `gala-2026`); null for rows a user adds |
| `position` | integer, default 0 | display order inside a section |
| `data` | jsonb object, default `{}` | the row's fields |
| `created_by`, `updated_by` | uuid -> profiles | stamped from `auth.uid()` by trigger; clients need not send them |
| `created_at`, `updated_at` | timestamptz | `updated_at` kept current by trigger |

Indexes: unique partial `(cycle, subcommittee, section, row_key) where row_key is not null`;
`(cycle, subcommittee, section, position)`.

Access: RLS on. Users with the fundraising module (admins included, via
`app_private.has_module('fundraising')`) can select, insert, update and delete every row. A signed-in
user without the module sees 0 rows and every write is refused. `anon` has no grants at all.

## 2. Row model

- **Fixed rows** (seeded by the UI, e.g. `size_share` / `low`): identified by
  `(cycle, subcommittee, section, row_key)`. At most one per key. The UI does not need to pre-create
  them: the first save creates the row.
- **Added rows** (a user clicks "add"): `row_key` null, identified by `id`. `position` orders them.
  The UI may generate the uuid client-side and send it as `id` for optimistic rendering.

## 3. Save path: use the RPC, not `.upsert`

`supabase-js` `.upsert(rows, { onConflict: 'cycle,subcommittee,section,row_key' })` **does not work**:
PostgREST emits `ON CONFLICT (...)` without the index predicate and Postgres answers
`42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`
(verified over HTTP against production).

```ts
const { data: row, error } = await supabase.rpc('fundraising_worksheet_save', {
  p_row: { cycle: '2027', subcommittee: 'events', section: 'size_share', row_key: 'realistic',
           data: { amount: '$25,000' } },
});
// row: one fundraising_worksheet_rows record (plain object, all columns)
```

`public.fundraising_worksheet_save(p_row jsonb) returns public.fundraising_worksheet_rows`

`p_row` keys: `id`, `cycle` (default `'2027'`), `subcommittee`, `section`, `row_key`, `position`, `data`.

| p_row has | does |
| --- | --- |
| `id` of an existing row | updates that row: `data` shallow-merged, `position` changed only if sent |
| `id` that does not exist | inserts a new row with that id (needs `subcommittee`, `section`) |
| `row_key`, no `id` | upserts the fixed row by key: `data` merged, `position` only if sent (0 on create) |
| neither | inserts an added row; `position` defaults to the end of the section |

- `data` is **shallow-merged** into the stored object, so two people editing different fields of the
  same row do not overwrite each other. Send a field as `null` to clear it. To replace the whole
  object, use a plain `.update({ data }).eq('id', id)`.
- Errors: `42501 forbidden` without the module; `22023` when `data` is not an object or
  `subcommittee`/`section` is missing for an insert; `23514` for an unknown subcommittee.

Other operations use plain PostgREST:

- read: `.from('fundraising_worksheet_rows').select('*').eq('cycle','2027').order('position')`
- delete an added row: `.delete().eq('id', id)`
- update by id (full replace of `data`): `.update({ data, position }).eq('id', id)`

## 4. Rollup RPC

`public.fundraising_goal_rollup(p_cycle text default '2027') returns jsonb`; security invoker,
`{ ok: false, reason: 'forbidden' }` without the module, not executable by `anon`.

- `goal_cents`: `app_settings.fundraising_goals` (stored as jsonb object `{"2027": 100000000}`),
  key = cycle. Null if the setting or the year is missing or unreadable.
- `events`, `grants`, `donors`: rows `section = 'size_share'`, `row_key` in `low`/`realistic`/`stretch`,
  `data.amount` read as **dollars** and returned as cents. `$`, commas and spaces are stripped; anything
  else unparseable (`''`, null, `abc`) is null. `filled` = realistic present.
- `upskilling`: amounts always null. `filled` = any measure has a realistic value.
- `people`: `upskilling` rows `section = 'size_share'`, `row_key` in `people_trained`, `made_ask`,
  `introductions`, `employer_matches`; `data.low|realistic|stretch` numeric (numeric strings accepted).
  All four keys always present.
- `updated_at`: latest `updated_at` over all of that subcommittee's rows in the cycle (any section);
  null when it has none.
- `totals`: sum of the three dollar subcommittees, missing values as 0.
- `subcommittees` always lists all four, in order events, grants, donors, upskilling.

Sample (from the verification run, cycle `ztest`: events low `"$12,500"`, realistic `"12500.50"`,
stretch `""`; grants realistic `null`, low `"abc"`; donors realistic `7500`; upskilling
people_trained `{low:5, realistic:10, stretch:"15"}`, made_ask `{low:1}`):

```json
{
  "ok": true, "cycle": "ztest", "goal_cents": null,
  "subcommittees": [
    { "id": "events", "low_cents": 1250000, "realistic_cents": 1250050, "stretch_cents": null, "filled": true, "updated_at": "2026-11-19T01:42:59.305177+00:00" },
    { "id": "grants", "low_cents": null, "realistic_cents": null, "stretch_cents": null, "filled": false, "updated_at": "2026-11-19T01:42:59.305177+00:00" },
    { "id": "donors", "low_cents": null, "realistic_cents": 750000, "stretch_cents": null, "filled": true, "updated_at": "2026-11-19T01:42:59.305177+00:00" },
    { "id": "upskilling", "low_cents": null, "realistic_cents": null, "stretch_cents": null, "filled": true, "updated_at": "2026-11-19T01:42:59.305177+00:00" }
  ],
  "totals": { "low_cents": 1250000, "realistic_cents": 2000050, "stretch_cents": 0 },
  "people": {
    "people_trained":   { "low": 5,    "realistic": 10,   "stretch": 15 },
    "made_ask":         { "low": 1,    "realistic": null, "stretch": null },
    "introductions":    { "low": null, "realistic": null, "stretch": null },
    "employer_matches": { "low": null, "realistic": null, "stretch": null }
  }
}
```

With no rows, `fundraising_goal_rollup()` returns `goal_cents: 100000000`, zero totals, all
amounts and `updated_at` null, all `filled` false.

## 5. Realtime

The table is in the `supabase_realtime` publication with `replica identity full`. Subscribe with
`postgres_changes` on `public.fundraising_worksheet_rows` (filter e.g. `cycle=eq.2027`). Events are
RLS-filtered per subscriber. INSERT and UPDATE carry the full new row (UPDATE also the old row);
DELETE carries only `id` (Supabase does not send old values for RLS tables), so remove by id. After
any event, re-call `fundraising_goal_rollup` for the totals.

## 6. Resetting a worksheet

Signed-in module user, or SQL:

```sql
delete from public.fundraising_worksheet_rows where cycle = '2027' and subcommittee = 'events';
-- one section only: add  and section = 'size_share'
```

The table was left empty after verification.
