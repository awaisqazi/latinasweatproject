# Google Ads plan: Gala tickets on sale (July 2026)

Account: **THE LATINA SWEAT CARES** (Google Ad Grants, ID 967-426-9882), accessed via
collab@latinasweatproject.com in Chrome at https://ads.google.com. Six Search
campaigns as of June 2026; the two touched here are **LSP Grants | Fundraising
Gala & Impact** and the free-classes ad groups ("Free Community Classes" in
"Maximize Page Views", plus any free-class ads in "LSP Grants | Spanish &
Community Access").

## Context (verified facts, do not improvise beyond these)

- LSP 2026 Annual Gala: Friday, September 25, 2026, 6 PM to midnight, Museum of
  Contemporary Art Chicago, black tie.
- Tickets and sponsorships are ON SALE NOW at the Zeffy form; the website's
  /gala/ page is the ads destination (it now carries prices, an evening
  timeline, and Get Tickets CTAs straight to Zeffy).
- Prices: Benefactor "The Full Evening" $325 early bird / $375 regular (from
  6 PM, sales close Sep 15). Supporter "Late Night Access" $200 early bird /
  $225 regular (from 9 PM). Early-bird pricing through July 31. Sponsorships
  $10,000 / $5,000 / $2,500, close Sep 15.
- The site fires a `gala_ticket_click` gtag event on every gala CTA (sent to
  GA4 `G-RW22LK0G9J` and Google Ads `AW-17990206229`).
- Free classes promo: the site currently advertises "Free Classes, Two
  Locations · May to July 2026" (Pilsen studio + Southside Social). The old ad
  copy referencing "May & June" expired June 30 and must be refreshed.

## Tasks (in order)

### 1. Refresh the Fundraising Gala campaign ads
In **LSP Grants | Fundraising Gala & Impact**, open each ad group's responsive
search ads and update them to announce the sale:
- Headlines to work in (pick per 30-char limit): "Gala Tickets On Sale Now",
  "LSP Annual Gala · Sep 25", "Black-Tie Gala at MCA Chicago", "Early Bird
  Ends July 31", "Support Latina-Led Wellness", "An Unforgettable Evening".
- Descriptions (≤90 chars each, factual): e.g. "Tickets on sale now for our
  black-tie gala at the MCA. Every seat funds free wellness classes."; "Join
  Chicago leaders Sept 25. Early-bird tickets through July 31."
- Final URL: https://latinasweatproject.com/gala/ (display path e.g.
  /gala/tickets is fine as a vanity path).
- Remove/replace any stale "coming soon" or interest-list phrasing.
- Do NOT change budgets, bidding strategies, or campaign status.

### 2. Fix the expired free-classes copy
In "Free Community Classes" (Maximize Page Views) and any Spanish equivalents:
replace "May & June" promo phrasing with the current reality (free classes
through July 2026, two locations). If unsure of a claim, prefer evergreen
copy ("Free community classes in Pilsen") over dated copy.

### 3. Add a gala sitelink
Assets → Sitelinks: create "2026 Gala Tickets" → https://latinasweatproject.com/gala/
(description lines e.g. "Black-tie gala at MCA Chicago" / "Early bird through
July 31"). Associate at account level, or at minimum with: Fundraising Gala &
Impact, Brand & Mission, Maximize Page Views. Note: /donate is NOT a valid
destination (meta-redirects off-domain); /gala/ is on-domain and valid.

### 4. Import gala_ticket_click as a conversion
Goal: make the new event countable in Ads without site-code changes.
1. In GA4 (analytics.google.com, property with stream G-RW22LK0G9J, same
   collab@ login): Admin → Data display → Events. If `gala_ticket_click` has
   been received (site deployed + clicked at least once), toggle "Mark as key
   event" (or create it under Key events). If the event has NOT yet appeared
   (site not deployed yet), create the key event by name manually: Admin →
   Key events → New key event → `gala_ticket_click`.
2. In Google Ads: Goals → Conversions → New conversion action → Import →
   Google Analytics 4 properties → Web → select `gala_ticket_click` → set
   category "Contact" or "Page view"-adjacent (closest honest fit: "Contact"),
   and set it as a **Secondary** action for now (observation only) so it does
   not disturb the grant's Maximize Conversions bidding. Flag in your report
   that LSP can flip it to Primary for the gala campaign later if they want
   bidding to chase ticket clicks.
If the GA4 property is not linked to the Ads account, link it first (GA4
Admin → Product links → Google Ads) or report the blocker.

### 5. Verify image assets
Asset library: confirm the 4 photo assets added 2026-06-18 (DSCF2699,
DSCF3099, DSCF3097, DSCF3102) and the MCA gala-venue image are "Approved",
not still "Pending" or "Disapproved". Report status; do not re-upload.

## Account quirks (read before touching anything)

- An ad-blocker extension hides rows of the /aw/ads table (user-origin CSS
  sets `.ess-table-canvas { display:none }`). Read table data via the
  javascript tool or work through the ad-group/ad edit flows directly.
- The viewport width flips between 1512 and 1536 px between screenshots,
  shifting button positions: take a fresh screenshot before every click.
- Local file upload into Google Ads does NOT work via the extension's
  file_upload; if an image is ever needed, import via Asset library → Upload →
  From Google Drive. Re-associate large existing assets via the Suggested/
  Asset library tab (never the re-upload path, it errors on ~10MB files).
- Display paths on ads are vanity paths; final URLs must be real pages.

## Guardrails

- Never touch budgets, bid strategies, campaign status (pause/enable), or
  delete anything.
- All copy must match the verified facts above; when a fact is missing, write
  around it rather than inventing.
- Ad Grants policy: keep quality high (multiple headlines/descriptions per
  RSA), destinations on latinasweatproject.com.
- Record every change made (campaign / ad group / ad / asset, before → after)
  and report it back.
