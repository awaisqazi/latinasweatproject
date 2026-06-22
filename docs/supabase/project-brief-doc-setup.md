# Project Brief Doc automation — setup runbook

Server-side replacement for the legacy Google Apps Script that created a "Project Brief" Google Doc for every tracker row. In the admin platform, creating a project (manual create **or** Google Form intake) auto-creates a brief Doc from a template, files it in a Drive folder, and links it on `projects.details_url`. There is also a manual **Generate brief doc** button in the project detail drawer (admins) as a fallback.

## ✅ Provisioned (2026-06-22) — live and verified
The steps below are DONE. Recorded for reference / rebuild:
- **GCP project**: `lsp-brand-automation` ("LSP Brand Automation"), Drive API enabled.
- **Service account**: `lsp-brief-doc@lsp-brand-automation.iam.gserviceaccount.com` (JSON key issued; local copy deleted, key stored only in the Supabase secret).
- **Shared Drive**: "LSP Brand Ops" (`0AJfL7-hhLXL7Uk9PVA`); SA added as Content Manager.
- **Template** (`BRIEF_DOC_TEMPLATE_ID`): `1XFnEAgnaomQ_k9Qzv1FUdUsVwNqZvsq44sj-fVJ_Rao` (LSP-owned copy in the Shared Drive root).
- **Destination folder** (`BRIEF_DOC_FOLDER_ID`): `12n8IpzSOdfR_rGxm5KOwYmEE_J0MrvON` ("Project Briefs").
- **Supabase**: secrets set; function `project-brief-doc` deployed `--no-verify-jwt`; `app_private.settings.brief_doc_function_url` set.
- **Migration** `20260622000100` was applied via direct SQL (idempotent), not yet recorded in remote history — see note in the project memory about reconciling migration drift before the next `supabase db push`.

To rotate the key: SA → Keys → add a new JSON key, update the `GOOGLE_SERVICE_ACCOUNT_JSON` Supabase secret, then delete the old key.

---

The original setup steps follow (for reference / disaster recovery):

## Pieces (already in the repo)
- Edge function: `supabase/functions/project-brief-doc/index.ts` — copies the template via the Google Drive API and writes back `details_url`.
- Migration: `supabase/migrations/20260622000100_project_brief_doc_automation.sql` — enables `pg_net`, adds `projects.brief_doc_status`, and adds an `AFTER INSERT` trigger that calls the function. **Dormant** until `app_private.settings.brief_doc_function_url` is set, so it is safe to apply early.
- UI: admin-only button in `ProjectDetailDrawer.svelte`.

## One-time setup (you do this)

### 1. Google Workspace Shared Drive + assets
1. In LSP's Google Workspace, create (or pick) a **Shared Drive**, e.g. `LSP Brand Ops`.
2. Move the template Doc **"Project Brief (Template)"** (`1b2sBfr_TGJKs32_bTRT2xas4wNGALMeSaPq0EGrvwRI`) and the **"LSP_TrackerBriefs"** folder (`1QVH2CMn1QbG0JZvwkWF6qzakyDSO2bq1`) into that Shared Drive. (They currently live on `javier@gosuperdope.com`; moving them into an LSP Shared Drive is what makes LSP the owner — coordinate the move with the agency.)
   - If you create fresh ones instead, note the new file/folder ids.

### 2. Google Cloud service account
1. In Google Cloud Console, create/choose a project, then **Enable the Google Drive API**.
2. Create a **Service Account**; create a **JSON key** and download it.
3. Copy the service account email (looks like `name@project.iam.gserviceaccount.com`).
4. In the Shared Drive, add that service account email as a **Content manager** (or Manager). Because it's a Shared Drive, copies it creates are owned by the Shared Drive (no 15 GB personal-quota issue).

### 3. Supabase function secrets
From the repo root (CLI must be logged in + linked to project `jcseaxtvsozylsbmykka`):
```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat /path/to/service-account.json)"
supabase secrets set BRIEF_DOC_TEMPLATE_ID="<template file id>"
supabase secrets set BRIEF_DOC_FOLDER_ID="<destination folder id>"
# Must match app_private.settings.brief_doc_secret (see step 5):
supabase secrets set BRIEF_DOC_SECRET="<paste the secret from step 5>"
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 4. Deploy the function
```bash
supabase functions deploy project-brief-doc
```

### 5. Apply the migration and wire the callback
```bash
supabase db push
```
Then read the generated secret and set the function URL so the trigger wakes up (run in the SQL editor / via MCP):
```sql
-- get the secret to paste into BRIEF_DOC_SECRET (step 3)
select value from app_private.settings where key = 'brief_doc_secret';

-- point the trigger at the deployed function
update app_private.settings
set value = 'https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/project-brief-doc'
where key = 'brief_doc_function_url';
```

### 6. Test
- Manual: open any project missing a Details link → **Generate brief doc** → confirm a Doc appears in the folder and `details_url` is set.
- Auto: create a new project in Admin Overview → within a few seconds `brief_doc_status='created'` and `details_url` populated.
- Inspect async failures: `select * from net._http_response order by created desc limit 5;`

## Notes
- **Idempotent:** the function and trigger skip if `details_url` is already set (matches the old "Column D not empty" guard). Pass `{ force: true }` to regenerate.
- **Bulk imports:** to avoid firing on a tracker re-import, wrap the load in `set local lsp.skip_brief_automation = 'on';` (the trigger checks this).
- **Naming:** copies are named `YYYY-MM-DD_<Project Title>` (America/Chicago date), same as the script.
- **Rotate** `BRIEF_DOC_SECRET` by updating both the Supabase secret and `app_private.settings.brief_doc_secret` together.
