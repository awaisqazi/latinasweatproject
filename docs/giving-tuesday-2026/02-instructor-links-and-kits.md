# 02. Instructor links and kits

Front end only. Both pages read the existing `giving_public` RPC (section 1 of
`01-backend-contract.md`); no table, RPC or edge function was added.

## Short link: `/give/<slug>`

- Public address: `https://latinasweatproject.com/give/<slug>` (`shortLink()` in
  `src/data/givingTuesday.js`). `<slug>` is the fundraiser slug from the RPC.
- GitHub Pages is static, so `/give/<slug>` is a 404. `src/pages/404.astro` matches
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

## Share kit: `/givingtuesday/kit/?i=<slug>`

- `src/pages/givingtuesday/kit.astro` + `GivingKitApp.svelte`. Send each instructor
  `https://latinasweatproject.com/givingtuesday/kit/?i=<slug>`.
- Shows the short link (Copy, Share where the browser has a share sheet, "Open your
  page"), three captions (`givingKitCopy.captions`, each leads with "LSP Giving
  Tuesday", Copy + Share), and two images drawn in the browser by
  `src/lib/givingTuesday/kitCanvas.js`: 1080x1350 feed and 1080x1920 story, JPEG,
  Download (and Share with the file where `navigator.canShare({ files })` is true).
- No `?i=`, or a slug not on the board: a name picker built from `fundraisers`
  (sorted by name). Choosing a name rewrites the URL to `?i=<slug>`.
- Mentions the thank-you drawing only when the campaign's `prize_label` is set.
  Always says "Your own gift is welcome, but it doesn't count toward the $150."
- Nothing per person is stored in the repo; a new approved fundraiser has a working
  link and kit as soon as the RPC lists them.

## Images (`kitCanvas.js`)

- The share card's identity: flat #FFDE59 panel on top, ink #1e1e1e, Rubik 400/700
  (`document.fonts.load` before drawing), `public/logo.png` whole (its empty
  transparent margin trimmed), `public/images/givingtuesday/wall/one-960.webp` under
  the panel. Type on the yellow only, never on the photo.
- Words: "LSP Giving Tuesday", "Help {first}" / "raise $150", "Tuesday, Dec 1", the
  short link without `https://`.
- Fit: the headline starts at 112 px (feed) / 150 px (story) and shrinks until each
  line fits the width and the block fits between the logo and the panel's bottom
  margin; a long first name may go on its own line ("Help" / name / "raise $150")
  when that is clearly bigger. The link shrinks to fit the width. `drawKit()`
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
