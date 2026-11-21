# 02. Instructor links and kits

Front end only. Both pages read the existing `giving_public` RPC (section 1 of
`01-backend-contract.md`); no table, RPC or edge function was added.

## Short link: `/give/<slug>`

- Public address: `https://latinasweatproject.com/give/<slug>` (`shortLink()` in
  `src/data/givingTuesday.js`). `<slug>` is the fundraiser slug from the RPC.
- Instructors in `src/data/givingInstructors.json` have a static page (next
  section). For anyone else, GitHub Pages has no `/give/<slug>`, so it is a 404. `src/pages/404.astro` matches
  `^/give/[a-z0-9-]+/?$` (any case) and replaces it with `/give/?i=<slug>`, keeping
  any query string (for example UTM tags).
- `src/pages/give/index.astro` + `GivingPersonApp.svelte`: finds the fundraiser whose
  `slug` matches `?i=` in `fundraisers` and shows their face (`avatar`, else
  initials), "Help {name} raise $150.", their `why` if any, their own mat unrolling
  toward their `goal_cents` (the board's treatment; yellow ring at $150), the phase
  line, the amount picker and Give.
- Give: the fundraiser's `give_url` when set, else the campaign `give_url`, else
  `/donate`. `withAmount()` adds `?amount=&donate=true` only on Zeffy peer-to-peer
  URLs, so only then does the button say "Give $100".
- Fallback ("Give to LSP Giving Tuesday."): no `?i=`, a slug not in `fundraisers`
  (unknown, not approved, `show_on_board` off, or `board_open` false), or the RPC
  failing. It links to the campaign Give and to `/givingtuesday/`. A slug that the
  RPC answered for but did not list adds "We couldn't find that giving page...".
- Limitation: a fundraiser who chose not to show on the board (or any fundraiser
  while `board_open` is false) gets the campaign fallback on their own link, because
  `giving_public` only lists board rows. Their Zeffy page still works.
- The amount shown is `raised_cents` (everything credited), the same number as the
  board. The $150 ring uses `reached` (eligible gifts only: other people's gifts).

## Per-person pages and share cards: `npm run giving:cards`

Link previews (iMessage, WhatsApp, Instagram DMs, Facebook, Slack, X) read
`og:image` and `og:title` from static HTML and run no JavaScript, so each approved
instructor also gets a static page with their own card.

- **After approving someone** (or when a name, why, avatar or goal changes): run
  `npm run giving:cards` (sync, link cards, then share-kit images), commit
  `src/data/givingInstructors.json` and `public/images/givingtuesday/give/`, push. Until then their short link still
  works through the 404 redirect, with the generic campaign card.
- `scripts/sync-giving-instructors.mjs` calls `giving_public` with the public URL
  and publishable key (env, `.env`, else the defaults in `deploy.yml`; never a
  service key) and writes `src/data/givingInstructors.json`: slug, name, first,
  why, avatar, goal_cents only. Sorted by slug; unchanged roster, unchanged file.
- `scripts/render-giving-instructor-og.mjs` writes
  `public/images/givingtuesday/give/<slug>-og.jpg` (1200x630). Yellow card, whole
  LSP logo, "LSP Giving Tuesday", "Help {first}" / "raise {goal}", their why in
  quotes (verbatim; emoji left off the card; a long one cut at a word with "…"
  inside the quote; no why, no line), "Tuesday, Dec 1". The photo is the large
  transparent cutout the pop-up avatar is cut from
  (`marketing/popup-week1/instructors/<avatar>.png`) standing on the yellow at
  the right, sized so it never comes within 36 px of a line of type and the face
  stays in frame; a cutout cut off by its own left side, an avatar on
  `ALWAYS_CIRCLE`, or no large cutout, uses the 320 px avatar in a 300 px white
  circle; no avatar, type only. Each card
  stores a hash of its inputs, so reruns only redraw what changed (`--force`
  redraws all); cards for slugs no longer listed are deleted.
- `src/pages/give/[slug].astro` builds `/give/<slug>/` for every slug in the JSON:
  the same live page as `/give/?i=<slug>` (`GivingPersonApp` with a `slug` prop),
  with title "Help {name} raise {goal} | LSP Giving Tuesday", description "LSP
  Giving Tuesday: “{why}” Help {first} raise {goal} by Tuesday, Dec 1." (without a
  why: "LSP Giving Tuesday: help {name} raise {goal} by Tuesday, Dec 1.") and their
  card. noindex, out of the sitemap. GitHub Pages serves it for `/give/<slug>`
  and `/give/<slug>/`. The page itself is live data: someone later hidden from
  the board gets the campaign fallback on it, and the card stays until the next
  `giving:cards` run deletes it.
- `404.astro`: a slug in the JSON typed in another case goes to `/give/<slug>/`;
  any other slug still goes to `/give/?i=<slug>`.

## Share kit: `/givingtuesday/kit/?i=<slug>`

- `src/pages/givingtuesday/kit.astro` + `GivingKitApp.svelte`. Send each instructor
  `https://latinasweatproject.com/givingtuesday/kit/?i=<slug>`.
- Shows the short link (Copy, Share where the browser has a share sheet, "Open your
  page"), three captions (`givingKitCopy.captions`, first person in the
  instructor's voice, each leads with "LSP Giving Tuesday", Copy + Share), and two
  images, 1080x1350 feed and 1080x1920 story, JPEG, Download (and Share with the
  file where `navigator.canShare({ files })` is true).
- Images: a slug in `givingInstructors.json` gets its pre-rendered files
  `public/images/givingtuesday/give/<slug>-post.jpg` and `<slug>-story.jpg`
  (fetched, so Download and Share hand over the same file). Anyone else, or a
  file that fails to load: drawn in the browser by `kitCanvas.js` (words only).
- No `?i=`, or a slug not on the board: a name picker built from `fundraisers`
  (sorted by name). Choosing a name rewrites the URL to `?i=<slug>`.
- Mentions the thank-you drawing only when the campaign's `prize_label` is set.
  Always says "Your own gift is welcome, but it doesn't count toward the $150."
- Nothing per person is stored in the repo; a new approved fundraiser has a working
  link and kit as soon as the RPC lists them.

## Pre-rendered kit images: `scripts/render-giving-instructor-kit.mjs`

- Run by `npm run giving:cards` after the link cards; alone:
  `node scripts/render-giving-instructor-kit.mjs [--force] [--only=slug,slug]`.
  Same pipeline and hash-skip as the link cards (EXIF `lsp-kit:` hash; images
  for slugs no longer listed are deleted, except with `--only`).
  `CARDS_OUT_DIR=<dir>` writes proofs somewhere else.
- First person: "LSP Giving Tuesday", "Help me" / "raise {goal}", "Tuesday,
  Dec 1", the short link, then their why in quotes (verbatim, emoji left off,
  cut at a word with "…" only if nothing else fits) and their full name in bold
  as the signature. No why: the name alone.
- Photo: the same large cutout as the link card
  (`marketing/popup-week1/instructors/<avatar>.png`), bottom-anchored, pushed
  right; the quote and name sit in a column to its left, as wide as the
  cutout's row outline allows with 40 px clear. The script prefers a readable
  quote (33 px feed, 40 px story) over a bigger photo, then allows smaller. The
  name never wraps. The whole why is tried at every readable size before a cut
  one.
- Round photo: a cutout cut off by its own left side, or an avatar on
  `ALWAYS_CIRCLE`, becomes a face-centred circle on white at the right of the
  lower part, where the full photo would stand (360 to 500 px feed, 380 to
  520 px story, never larger than its source). It is cut straight from the
  large cutout (the pop-up avatar's square crop, face box from
  `marketing/giving-tuesday-2026/email-1/facebox.py`), because the 320 px
  avatar would be soft. The quote and name sit in the column to its left,
  40 px clear, centred on the circle. The circle shrinks before the quote is
  cut. No cutout at all: type only, quote big and full width.
- No why and a name too long to sit beside the circle at full size: the
  circle moves to the left margin and the name goes on its own line under it,
  full size, left-aligned with the type above (lucia-del-rincon-martinez).
- `marketing/giving-tuesday-2026/kit-photos/<avatar>.png` (kit only): a
  larger cutout of the same photo, used for the circle instead of the pop-up
  cutout when that one is too small to stay sharp. lucia-del-rincon-martinez's
  pop-up cutout is 300x300; hers is the 800x800 original
  (`public/images/gala/2026/honorees/lucia-del-rincon.jpg`, registered to the
  300 px cutout: exactly 8/3 scale, so the same image), cut out with
  `scripts/tools/cutout` plus the 300 px cutout's matte to close hair gaps
  (`merge-matte.py` beside it).
- `ALWAYS_CIRCLE` (in both renderers, link card included): `lizett-galan`,
  `alondra-alcazar` (cutouts end in straight cut edges) and
  `lucia-del-rincon-martinez` (cutout too small). Add an avatar
  there when its cutout looks wrong standing on the yellow.
- Story: type between 272 px and 1620 px; the full photo runs under the bottom
  bar, the circle stays above it so the face is never under the reply bar.
- Fails loudly if any line is near an edge, outside the safe area, or within
  40 px of the photo or circle, if the face box runs off the frame, or if the
  circle leaves the margins or safe area.

## Canvas fallback (`kitCanvas.js`)

- Only for someone approved since the last `giving:cards` run. Same first
  person words: "Help me" / "raise $150", their name in bold under the
  headline, date and link, over the class photo.

- The share card's identity: flat #FFDE59 panel on top, ink #1e1e1e, Rubik 400/700
  (`document.fonts.load` before drawing), `public/logo.png` whole (its empty
  transparent margin trimmed), `public/images/givingtuesday/wall/one-960.webp` under
  the panel. Type on the yellow only, never on the photo.
- Words: "LSP Giving Tuesday", "Help me" / "raise $150", their name, "Tuesday,
  Dec 1", the short link without `https://`.
- Fit: the headline starts at 112 px (feed) / 150 px (story) and shrinks until each
  line fits the width and the block fits between the logo and the panel's bottom
  margin. The name and the link shrink to fit the width. `drawKit()`
  returns the ink boxes and `fitsFrame()` checks them.
- Story: logo and type stay below the top 272 px and inside the yellow (ends at
  1110 px), clear of Instagram's top bar; the photo runs under the bottom UI.

## Dev mock URLs (dev server only)

- `/give/?i=alondra-alcazar&mock=5&total=6240` (avatar, why, own Zeffy URL)
- `/give/?i=amayrani-nunez&mock=5&total=6240` (no own URL: campaign Give)
- `/give/?i=andrea-fuentes&mock=5&total=6240` (no avatar: initials)
- `/give/?i=nobody&mock=5`, `/give/?i=alondra-alcazar&mock=fail`, `/give/?mock=5`
- `/givingtuesday/kit/?i=alondra-alcazar&mock=5`, `/givingtuesday/kit/?mock=5`,
  `/givingtuesday/kit/?mock=0`, `/givingtuesday/kit/?mock=fail`,
  `/givingtuesday/kit/?i=alondra-alcazar&mock=5&prize=Some+prize`
