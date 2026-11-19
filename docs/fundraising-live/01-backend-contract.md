# 01. Live fundraising view: backend contract

A mirror of every Zeffy campaign, payment and contact, kept current by the existing
`zeffy-webhook` edge function, plus one RPC the dashboard reads.

Applied migrations (production, ledgered 2026-11-18):

- `supabase/migrations/20261118120000_zeffy_mirror.sql`: mirror tables, RLS, realtime, one new
  nullable column `giving_webhook_events.mirror_outcome`.
- `supabase/migrations/20261118120100_fundraising_live.sql`: view `zeffy_gifts`, RPC `fundraising_live`.
- `supabase/migrations/20261118120200_fundraising_donations_all.sql`: view `fundraising_donations_all`;
  `fundraising_donor_summary` and `fundraising_campaign_summary` now read it (section 7).
- `supabase/migrations/20261118120300_fundraising_donations_all_mirror_only.sql`: the view is now built
  from the mirror alone, and `fundraising_live` no longer reads the import (section 7, "Current").

**The `giving-zeffy-reconcile` cron job must stay scheduled after Giving Tuesday.** It is the mirror's
sync, and the donor CRM now reads the mirror. Ignore the "remove mid-January" step in the Giving
Tuesday runbook.

Edge function: `supabase/functions/zeffy-webhook/` (new files `mirror.ts`, `mirror_logic.ts`,
`zeffy_client.ts`, `mirror_test.ts`; `handlers.ts` calls them). Deployed as version 8, JWT verification OFF
(same as before):

```sh
SUPABASE_ACCESS_TOKEN=<keychain token> supabase functions deploy zeffy-webhook \
  --project-ref jcseaxtvsozylsbmykka --no-verify-jwt --use-api
```

Tests: copy the folder outside the repo (the site's package.json breaks jsr resolution), then
`deno test --allow-env --allow-net` (50 tests: the 26 giving tests unchanged, 24 mirror tests).

Anything not written here is not promised. The Giving Tuesday contract
(`docs/giving-tuesday-2026/01-backend-contract.md`) is unchanged.

---

## 1. Tables

All money is integer cents. RLS on; anon has nothing; `authenticated` has SELECT only, and the
policy is `app_private.has_module('fundraising')` (same as `fundraising_donations`); only the
service role (the edge function) writes.

| Table | Key | What |
|---|---|---|
| `zeffy_campaigns` | `id` | Every Zeffy form (110 on 2026-11-18): `title, url, category, type, status, goal_cents, volume_cents` (Zeffy's raised total), `is_archived, start_date, end_date, zeffy_created_at, zeffy_updated_at, zeffy_deleted_at, raw, synced_at`. |
| `zeffy_payments` | `id` | Every payment: `created_at, amount_cents, refunded_cents, net_cents` (generated), `charged_cents` (Zeffy `amount`), `status, refund_status, campaign_id, parent_campaign_id, campaign_category, campaign_type, payment_type` (online/manual), `team_id, contact_id, buyer_email` (lower case), `buyer_first_name, buyer_last_name, items, raw, deleted_at, synced_at`. Indexed on `created_at`, `lower(buyer_email)`, `campaign_id`, `parent_campaign_id`, `contact_id`. In `supabase_realtime`. |
| `zeffy_contacts` | `id` | Every contact: `email` (lower case), `first_name, last_name, phone, company_name, donor_type` (Prospect/OneTime/Returning), `total_contribution_cents, donation_count, first_donation_at, last_donation_at` (Zeffy's own figures), `zeffy_created_at, zeffy_updated_at, raw, deleted_at, synced_at`. |
| `zeffy_sync_state` | `key` | One row per job: `reconcile`, `campaigns`, `payments_backfill`, `contacts_sync`. Columns `cursor, done, counters, started_at, completed_at, last_run_at, last_result`. |

View `zeffy_gifts` (security_invoker): the counted gifts. A payment counts when
`status = 'succeeded'`, `deleted_at is null`, `net_cents > 0` and `charged_cents > 0`.

Money rules:

- `amount_cents` and `refunded_cents` use the giving sync's own `giftCents` / `refundedCents`
  (`logic.ts`), so the two systems agree to the cent: sum of `donation`, `additional_donation`
  and `ticket` items, capped at `amount`; full refund or lost dispute refunds the whole gift.
  Verified on all 9,036 payments: Zeffy `amount` never exceeds the item sum, so `amount` does
  not carry the optional tip.
- `charged_cents > 0` leaves out payments that charged nothing: 100%-discount checkouts and
  manual entries with payment method "free" (78 payments, mostly comped 2025 gala tickets).
  `giftCents` falls back to the items' list price when `amount` is 0, which would count
  $16,990 that was never paid. The legacy export counts these at $0 too.

## 2. Edge function modes

All `POST https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/zeffy-webhook?mode=...`, authorised
like reconcile (`x-giving-cron-secret`, or a dashboard user for whom `giving_can_manage()` is true).
Without `ZEFFY_API_KEY` each answers `{ok: false, reason: "no_api_key"}` (200); otherwise 401 `unauthorized`.

| Mode | Does | Answers |
|---|---|---|
| `reconcile` (cron, 5 min) | Unchanged giving work, then upserts every payment it listed into `zeffy_payments` (one DB call per page) and refreshes all campaigns when the list is older than 15 min or a listed payment is newer than the last refresh. With no active giving drive it still lists the last 7 days for the mirror. | The giving fields as before, plus `mirror: {payments, deleted, campaigns: null \| {fetched, pages, complete}, errors: [], api_calls}`. |
| `backfill` | Next pages of the full payment history, newest first, cursor in `zeffy_sync_state.payments_backfill`. At most `pages` pages (default 40, max 60) or 60 s per call; state saved after every page. `&restart=1` starts over. | `{ok, kind, done, pages, rows, total_pages, total_rows, oldest, newest, api_calls, last_status}`, or `{ok, done: true, note: "already_complete"}`. |
| `contacts` | Same runner for `/contacts` (`contacts_sync`). | Same shape. |
| `campaigns` | Full campaign list refresh. | `{ok, fetched, pages, complete, api_calls}`. |
| `shape` | Field names and types of `/payments`, `/contacts`, `/campaigns` (and whether `GET /<x>/{id}` works). Never values. | `{ok, shapes, api_calls}`. |
| `check` | Unchanged. | Unchanged. |

API cost: a normal reconcile run is 1 call (it was 1 before), plus 2 calls when campaigns refresh.

Webhook additions (signature check, idempotency and giving outcomes unchanged):

- `payment.*`: after the giving step, the payment is upserted into (or soft-deleted from) the
  mirror. Best effort: a mirror failure is logged without data, leaves `mirror_outcome` null and
  never changes the response; the next reconcile repairs it.
- `contact.created` / `contact.updated`: upserted from the payload when it carries the contact,
  otherwise refetched with `GET /contacts/{id}` (404 soft-deletes). No key, or the key cannot read
  contacts: `deferred` (200). `contact.deleted`: soft-deleted. `mirror_outcome = contact_<outcome>`.
- Any other type: 200, logged with outcome `ignored`.
- `giving_webhook_events.mirror_outcome`: `upserted`, `deleted`, `absent`, `contact_processed`,
  `contact_deleted`, `contact_deferred`, `contact_ignored`, or null.

## 3. `fundraising_live(p_tz text default 'America/Chicago')`

`supabase.rpc('fundraising_live', { p_tz: 'America/Chicago' })`. Security invoker, so RLS applies, and
it checks the module first: without it, `{ok: false, reason: "forbidden"}`. Anon cannot execute it.
An invalid time zone falls back to America/Chicago. About 150 ms on current data.

Rules: money and counts come from `zeffy_gifts` (net of refunds, tip excluded, zero-charge left out).
Days, months and years are local dates in `p_tz`. Campaigns roll peer-to-peer participant pages up to
`parent_campaign_id`. Donors are grouped by lower-case email (gifts without an email are left out of
donor figures, kept in totals). Donor history uses the mirror alone since migration
20261118120300 (`legacy_used_before` is always null); the archived import is not read.

Periods: `today`; `last_7_days` = today and the 6 days before; `month_to_date`; `year_to_date`;
`prior_year_same_period` = Jan 1 last year to today's date last year; `prior_year_total` = last calendar
year; `last_12_months` = local dates after today minus one year. `monthly` = 13 months, oldest first,
zero-filled. `campaigns` = active (not archived, not deleted) or any gift in the last 12 months, sorted
by `raised_ytd_cents` desc; `raised_cents` is Zeffy's `volume` (all time, Zeffy's own figure).
`donors.new_donors_ytd` = first ever gift (mirror or legacy) this year; `returning_donors_ytd` = gave
this year and before; `repeat_donors_ytd` = 2+ gifts this year; `lapsed_count` = gave last calendar
year, nothing this year. `lapsed` = top 100 of those by last-year total. `top_donors_ytd` = top 25.

Real output on 2026-11-18, lists cut to one item and names/emails replaced:

```json
{
  "ok": true,
  "tz": "America/Chicago",
  "today": "2026-11-18",
  "generated_at": "2026-11-19T00:32:16.501128+00:00",
  "synced_at": "2026-11-19T00:30:02.075+00:00",
  "history_from": "2025-07-18T15:32:29+00:00",
  "legacy_used_before": "2025-07-18",
  "sync": {
    "reconcile_last_run_at": "2026-11-19T00:30:02.075+00:00",
    "campaigns_last_run_at": "2026-11-19T00:26:43.141+00:00",
    "backfill_done": true, "backfill_completed_at": "2026-11-19T00:28:19.929+00:00",
    "contacts_done": true, "contacts_completed_at": "2026-11-19T00:29:09.442+00:00",
    "last_payment_synced_at": "2026-11-19T00:30:01.928+00:00"
  },
  "totals": {
    "today":                  {"amount_cents": 0,        "gift_count": 0},
    "last_7_days":            {"amount_cents": 60000,    "gift_count": 1},
    "month_to_date":          {"amount_cents": 130250,   "gift_count": 23},
    "year_to_date":           {"amount_cents": 10404427, "gift_count": 1684},
    "prior_year_same_period": {"amount_cents": 3339047,  "gift_count": 1725},
    "prior_year_total":       {"amount_cents": 6303038,  "gift_count": 1941},
    "last_12_months":         {"amount_cents": 13368418, "gift_count": 1900}
  },
  "monthly": [{"month": "2026-11", "amount_cents": 130250, "gift_count": 23}],
  "campaigns": [{
    "id": "754fa166-3b1d-4f60-a48e-9dde6255d690", "title": "LSP 2026 Gala @ MCA Chicago",
    "url": "https://www.zeffy.com/ticketing/lsp-museum-of-contemporary-art-chicago-2026-gala",
    "category": "Event", "status": "active", "goal_cents": null, "raised_cents": 4595000,
    "raised_ytd_cents": 4595000, "gifts_ytd": 83, "last_gift_at": "2026-09-26T03:09:29+00:00"
  }],
  "by_category_ytd": [
    {"category": "event", "amount_cents": 6959677, "gift_count": 1359},
    {"category": "donation", "amount_cents": 2768350, "gift_count": 254},
    {"category": "auction", "amount_cents": 377000, "gift_count": 8},
    {"category": "shop", "amount_cents": 299400, "gift_count": 63}
  ],
  "donors": {"donors_ytd": 1123, "new_donors_ytd": 960, "returning_donors_ytd": 163,
             "repeat_donors_ytd": 229, "lapsed_count": 818},
  "recent": [{
    "id": "pay_xxx", "created_at": "2026-11-17T08:40:53+00:00", "amount_cents": 60000,
    "name": "Ana R.", "email": "donor0@example.com",
    "campaign_id": "698c50de-aa29-4057-a672-6dd43d2e45ec",
    "campaign_title": "Support The Latina Sweat Project", "category": "donation"
  }],
  "lapsed": [{"email": "donor0@example.com", "name": "Ana Example", "last_year_cents": 340000,
              "last_gift_at": "2025-12-30T00:59:26+00:00", "lifetime_cents": 340000}],
  "top_donors_ytd": [{"email": "donor0@example.com", "name": "Ana Example", "amount_cents": 537500,
                      "gift_count": 2, "last_gift_at": "2026-10-05T14:54:02+00:00", "lifetime_cents": 537500}]
}
```

Notes for the UI: `by_category_ytd.category` is the payment's `campaign_category` (lower case:
`event`, `donation`, `shop`, `auction`, `custom`, `raffle`), while `campaigns[].category` is the
campaign's own label (`Event`, `DonationForm`, `Shop`, `Auction`, `PeerToPeerCampaign`, ...).
`campaigns` has 107 entries today because Zeffy leaves nearly every form `active`; filter on
`gifts_ytd > 0` (68 today) for a short list. `goal_cents` is null for forms without a goal.

Live updates: subscribe to `postgres_changes` on `public.zeffy_payments` (RLS-filtered), then call the
RPC again (debounced) rather than patching numbers client side.

## 4. Runbook

Invoke a mode from SQL (same secret as the cron, never printed):

```sql
do $$ declare c text; begin
  select command into c from cron.job where jobname = 'giving-zeffy-reconcile';
  c := replace(c, 'mode=reconcile', 'mode=backfill&restart=1');  -- or contacts, campaigns, shape
  execute c;
end $$;
-- a few seconds later:
select id, status_code, left(content::text, 2000) from net._http_response order by id desc limit 1;
```

Re-run the full backfill: call `mode=backfill&restart=1` once, then `mode=backfill` until
`done: true` (about 91 pages = 3 calls today; each call is up to 40 pages, about 30 s). Same for
`mode=contacts&restart=1`. Upserts are idempotent, so re-running is always safe. Space calls about
10 s apart: Zeffy allows 100 requests a minute, shared with the cron.

Sync health:

```sql
select key, done, last_run_at, completed_at, last_result from public.zeffy_sync_state;
-- reconcile last_run_at should be under 5 minutes old; last_result.mirror.errors should be [].
select status, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'giving-zeffy-reconcile')
order by start_time desc limit 5;
select type, outcome, mirror_outcome, count(*) from public.giving_webhook_events group by 1, 2, 3;
```

The cron job is the Giving Tuesday one. The Giving Tuesday runbook says to unschedule it mid-January:
**do not remove it.** It is the mirror's only scheduled sync, and the donor CRM views read the mirror. With no
active giving drive it keeps listing the last 7 days for the mirror. If it is ever removed, the
webhook alone keeps payments and contacts current, but campaign volumes stop refreshing.

## 5. History and parity

The Zeffy API's history starts on 2025-07-18 (first payment 2025-07-18 15:32 UTC), the same day as the
legacy export. The API lists succeeded payments only.

Parity with legacy `fundraising_donations` (succeeded rows, `total_amount - refund_amount`) against
`zeffy_gifts` bucketed by Chicago date, 2025-07-18 to 2026-06-25:

| Month | Legacy $ | Legacy rows | Mirror $ | Mirror gifts |
|---|---|---|---|---|
| 2025-07 | 1,080.00 | 34 | 1,080.00 | 34 |
| 2025-08 | 4,701.00 | 734 | 4,701.00 | 734 |
| 2025-09 | 8,921.81 | 781 | 8,921.81 | 780 |
| 2025-10 | 12,711.00 | 117 | 12,711.00 | 117 |
| 2025-11 | 16,611.66 | 151 | 16,611.66 | 151 |
| 2025-12 | 19,004.91 | 125 | 19,004.91 | 125 |
| 2026-01 | 3,626.50 | 101 | 3,626.50 | 101 |
| 2026-02 | 1,640.00 | 48 | 1,640.00 | 48 |
| 2026-03 | 2,348.00 | 84 | 2,348.00 | 84 |
| 2026-04 | 2,033.00 | 74 | 2,033.00 | 74 |
| 2026-05 | 2,352.00 | 59 | 2,352.00 | 59 |
| 2026-06 | 828.00 | 36 | 858.00 | 38 |
| Total | 75,857.88 | 2,344 | 75,887.88 | 2,345 |

The top 18 campaigns by title match to the cent (gala 2025 $22,010.00 / 80, Soft Launch Classes
$9,109.00 / 1,406, Gala Fundraising $8,187.50 / 23, and so on). Differences explained:

- June: +$30 and 2 gifts on 2026-06-25, made after the export was taken that day.
- Rows vs gifts: legacy is per line item, so a payment with two paid items is two rows
  (one in September, one in "LSP X One Night Only").
- Dates: legacy `payment_date` matches Chicago dates exactly; bucketing the mirror in New Zealand
  time moves about $2,000 between months, so the export was not NZ-shifted here.
- Without the zero-charge rule the mirror would be $16,990 higher (gala 2025 comps).

Verdict: the mirror can replace the legacy table as the money source for the donor CRM views. It
matches to the cent on the legacy window, carries refunds and soft deletes, and stays current. Done in
section 7. Legacy keeps fields the API lacks per payment (phone, ticket numbers, answers),
partly available on `zeffy_contacts` and in `raw`.

## 6. Known gaps

- Refunds on older payments: the reconcile lists payments by creation date (since 14 days before the
  drive starts, or the last 7 days with no drive). A refund on an older payment arrives only through
  the `payment.updated` webhook, or a backfill restart. No webhook event has arrived yet, so the
  webhook path is tested in code only.
- Payments deleted in Zeffy are soft-deleted through the webhook (or when the giving reconcile
  refetches its own rows). A backfill restart does not detect deletions.
- `new_donors_ytd` is "new since 2025-07-18", because history starts there.
- Zeffy contact figures (`total_contribution_cents`, about $165,114 over all contacts) are Zeffy's own
  and are not used by the RPC; the mirror's own all-time net is about $167,075.
- The giving sync's `giftCents` has the same zero-charge fallback. It does not matter for Giving
  Tuesday donations, and it was left unchanged on purpose.
- `zeffy_payments` rows carry full `raw` payloads. Realtime events include them, filtered by RLS to
  fundraising-module users.

## 7. Donor CRM on live money: `fundraising_donations_all`

### Current (2026-11-18, migration 20261118120300): mirror only

The donor CRM reads the Zeffy mirror alone. `fundraising_donations` and `fundraising_imports` are an
**unread archive**: nothing reads them any more, and nothing deleted, truncated or altered them (7,781
rows still there). `fundraising_live` no longer reads them either (its `legacy_used_before` is always
null; the "first ever gift" check uses the mirror, whose history starts 2025-07-18 like the import).

`fundraising_donations_all` keeps the same columns, order and types. One row per non-deleted succeeded
mirror payment (9,036 today), never one per line item, `source = 'zeffy'` on every row:

- Charged payments: `total_amount` = gift (tip excluded), `refund_amount` = refunded part.
- Zero-charge payments (free registrations, 100% discounts, manual "free" entries; 5,398):
  `total_amount = 0`, `refund_amount = 0`. They show as activity and never as money or gifts.
- Fully refunded charged payments (13) keep `total_amount > 0` with an equal refund, as the import showed
  refunded rows. They count in `gift_count` (as the import's refunded rows did) but add $0.
- `rate_title` from item rate titles; `in_honor_of` from item tributes (`honouree_name`; none filled
  today); `fund` from payment `fund` (always null today); `note` null (the API has none: `description`
  is the form title); phone from `zeffy_contacts` by email; company from the buyer, else the contact.

Before (union) vs after (mirror only), fundraising-module user:

| | Union | Mirror only |
|---|---|---|
| Donor summary rows | 3,323 | 3,582 |
| Donors with gifts | 1,942 | 1,948 |
| `total_given` | $164,826.24 | $164,826.24 |
| `gift_count` sum | 3,576 | 3,588 |
| Campaign summary rows | 98 | 100 |
| `total_raised` | $167,074.65 | $167,074.65 |

Net per month, Jul 2025 to Nov 2026, is identical in every month (total $167,074.65). Extra donors and
campaigns are free-only registrants and forms after June, now visible as activity; the extra gifts and
6 donors are the fully refunded payments.

Lost against the import (counts are import rows): per-line-item detail (7,781 import rows vs 6,767
mirror rows up to 2026-06-25; about 1,091 extra rows came from multi-item payments), 70 Failed or
Incomplete rows (the API lists succeeded payments only), address fields on 2,279 rows (not a column of
the view; contacts keep an address in `raw`), 7,284 ticket numbers, 3,472 custom question answers,
2,861 payout dates, 1,216 tax receipt links, 74 discount codes. Import `note`, `fund` and `in_honor_of`
were empty. $0 rows: 5,386 in the import vs 4,420 mirror rows in the same window (per payment instead
of per line).

RLS: a non-module user sees 0 rows in all three views and `fundraising_live` answers `forbidden`;
anon gets permission denied. `fundraising_live` still runs with the same figures.

Rollback to the union version: re-run `20261118120200_fundraising_donations_all.sql` (view and both
summaries) and `20261118120100_fundraising_live.sql` (function, which reads the import for "first ever
gift"), as they are.

### Previous (migration 20261118120200): union with a cutover, kept for reference

View `public.fundraising_donations_all` (security_invoker; anon revoked; `authenticated` and
`service_role` SELECT). RLS of the sources applies: fundraising module only.

Columns, in order: `id` text (legacy uuid as text, or the Zeffy payment id), `source` (`import` |
`zeffy`), `email, first_name, last_name, company_name, phone, payment_date` date, `payment_time` text
(`4:51 PM` style, Chicago), `total_amount` numeric dollars, `refund_amount` numeric dollars,
`payment_status` (`Succeeded` on mirror rows), `payment_method` (mapped to the export's labels: Card,
Apple Pay / Google Pay, Tap-to-pay, ACH Direct debit), `campaign_title, campaign_link` (from
`zeffy_campaigns`, the form, else its parent), `rate_title` (distinct item rate titles, comma
separated), `fund, note, in_honor_of` (note and in_honor_of always null on mirror rows). Mirror phone
comes from `zeffy_contacts` by email; company from the buyer, else the contact.

Cutover rule: legacy rows with `payment_date < 2026-06-25`, UNION ALL mirror payments counted by
`zeffy_gifts` (succeeded, not deleted, net and charge above zero) whose Chicago date is
`>= 2026-06-25`. Day-level check: every day with money before 2026-06-25 matches legacy to the cent
and gift count; on 2026-06-25 legacy has 16 rows, all $0, while the mirror has 2 paid gifts ($30) made
in the evening, after the export. Legacy rows on or after the cutover are always excluded, so a later
xlsx re-import cannot double count.

`fundraising_donor_summary` and `fundraising_campaign_summary` keep their exact columns, order and
types; only `from public.fundraising_donations` became `from public.fundraising_donations_all`.
Readers by name (functions `sync_donor_task_activity`, `sync_outreach_assignment_owner`, the
Workspace and fundraising UI) need no change.

Behaviour change after the cutover: free ($0) registrations are not mirror gifts, so they no longer
add to `row_count`, `last_activity_date` or `campaign_count`, and donors with only free registrations
after June do not appear. The 16 $0 legacy rows dated 2026-06-25 dropped out the same way (no money).

Checked on 2026-11-18 (fundraising-module user):

| | Before | After |
|---|---|---|
| Donor summary rows | 2,749 | 3,323 |
| Donors with gifts | 1,299 | 1,942 |
| `total_given` sum | $75,841.47 | $164,826.24 |
| `gift_count` sum | 2,342 | 3,576 |
| Last gift date | 2026-06-21 | 2026-11-17 |
| Campaign summary rows | 67 | 98 |
| `total_raised` sum | $75,857.88 | $167,074.65 |

Before the cutover the union and legacy agree exactly: 7,765 rows, $75,857.88, 1,299 donors, campaign
summary identical row for row, donor summary identical in every money, count, date, phone and company
column. 17 donors differ only in `donor_name`, where one email used two name spellings on the same day
and the view's `order by payment_date` tie is not deterministic (it was not stable before either).
After: mirror rows add Jun 25 to Nov 2026 ($355 June, $18,805.76 July, $17,643.50 Aug,
$34,002.00 Sep, $19,108.01 Oct, $1,302.50 Nov to date). A non-module user sees 0 rows in all three
views; anon gets permission denied; `fundraising_live` still runs.

Rollback of the union step (restores the legacy-only views):

```sql
create or replace view public.fundraising_donor_summary with (security_invoker = on) as
select lower(email) as email,
  (array_remove(array_agg(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    order by payment_date desc nulls last), null))[1] as donor_name,
  (array_remove(array_agg(nullif(btrim(company_name), '') order by payment_date desc nulls last), null))[1] as company_name,
  (array_remove(array_agg(nullif(btrim(phone), '') order by payment_date desc nulls last), null))[1] as phone,
  sum(total_amount - refund_amount) filter (where payment_status = 'Succeeded') as total_given,
  count(*) filter (where payment_status = 'Succeeded' and total_amount > 0) as gift_count,
  min(payment_date) filter (where payment_status = 'Succeeded' and total_amount > 0) as first_gift_date,
  max(payment_date) filter (where payment_status = 'Succeeded' and total_amount > 0) as last_gift_date,
  max(payment_date) as last_activity_date,
  count(distinct campaign_title) as campaign_count,
  count(*) as row_count
from public.fundraising_donations
where email is not null and btrim(email) <> ''
group by lower(email);

create or replace view public.fundraising_campaign_summary with (security_invoker = on) as
select campaign_title,
  sum(total_amount - refund_amount) filter (where payment_status = 'Succeeded') as total_raised,
  count(*) filter (where payment_status = 'Succeeded' and total_amount > 0) as gift_count,
  count(distinct lower(email)) filter (where payment_status = 'Succeeded') as participant_count,
  min(payment_date) as first_date,
  max(payment_date) as last_date
from public.fundraising_donations
group by campaign_title;
```
