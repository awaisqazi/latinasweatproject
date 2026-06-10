# Firebase -> Supabase data migration

One-time scripts that copy data from the four legacy Firestore projects into
the Supabase database behind this site. Everything is idempotent: each script
can be re-run safely, which is exactly what the cutover procedure relies on.

| Firestore project | Collections migrated | Supabase tables |
| --- | --- | --- |
| `volunteerapp-74ebe` | `shifts`, `custom_shifts` | `volunteer_shifts`, `shift_registrations` |
| `substracker-c0a34` | `sub_requests` | `sub_requests`, `sub_volunteers` |
| `lspelections` | `votes`, `settings` | `elections`, `election_votes` |
| `galathermometerapp` | `gala_guests`, `gala_donations` | `gala_guests`, `gala_donations` |

`monthly_availability` (volunteer app) is derived data and intentionally not
migrated; Supabase rebuilds it via `get_month_availability()`.

## 1. Download service-account keys

For each of the four Firebase projects:

1. Open the [Firebase console](https://console.firebase.google.com/) and select the project.
2. Gear icon next to "Project Overview" -> **Project settings** -> **Service accounts** tab.
3. Click **Generate new private key** and confirm.
4. Save the downloaded JSON file as `scripts/migration/keys/<projectId>.json`:
   - `keys/volunteerapp-74ebe.json`
   - `keys/substracker-c0a34.json`
   - `keys/lspelections.json`
   - `keys/galathermometerapp.json`

The `keys/` directory is gitignored. Never commit these files. If a key is
missing, that project is skipped with a warning (export, import, and verify
all degrade gracefully), so you can migrate projects one at a time.

## 2. Set environment variables

From the Supabase dashboard (Project Settings -> API):

```sh
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

The service role key bypasses RLS; treat it like a root password and never
put it in a file that could be committed.

## 3. Run the migration

```sh
cd scripts/migration
npm install
node export.mjs   # Firestore -> exports/<projectId>/<collection>.ndjson
node import.mjs   # NDJSON -> Supabase (writes exports/import-report.json)
node verify.mjs   # source vs Supabase counts + invariants (exit 1 on mismatch)
```

What each step does:

- `export.mjs` pages through every collection in batches of 500 and writes
  one NDJSON line per document with Firestore Timestamps converted to
  ISO-8601 strings. Re-running overwrites the export files.
- `import.mjs` upserts rows on `legacy_id` where the table has one, and uses
  duplicate-tolerant inserts for child rows (registrations, sub volunteers,
  votes) whose dedupe index is on `(parent_id, lower(email))`. Skipped rows
  (invalid emails, unparseable paddles, etc.) are logged and counted in
  `exports/import-report.json`.
- `verify.mjs` compares source counts (computed from the NDJSON files, so it
  works offline from Firestore) against Supabase counts, checks the donation
  total to the cent and vote uniqueness, and reports per-shift capacity
  overruns as warnings (legacy data may legitimately exceed capacity).

## 4. Cutover (freeze) procedure

1. **Freeze writes** to the legacy apps: disable the legacy frontends or flip
   Firestore security rules to read-only, and announce the maintenance window.
2. Re-run all three scripts in order:
   ```sh
   node export.mjs && node import.mjs && node verify.mjs
   ```
   They are idempotent, so this picks up only the rows created since the
   first dry run; existing rows are updated in place or skipped.
3. Confirm `verify.mjs` exits 0 with no MISMATCH rows. Counts for
   registrations and sub volunteers are compared as totals, so they only
   match exactly while the freeze is in effect (no new Supabase-side writes).
4. Point the site at the Supabase-backed pages and lift the freeze.

## 5. After cutover: revoke the keys

Once verification passes and the new system is live:

1. In each Firebase project: Project settings -> Service accounts -> Manage
   service account permissions (Google Cloud console) -> delete the generated
   key (or the whole service account if it is unused otherwise).
2. Delete the local files: `rm -rf scripts/migration/keys/`.
3. Optionally delete `scripts/migration/exports/` once you no longer need the
   snapshot (it contains volunteer emails and phone numbers; do not keep it
   around longer than necessary).
4. Rotate the Supabase service role key if it was ever pasted anywhere
   outside your shell.
