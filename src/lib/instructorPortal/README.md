# Instructor portal (`/instructors`)

A passcode-gated page for LSP instructors and studio coordinators: the week at a
glance, the handbook, the FAQ, who to contact, ways to get involved, and a
coordinators section.

## Privacy rule (read this first)

This repo is PUBLIC. The portal holds internal policy, staff contact details and
schedules. None of that may ever be committed or end up in the JS bundle.

- The page ships EMPTY. All portal content is one JSON document stored in
  Supabase and returned only after the passcode is checked inside Postgres.
- The passcode and its hash are never written in this repo, in a script, in a
  test, or in a commit message.
- The working copy of the content lives in `private/instructor-portal/`, which is
  gitignored. Do not move it, import it, or copy lines from it into tracked files
  (code comments and test fixtures included: use invented names there).
- A client-side check is not a gate. Do not add one.

## Pieces

| Piece | Path |
|---|---|
| Page | `src/pages/instructors.astro` |
| App and views | `src/components/instructorPortal/*.svelte` |
| Client (RPC, session, safe text) | `src/lib/instructorPortal/*.js` |
| Schema, RPCs | `supabase/migrations/20261125120000_instructor_portal.sql` |
| Content working copy (gitignored) | `private/instructor-portal/content.json` |
| Push, pull, passcode | `scripts/instructor-portal.mjs` |
| Push guard (does a push undo staff edits?) | `scripts/instructor-portal-guard.mjs` |
| Share card | `scripts/render-instructors-og.mjs` to `public/images/instructors/` |
| Staff editor (dashboard module) | `src/components/admin/instructorPortal/*.svelte` |
| Editor logic, dashboard RPC client | `src/lib/instructorPortal/editor.js`, `adminRemote.js` |
| Editor RPCs, history table | `supabase/migrations/20261127120000_instructor_portal_admin.sql` |

## Server contract

Slugs: `instructors` is the real portal. `instructors-dev` is a throwaway copy
with a throwaway passcode for browser testing. Never type the real passcode into
a browser field while testing: use the dev slug.

Tables (RLS on, zero grants, zero policies; reachable only through the RPCs):

- `instructor_portal_access(slug pk, pass_hash, updated_at)` bcrypt hash
- `instructor_portal_content(slug pk, content jsonb, updated_at)`
- `instructor_portal_sessions(token_hash pk, slug, created_at, expires_at)`
- `instructor_portal_attempts(id, slug, attempted_at)`
- `instructor_portal_content_history(id, slug, content, content_updated_at,
  replaced_at, replaced_by, source)` every document that was replaced, filed by
  a trigger on `instructor_portal_content`; newest 50 per slug

RPCs callable by `anon` and `authenticated` (all `security definer`, all return
`jsonb`, none raise on a bad passcode so the attempt row is kept):

```
instructor_portal_unlock(p_slug text, p_pass text, p_remember boolean default false)
  ok   -> { ok: true, token, expires_at, content, content_updated_at }
  fail -> { ok: false, reason: "bad-passcode" | "locked" | "no-portal",
            retry_after_seconds? }

instructor_portal_fetch(p_slug text, p_token text)
  ok   -> { ok: true, content, content_updated_at, expires_at }
  fail -> { ok: false, reason: "expired" }

instructor_portal_lock(p_slug text, p_token text)
  -> { ok: true }            (deletes that one session)
```

Rules:

- The session token is 32 random bytes, hex. Only its SHA-256 is stored.
- Session length: 12 hours, or 30 days when `p_remember` is true.
- Throttle: 20 wrong passcodes for a slug inside 10 minutes locks that slug until
  the window clears (`reason: "locked"` with `retry_after_seconds`), and every
  wrong try sleeps about 0.4 s. The lock is shared by everyone, so it is loose on
  purpose: one person mistyping must not lock the whole team out.
- Expired sessions and old attempt rows are pruned opportunistically inside
  `unlock`.

Owner-only functions (execute revoked from `public`, `anon`, `authenticated`;
run from the SQL editor or `scripts/instructor-portal.mjs`):

```
instructor_portal_set_passcode(p_slug text, p_new_pass text)   also signs everyone out
instructor_portal_set_content(p_slug text, p_content jsonb)
instructor_portal_restore_version(p_slug text, p_history_id bigint)   put a history version back
```

Dashboard RPCs (callable by `authenticated` only, and only for a signed-in
dashboard user who holds the `instructor_portal` module; superusers pass
implicitly; `security definer`, return `jsonb`, never read the access table):

```
instructor_portal_admin_get(p_slug text)
  ok   -> { ok: true, slug, content, updated_at, updated_by }
  fail -> { ok: false, reason: "forbidden" | "invalid-slug" | "no-portal" }

instructor_portal_admin_save(p_slug text, p_content jsonb, p_expected_updated_at timestamptz)
  ok   -> { ok: true, slug, updated_at, unchanged, bytes? }
  fail -> { ok: false, reason: "forbidden" | "conflict" | "locked-sections" | "no-portal"
                             | "missing-version" | "invalid-slug" | "not-an-object"
                             | "bad-schema" | "too-large",
            updated_at? }          (the live version, on "conflict")
```

Rules:

- Holding the module means reading the whole portal without the passcode and
  editing it. Grant it in User Access to the people who run the portal, nobody
  else.
- A save may change only the top-level keys `updated`, `week`, `dates` and
  `faq`. Any other difference from the stored document is refused
  (`locked-sections`). The list lives in `v_editable` (SQL) and `EDITABLE_KEYS`
  (`editor.js`); change both together, in a new migration.
- `p_expected_updated_at` is the `updated_at` the editor loaded. If the row has
  moved, someone else saved first: `conflict`, nothing written. The client must
  send the string back untouched (it carries microseconds; a JavaScript `Date`
  rounds them off).
- A save cannot create a portal. The slug's row must already exist.
- The same shape checks as `instructor_portal_set_content` (slug, object,
  `schema` 1, size cap). The full document check is `validateContent`, run by
  the editor before it saves and by the script before it pushes.

## Client API (`src/lib/instructorPortal/remote.js`)

```js
portalSlug()                                  // "instructors"; DEV only: ?slug=instructors-dev
unlockPortal(passcode, { remember })          // { ok: true, content, updatedAt }
                                              // { ok: false, reason, retryAfterSeconds? }
                                              //   reason: bad-passcode | locked | no-portal | network | config
resumePortal()                                // same ok shape, or { ok: false, reason: "no-session" | "expired" | "network" }
lockPortal()                                  // forget the token here and on the server
loadLocalContent()                            // DEV only (?local=1): the gitignored working copy, no Supabase
```

- Uses the shared client from `src/lib/supabaseClient.js`. Never create a second one.
- Stores only the token: `sessionStorage`, or `localStorage` when "remember this
  device" is ticked. The passcode is never stored and never put in a URL.
- Content is kept in memory only. It is not cached in `localStorage`.
- `?local=1` and `?slug=` are honoured only when `import.meta.env.DEV` is true, so
  they are compiled out of the production bundle.

## Content document (schema 1)

Rich text is an array of blocks. No HTML is ever stored or injected.

```
Block = { "t": "p",  "x": "text" }
      | { "t": "h",  "x": "small heading inside a section" }
      | { "t": "ul", "items": ["text", ...] }
      | { "t": "ol", "items": ["text", ...] }
```

Inside any text string, `[label](url)` is a link and `**words**` is emphasis.
Nothing else is parsed. Links may only be site-relative (`/subs/`), `https:`,
`mailto:` or `tel:`; the renderer drops anything else.

```
{
  "schema": 1,
  "updated": "YYYY-MM-DD",
  "period": { "label": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },

  "week":  [ { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "headline": "...",
               "notes": [Block], "shoutouts": ["..."] } ],
  "dates": [ { "date": "YYYY-MM-DD", "end": "YYYY-MM-DD"?, "time": "..."?,
               "title": "...", "text": "..."?, "href": "..."?, "cta": "..."? } ],
  "actions": [ { "id": "...", "label": "...", "text": "...", "href": "..." } ],

  "handbook": {
    "title": "...", "version": "...", "effective": "...", "appliesTo": "...",
    "note": "..."?,
    "original": { "label": "...", "href": "...", "access": "..."? }?,
    "sections": [ { "id": "kebab-id", "title": "...", "blocks": [Block] } ]
  },

  "faq": [ { "id": "kebab-id", "group": "...", "q": "...", "a": [Block],
             "pending": false, "source": "..."?,
             "ask": { "who": "...", "email": "..."?, "phone": "..."? }? } ],

  "contacts": [ { "area": "...", "for": "...", "who": "...",
                  "emails": ["..."], "phones": ["..."] } ],
                  // a phones entry is a number string, or { "label": "...", "number": "..." }
                  // shown as "Call or text <label>" when one row lists several people

  "volunteer": [ { "title": "...", "when": "..."?, "text": "...",
                   "href": "...", "cta": "...", "until": "YYYY-MM-DD"? } ],
  "committees":  { "text": [Block], "href": "...", "cta": "..." },
  "fundraising": { "text": [Block],
                   "links": [ { "label": "...", "text": "...", "href": "..." } ],
                   "contact": { "who": "...", "emails": ["..."] }? },

  "coordinators": {
    "intro": [Block],
    "schedule": {
      "label": "...",
      "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "rows": [ { "time": "...", "who": ["...", "...", "...", "...", "..."] } ],
      "weekend": [ { "day": "...", "time": "...", "who": "..." } ],
      "note": "..."?
    },
    "tools": [ { "label": "...", "text": "...", "href": "..." } ],
    "todos": [ { "title": "...", "items": ["..."], "pending": false, "note": "..."? } ],
    "find":  { "items": [ { "what": "...", "where": "..." } ],
               "pending": false, "note": "..."? }
  },

  "links": [ { "label": "...", "text": "..."?, "href": "..." } ]
}
```

Behaviour the page derives from the data (do not hard-code dates in components):

- `week`: show the entry whose range contains today. If none does, show the most
  recent past entry with its date range stated plainly, so an old note is never
  passed off as this week's. If the newest entry ended more than 14 days ago, hide
  the notes and show only `dates`.
- `dates` and `volunteer`: an item disappears the day after `end`, else `date`,
  else `until`. Sort `dates` ascending.
- Search (`searchPortal`) matches at word starts only: every query word must be
  the start of a word in the entry ("late" finds "lateness", not "related").
  The page highlights by the same rule (`wordStarts`).
- `pending: true` (FAQ entries, coordinator to-dos, the find list) means the policy
  or checklist is not written yet. Render the holding text as given and the
  `ask` contact. Never invent an answer in the component.
- Every section must render sensibly when its array is empty or its key is
  missing: the document will be edited by hand.

## Editing content

There are two ways in. The database copy is always the copy of record.

### In the dashboard: the parts that change every week

`/admin#instructor-portal`, for dashboard users who hold the Instructor Portal
module (User Access; see the rules above for what the grant means).

What can be edited there:

- `week`: add this week's entry (date range, headline, notes as a plain list,
  shoutouts), edit or remove an entry.
- `dates`: add, edit, remove.
- `faq`: the answer text, and turning `pending` off when a policy is written.
  Questions, groups and ids are read only.
- `updated` is stamped with today's date (America/Chicago) on every save.

Everything else, the handbook included, is read only there, and the database
enforces it (`locked-sections`).

How it behaves:

- The draft lives in the browser's memory only. It is never written to
  `localStorage`, `sessionStorage`, a URL or the console.
- Save first runs `prepareForSave` (drops blank rows and blank optional fields,
  sorts weeks and dates) and then `validateContent`. Errors are listed in plain
  words (`plainProblems`) and block the save. Warnings are shown and do not.
- Preview renders the prepared document with the real portal views
  (`WeekView`, `HandbookView`) before anything is saved. Links are switched off
  inside it.
- Two people editing: on `conflict` the editor loads the newer document. If the
  two people changed different sections, the person's changes are put on top of
  it (`rebaseDraft`) and they save again. If both changed the same section,
  their version stays on screen and they choose when to load the other one.
- Instructors see a saved change the next time they open or reload the portal.
- A bad edit can be put back: the document it replaced is in
  `instructor_portal_content_history`. The owner runs
  `instructor_portal_restore_version` (runbook at the end of
  `20261127120000_instructor_portal_admin.sql`).

Testing the editor: under `astro dev`, open
`/admin?slug=instructors-dev#instructor-portal`. It is the same DEV-only `?slug=`
switch the portal page uses, and the editor shows a banner while it is on. Never
test against `instructors`.

To open another section for editing: add its key to `v_editable` in a new
migration and to `EDITABLE_KEYS` in `editor.js`, then build its form.

### From the working copy: everything else

```
node scripts/instructor-portal.mjs pull                     fetch what is live into the working copy folder
edit private/instructor-portal/content.json
preview: astro dev, then /instructors/?local=1
node scripts/instructor-portal.mjs check                    validate against schema 1
node scripts/instructor-portal.mjs push --slug instructors-dev
node scripts/instructor-portal.mjs push                     the real portal
```

**Pull before you edit.** Staff now change the live document every week, so
`content.json` goes stale, and `push` replaces the whole document. `pull` writes
`pulled-<slug>.json` next to `content.json`, never overwrites it, and says which
sections differ, so bring `week`, `dates` and `faq` across from the pulled file
(or start from it) before you edit and push.

**`push` stops rather than undo staff edits.** Before it writes, it reads what
is live and compares each top-level section three ways: what this computer last
pushed, what is live now, and what `content.json` holds. A section that changed
live and that `content.json` would replace with something else stops the push,
with the section names and the steps to take. Nothing is written. A section
staff changed that the working copy already carries is fine, and so is one only
the working copy changed. The `updated` date stamp alone never stops a push.

- The record of the last push is `private/instructor-portal/.push-base.json`:
  the live version and one hash per section, per slug. No content. Gitignored
  with the rest of the folder, and safe to delete.
- With no record (a new computer, a deleted file), the push goes ahead while
  nobody has ever saved the slug from the dashboard. Once staff have, it stops
  and asks for one `pull`, a look, and `push --overwrite`.
- `push --overwrite` replaces the live sections on purpose. After the staff
  editor's migration the replaced document is in the history table either way:
  put it back with `instructor_portal_restore_version`.
- When live already equals `content.json`, nothing is written, so an open
  editor in the dashboard does not get a needless "someone else saved".
- The write itself is conditional on the version that was just read, with the
  row locked, so a dashboard save cannot slip in between the check and the
  write. If one tries, the push answers "changed while this push was running":
  run it again.

## Tests

```
node src/lib/instructorPortal/test/run.mjs                  rich text, dates, search, validateContent
node src/lib/instructorPortal/test/editor.test.mjs          the editor's document logic
node src/lib/instructorPortal/test/adminRemote.test.mjs     the dashboard RPC client, against a fake
node src/lib/instructorPortal/test/pushGuard.test.mjs       the push script's stale-copy guard
```

Fixtures are invented. No real name, address, number or portal sentence belongs
in a test.
