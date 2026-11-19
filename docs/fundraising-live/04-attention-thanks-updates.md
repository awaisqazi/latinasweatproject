# 04. Thank-you tracker, monthly updates, needs-attention queue: backend contract

Migration (production, ledgered 2026-11-18): `supabase/migrations/20261118150000_fundraising_attention.sql`.

Access everywhere: users with the fundraising module (admins included). Others get
`{ok:false, reason:'forbidden'}` from the jsonb RPCs, `42501` from `fundraising_mark_thanked`, and 0
rows and refused writes on the tables. `anon` has no grants. Anything not written here is not promised.

---

## 1. Thank-you tracker

### Table `public.fundraising_payment_thanks`

| column | type | notes |
| --- | --- | --- |
| `payment_id` | text pk | `zeffy_payments.id`, FK `on delete cascade` |
| `thanked_by` | uuid -> profiles | stamped from `auth.uid()` on insert and update |
| `thanked_at` | timestamptz, default now() | |
| `method` | text, null | `email`, `call`, `text`, `note`, `in_person`, `other` |
| `note` | text, null | |

Realtime: in `supabase_realtime`, replica identity full (DELETE events carry `payment_id` only).

### Queue rule

A payment is in the queue when all of these hold:

1. It is counted by `zeffy_gifts` (succeeded, not deleted, net of refunds above 0, charged above 0). A
   fully refunded gift has net 0 and drops out.
2. `zeffy_payments.campaign_category in ('donation', 'peer_to_peer')`. If a payment has no category,
   the campaign's category decides (`DonationForm` or `PeerToPeerCampaign`, from the parent campaign
   first). That leaves out `event` (tickets), `shop`, `auction`, `raffle` and `custom`.
3. `created_at` within the last `p_days` days (1 to 366, default 60).
4. No row in `fundraising_payment_thanks`.

`overdue` means `days_waiting > 7`, where `days_waiting` is today minus the gift date, both in `p_tz`.

### `fundraising_thanks_queue(p_days integer default 60, p_tz text default 'America/Chicago') returns jsonb`

```json
{
  "ok": true, "window_days": 60, "waiting_count": 193, "overdue_count": 190, "thanked_last_30_days": 0,
  "items": [{
    "payment_id": "…", "created_at": "2026-11-18T21:04:11+00:00", "amount_cents": 5000,
    "name": "First Last", "email": "donor@example.com",
    "campaign_title": "…", "category": "donation",
    "days_waiting": 0, "overdue": false,
    "donor_gift_count": 3, "donor_lifetime_cents": 25000,
    "owner_id": null
  }]
}
```

- Items are newest first, capped at 200. The counts cover the whole window, not just the 200 items.
- `name` is the full buyer name, or null.
- `donor_gift_count` and `donor_lifetime_cents` cover every gift `zeffy_gifts` counts for that email,
  any category. They are null when the gift has no email.
- `owner_id` comes from `fundraising_donor_profiles` by email, null when there is none.
- `thanked_last_30_days` counts rows with `thanked_at` in the last 30 days.

### `fundraising_mark_thanked(p_payment_ids text[], p_method text default null, p_note text default null) returns integer`

Inserts one thanks row per id and returns how many were newly marked. It is idempotent: an
already-thanked payment keeps its row and counts 0. Unknown ids are skipped. A method outside the
list raises `22023`.

```ts
const { data: n } = await supabase.rpc('fundraising_mark_thanked',
  { p_payment_ids: ids, p_method: 'email', p_note: null });
```

To un-mark: `.from('fundraising_payment_thanks').delete().in('payment_id', ids)`. To edit the method
or note: a plain `.update(...)` by `payment_id`.

## 2. Monthly subcommittee updates

### Table `public.fundraising_updates`

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `subcommittee` | text | `events`, `grants`, `donors`, `upskilling` |
| `month` | date | must be the 1st of the month (check; else `23514`) |
| `body` | text | 1 to 2000 characters after trimming (check; else `23514`) |
| `author_id` | uuid -> profiles | stamped from `auth.uid()` on insert and update (last writer) |
| `created_at`, `updated_at` | timestamptz | `updated_at` via `set_updated_at` trigger |

Unique `(subcommittee, month)`; a second insert raises `23505`. Use
`.upsert({ subcommittee, month, body }, { onConflict: 'subcommittee,month' })`. That works here
because the constraint is a real one, not a partial index. Realtime: in `supabase_realtime`, replica
identity full.

## 3. Needs-attention queue

### `fundraising_attention(p_tz text default 'America/Chicago') returns jsonb`

```
{ ok, generated_at, today, cycle, items: [{ kind, subcommittee, count, title, detail, due_on, target }] }
```

`today` (local date) and `cycle` (the worksheet cycle used) are extra keys beyond the brief.

- `subcommittee`: one of the four ids, or null.
- `count`: a number for count kinds, null for kinds that list one thing each.
- `due_on`: a date or null.
- `target`: `{ tab, subtab?, id? }`.
- A kind with nothing to act on is omitted.

| kind | subcommittee | one item per | rule | target |
| --- | --- | --- | --- | --- |
| `grant_deadline` | grants | prospect | `stage not in ('Declined','Received')` and `next_action_date <= today + 30` (overdue included); soonest first, cap 10; title = name, detail = `next_action` | `{tab:'grants', subtab:'pipeline', id}` |
| `sync_stale` | null | one item | `fundraising_live.synced_at` null or older than 30 minutes | `{tab:'overview'}` |
| `thanks_overdue` | donors | one item | `fundraising_thanks_queue(60).overdue_count > 0` | `{tab:'donors', subtab:'thanks'}` |
| `fundraisers_pending` | events | one item | `giving_fundraisers.status = 'pending'` on a giving campaign that is active: not ended (`ends_at > now()`) and either `signup_open` or `starts_at <= now()` | `{tab:'events', subtab:'giving'}` |
| `outreach_to_contact` | donors | one item | `fundraising_outreach_items.status = 'to_contact'` on campaigns with `status = 'active'` | `{tab:'donors', subtab:'outreach'}` |
| `lapsed_no_owner` | donors | one item | the first 25 of `fundraising_live.lapsed` (same definition and order) with no `owner_id` in `fundraising_donor_profiles` | `{tab:'donors', subtab:'lapsed'}` |
| `update_missing` | the id | subcommittee | from the 20th of the month (local), no `fundraising_updates` row for this month | `{tab:<id>}` |
| `worksheet_not_sized` | the id | subcommittee | `filled = false` in `fundraising_goal_rollup(cycle)`; cycle = smallest year key in `app_settings.fundraising_goals` at or after this year, else next year | `{tab:<id>, subtab:'worksheet'}` |

Order:

1. Items whose `due_on` is past, oldest first.
2. Items with a future `due_on`, soonest first.
3. The rest in kind order: `sync_stale`, `thanks_overdue`, `fundraisers_pending`,
   `outreach_to_contact`, `lapsed_no_owner`, `update_missing`, `worksheet_not_sized`. Within a kind,
   subcommittees go events, grants, donors, upskilling.

The RPC calls `fundraising_live` and `fundraising_thanks_queue` internally, so it costs about as much
as one `fundraising_live` call. Refresh it on the same realtime events, debounced.

Real output on 2026-11-18, trimmed to 6 of 17 items, with names, actions and ids replaced:

```json
{
  "ok": true, "generated_at": "2026-11-19T02:01:32.516555+00:00", "today": "2026-11-18", "cycle": "2027",
  "items": [
    { "kind": "grant_deadline", "subcommittee": "grants", "count": null, "title": "<Prospect 1>",
      "detail": "<next action>", "due_on": "2026-07-29",
      "target": { "tab": "grants", "subtab": "pipeline", "id": "<prospect-uuid-1>" } },
    { "kind": "grant_deadline", "subcommittee": "grants", "count": null, "title": "<Prospect 2>",
      "detail": "<next action>", "due_on": "2026-07-29",
      "target": { "tab": "grants", "subtab": "pipeline", "id": "<prospect-uuid-2>" } },
    { "kind": "thanks_overdue", "subcommittee": "donors", "count": 190,
      "title": "190 gifts waiting over a week for a thank-you",
      "detail": "Thank donors within 7 days of their gift.", "due_on": null,
      "target": { "tab": "donors", "subtab": "thanks" } },
    { "kind": "fundraisers_pending", "subcommittee": "events", "count": 9,
      "title": "9 fundraiser sign-ups to approve", "detail": "<giving campaign title>", "due_on": null,
      "target": { "tab": "events", "subtab": "giving" } },
    { "kind": "lapsed_no_owner", "subcommittee": "donors", "count": 3,
      "title": "3 lapsed donors have no owner",
      "detail": "Among the top 25 who gave last year but not yet this year.", "due_on": null,
      "target": { "tab": "donors", "subtab": "lapsed" } },
    { "kind": "worksheet_not_sized", "subcommittee": "events", "count": null,
      "title": "Events worksheet not sized for 2027",
      "detail": "Add a realistic amount in Size your share.", "due_on": null,
      "target": { "tab": "events", "subtab": "worksheet" } }
  ]
}
```

Titles and details are plain English with no em-dashes; the UI may show them as they are.
