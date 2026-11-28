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
| Share card | `scripts/render-instructors-og.mjs` to `public/images/instructors/` |

## Server contract

Slugs: `instructors` is the real portal. `instructors-dev` is a throwaway copy
with a throwaway passcode for browser testing. Never type the real passcode into
a browser field while testing: use the dev slug.

Tables (RLS on, zero grants, zero policies; reachable only through the RPCs):

- `instructor_portal_access(slug pk, pass_hash, updated_at)` bcrypt hash
- `instructor_portal_content(slug pk, content jsonb, updated_at)`
- `instructor_portal_sessions(token_hash pk, slug, created_at, expires_at)`
- `instructor_portal_attempts(id, slug, attempted_at)`

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
```

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

```
edit private/instructor-portal/content.json
preview: astro dev, then /instructors/?local=1
node scripts/instructor-portal.mjs check                    validate against schema 1
node scripts/instructor-portal.mjs push --slug instructors-dev
node scripts/instructor-portal.mjs push                     the real portal
node scripts/instructor-portal.mjs pull                     fetch what is live into the working copy folder
```

The database copy is the copy of record. The working copy can always be rebuilt
with `pull`.
