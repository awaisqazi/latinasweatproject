# Zeffy plan: generalize entertainment on the 2026 gala ticketing form

Target: the live Zeffy ticketing form **"LSP 2026 Gala @ MCA Chicago"**
(public URL: https://www.zeffy.com/en-US/ticketing/lsp-museum-of-contemporary-art-chicago-2026-gala),
managed from the Zeffy dashboard under the Latina Sweat Cares account
(collab@latinasweatproject.com, already authenticated in Chrome; a Zeffy tab
is open in the browser tab group).

## Why
Mariachi Sirena and DJ Barbie are NOT confirmed for 2026. All other channels
(website, flyer, socials, video, ads) already say "live music" / "a live DJ".
The Zeffy form is the last surface still naming them. There is also a known
count bug in the Community Sponsor description.

## Edits (ticket DESCRIPTIONS only)

1. **BENEFACTOR: The Full Evening** description:
   - "beginning with cocktail hour at 6pm featuring the all-female mariachi
     ensemble Mariachi Sirena, set against..." → "beginning with cocktail
     hour at 6pm with live music, set against..."
   - House style bonus (same field, only while already editing): replace the
     em-dash construction "until midnight — plus a can't-miss fashion show on
     the fourth floor from 10–11pm" with "until midnight, plus a can't-miss
     fashion show on the fourth floor from 10 to 11pm".
   - The phrase "dancing with our DJ" in this description is already generic;
     leave it.
2. **SUPPORTER: Late Night Access** description:
   - "dancing with DJ Barbie until midnight" → "dancing with a live DJ until
     midnight"
   - "fashion show from 10–11pm — all set against the backdrop" →
     "fashion show from 10 to 11pm, all set against the backdrop"
3. **COMMUNITY SPONSOR** description:
   - "four 'Benefactor' tier tickets" → "five 'Benefactor' tier tickets"
     (the group ticket includes 5; the text says four — known bug).
4. **Report only (no change):** note which cover image the form currently
   displays (the glowing-X facade, the atrium, or the glow variant) so the
   local asset folder can mark the right file as canonical.

## Guardrails (hard rules)

- Edit ONLY the rich-text ticket descriptions. Do NOT touch prices, ticket
  quantities, group-ticket counts, tier names, sale dates, form settings,
  payment settings, or form status. Do not create or delete tickets.
- This is a LIVE payment form: after saving, reload the PUBLIC form URL and
  re-read all three descriptions to verify the exact new text (and that
  nothing else changed).
- If the editor UI differs from expectations, a permission wall appears, or
  a save fails twice: stop and report; do not improvise.
- No em-dashes in any new copy.
- Screenshot before every click (viewport widths can shift between shots).
