# 01. Giving Tuesday 2026 backend contract

Applied migrations (production, ledgered):

- `supabase/migrations/20261117180000_giving_campaigns.sql`: tables, view, RPCs, seed.
- `supabase/migrations/20261117180100_giving_reconcile_cron.sql`: pg_cron job.
- `supabase/migrations/20261117180200_giving_can_manage_revoke_anon.sql`: grant fix.

Edge functions: `supabase/functions/giving-signup/`, `supabase/functions/zeffy-webhook/`.
Tests: `deno test --allow-env --no-config supabase/functions/giving-signup supabase/functions/zeffy-webhook`
(run with `DENO_NO_PACKAGE_JSON=1` so Deno ignores the site's package.json).

Anything not written here is not promised.

---

## 1. `giving_public(p_campaign text)` (anon, aggregates only)

`POST /rest/v1/rpc/giving_public` with the publishable key, body `{"p_campaign": "giving-tuesday-2026"}`.

```jsonc
{
  "ok": true,
  "campaign": {
    "slug": "giving-tuesday-2026",
    "title": "LSP Giving Tuesday",
    "goal_cents": 1500000,
    "threshold_cents": 15000,
    "starts_at": "2026-11-19T06:00:00Z",   // UTC, always "Z"
    "ends_at": "2026-12-02T05:59:59Z",
    "give_url": null,                      // main Zeffy page, or null
    "prize_label": null,
    "board_open": true,
    "signup_open": true
  },
  "total_cents": 0,         // every counted gift: main page, participant pages, offline
  "gift_count": 0,
  "fundraiser_count": 0,    // approved fundraisers, shown or not
  "reached_count": 0,       // approved fundraisers whose eligible total >= threshold
  "fundraisers": [          // approved + show_on_board, only while board_open
    {"slug": "first-last", "name": "First Last", "cohort": "instructor",
     "avatar": "first-last", "why": null, "raised_cents": 0, "gift_count": 0,
     "goal_cents": 15000, "reached": false, "give_url": null}
  ],
  "turnstile_site_key": "0x...",
  "server_time": "2026-11-17T18:00:00Z"
}
```

Unknown slug or `is_public = false`: `{"ok": false, "reason": "not_found"}` (HTTP 200).

Counting rules:

- A gift counts when `status` is `'succeeded'` or `'pending'`. Pending is a bank transfer (ACH) that has
  not cleared yet: Zeffy shows it on the thermometer right away, so the site does too. If the transfer
  fails, the next sync changes its status and it drops out of every total, including `reached`.
  Its value is `greatest(amount_cents - refunded_cents, 0)`.
  `gift_count` counts gifts with a value above zero (a fully refunded gift drops out).
- `amount_cents` is the gift without the optional Zeffy tip: the sync takes the sum of the payment's
  `donation`, `additional_donation` and `ticket` line items, capped at `amount` (the spec does not say
  whether `amount` carries the tip, and the tip is never a line item). With no items it falls back to `amount`.
- Refunds: `refund_status = 'full'` or a lost dispute refunds the whole gift; otherwise the sum of
  succeeded refunds, capped at the gift.
- `raised_cents`: everything credited to the fundraiser. `reached` uses the ELIGIBLE total, which
  leaves out gifts whose buyer email equals the fundraiser's email (case-insensitive), gifts with
  `counts_toward_threshold = false`, and gifts paid after `ends_at`.
- `cohort` is `instructor`, `ytt-2026` or `both`. `avatar` is the photo slug
  (`images/popup/instructors/<avatar>.webp`) or null. `give_url` on a fundraiser is their `zeffy_url`.
- Sort: `raised_cents` desc, then name.
- Never returned: donor names, emails, single gift amounts, timestamps, fundraiser emails or phones.

## 2. `giving-signup` (edge function)

`POST https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/giving-signup`, JWT verification ON
(same as `inventory-log`), so call it with `supabase.functions.invoke('giving-signup', { body })`.

```json
{"campaign": "giving-tuesday-2026", "firstName": "", "lastName": "", "email": "", "phone": "",
 "cohort": "instructor", "why": "", "showOnBoard": true, "consentPage": true, "turnstileToken": ""}
```

| HTTP | body |
|---|---|
| 200 | `{"ok": true}` (new, updated, or already approved: always the same answer) |
| 400 | `{"ok": false, "reason": "invalid_name" \| "invalid_email" \| "invalid_cohort" \| "invalid_why" \| "consent_required" \| "captcha_missing"}` |
| 403 | `{"ok": false, "reason": "captcha_failed" \| "signup_closed"}` |
| 404 | `{"ok": false, "reason": "not_found"}` |

Validation order is the order of the 400 list, then Turnstile, then the database. Names 1 to 60
characters, email at most 200, phone cut to 30, why at most 160, all whitespace (newlines included)
collapsed. `showOnBoard` defaults to true. `consentPage` must be literally `true`.

The slug is `instructorSlug(firstName + " " + lastName)` (ported from `src/data/popUpShared.js`),
with `-2`, `-3` on a clash. `avatar_slug` is set only when the final slug is in
`public.giving_avatar_slugs` (the 40 photos in `public/images/popup/instructors/` on 2026-11-17).
When a new photo ships: `insert into public.giving_avatar_slugs (slug) values ('first-last');`
and `update public.giving_fundraisers set avatar_slug = slug where slug = 'first-last';`.

New rows are `status = 'pending'`. A repeat with the same email updates a pending row and does
nothing to an approved or hidden one.

## 3. `zeffy-webhook` (edge function, JWT verification OFF)

URL: `https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/zeffy-webhook`

- Webhook: paste this URL in Zeffy, Settings, Integrations, Webhook, and subscribe to
  `payment.completed`, `payment.created`, `payment.updated`, `payment.deleted`.
  Without `ZEFFY_WEBHOOK_SECRET` every delivery answers 503 (Zeffy retries for 3 days).
  Bad or stale signature: 400. Duplicate event id: 200 `{ok: true, duplicate: true}`.
  `payment.updated` without `ZEFFY_API_KEY` is recorded as `deferred` and the reconcile picks it up.
- Reconcile: `POST ...?mode=reconcile`. Answers `{ok, fetched, upserted, matched, unmatched, deleted}`
  (plus `partial: true` if it ran out of its 110 s budget), `{ok: false, reason: "no_api_key"}`
  (200) when the key is missing, 401 `unauthorized` otherwise. Only campaigns with
  `zeffy_campaign_ids` that ended less than 30 days ago are synced; with none it answers
  `{ok: true, ..., note: "no_active_campaigns"}` without calling Zeffy. The listing looks back
  14 days before the earliest `starts_at`, so a gift made before kickoff is still pulled in.
- Check: `POST ...?mode=check` (same authorisation). Asks Zeffy for each id in
  `zeffy_campaign_ids` and answers `{ok, linked: [{slug, id, found, campaign}], peer_to_peer: [...]}`
  with public campaign fields only (title, url, category, status, target, volume). Use it to
  confirm the link after the key changes. Confirmed 2026-11-17: `c1480631-…` is
  "LSP Giving Tuesday", `PeerToPeerCampaign`, active, target 1500000.
- Page addresses: the API writes `https://www.zeffy.com/peer-to-peer/<slug>`, the browser shows
  `/en-US/peer-to-peer/<slug>`. `normalizeUrl` drops the locale segment, so either spelling of a
  participant page pasted into `zeffy_url` matches.

Attribution: a payment belongs to the campaign whose `zeffy_campaign_ids` contains its
`parent_campaign_id` or `campaign_id`. It is credited to the fundraiser whose `zeffy_campaign_id`
equals the payment's `campaign_id`. An unknown participant page is looked up with
`GET /campaigns/{id}` and its `url` matched to `giving_fundraisers.zeffy_url` (lower-case, no query
string, no trailing slash); a match stores the id on the fundraiser. Otherwise the gift stays on the
campaign with no fundraiser. Payments for anything else are not stored (only the event id, type and
`ignored`). A sync never clears a fundraiser an admin assigned by hand, and never touches
`counts_toward_threshold` or `note`.

## 4. Secrets (names only)

| Name | Where | Status |
|---|---|---|
| `ZEFFY_API_KEY` | function secret | owner pastes it |
| `ZEFFY_WEBHOOK_SECRET` | function secret (`whsec_...`) | owner pastes it |
| `GIVING_CRON_SECRET` | function secret AND Vault secret `giving_cron_secret` | set |
| `TURNSTILE_SECRET_KEY` | function secret (existing) | set |

`supabase secrets set ZEFFY_API_KEY=... ZEFFY_WEBHOOK_SECRET=... --project-ref jcseaxtvsozylsbmykka`
(or the dashboard, Edge Functions, Secrets). No redeploy needed.

To rotate the cron secret, set a new `GIVING_CRON_SECRET` and run
`select vault.update_secret((select id from vault.secrets where name = 'giving_cron_secret'), '<new value>');`.

## 5. Admin SQL

Tables: `giving_campaigns`, `giving_fundraisers`, `giving_payments`, `giving_webhook_events`,
`giving_draws`, `giving_avatar_slugs`; view `giving_fundraiser_totals` (raised, eligible,
self-gift, flagged and late cents, gift counts, reached). RLS: the `fundraising` module reads and
writes; webhook events are read-only; draws are insert-only; campaign delete is admin-only.

Point the campaign at Zeffy. Done 2026-11-17 for the live campaign
`https://www.zeffy.com/en-US/peer-to-peer/lsp-giving-tuesday` (dashboard form id
`c1480631-458c-4f2a-8c29-745766044ee7`; confirm it equals the API campaign id with
`GET /campaigns` once `ZEFFY_API_KEY` is set). An earlier attempt, form `76c5b312-...`, was ended
and must not be used:

```sql
update public.giving_campaigns
set zeffy_campaign_ids = array['c1480631-458c-4f2a-8c29-745766044ee7'],
    give_url = 'https://www.zeffy.com/en-US/peer-to-peer/lsp-giving-tuesday'
where slug = 'giving-tuesday-2026';
```

Approve a fundraiser and give her page:

```sql
update public.giving_fundraisers
set status = 'approved', approved_at = now(),
    zeffy_url = 'https://www.zeffy.com/.../first-last',
    zeffy_campaign_id = null          -- or the participant page id if known
where campaign_slug = 'giving-tuesday-2026' and slug = 'first-last';
```

Offline gift (cash, check):

```sql
insert into public.giving_payments
  (campaign_slug, fundraiser_id, source, amount_cents, status, paid_at, buyer_email, note)
values ('giving-tuesday-2026',
        (select id from public.giving_fundraisers where campaign_slug = 'giving-tuesday-2026' and slug = 'first-last'),
        'offline', 5000, 'succeeded', now(), null, 'Cash at the studio');
```

Assign an unmatched gift, or take one out of the drawing:

```sql
update public.giving_payments set fundraiser_id = '<fundraiser id>' where zeffy_payment_id = '<payment id>';
update public.giving_payments set counts_toward_threshold = false, note = 'why' where id = '<row id>';
```

## 6. Reconcile by hand

From the dashboard (signed in with the fundraising module):
`supabase.functions.invoke('zeffy-webhook?mode=reconcile', { body: {} })`.

From SQL (uses the Vault secret, same as the cron):

```sql
select net.http_post(
  url := 'https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/zeffy-webhook?mode=reconcile',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-giving-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'giving_cron_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
-- then: select status_code, content from net._http_response order by created desc limit 1;
```

## 7. Cron

Job `giving-zeffy-reconcile`, every 5 minutes. Check runs with
`select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'giving-zeffy-reconcile') order by start_time desc limit 5;`.

Remove after the campaign (refunds settle within the 30-day window, so mid-January is safe):

```sql
select cron.unschedule('giving-zeffy-reconcile');
delete from vault.secrets where name = 'giving_cron_secret';
```
