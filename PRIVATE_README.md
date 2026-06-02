# Private Operations Notes

## Google Ads / GA4 Conversion Setup

The site sends meaningful GA4 events through `window.trackConversion(...)`. No Google Ads event conversion labels are hard-coded for the new events because labels must come from Google Ads after conversion actions are created.

After deploying:

1. In GA4, verify these events appear in Realtime/DebugView: `class_booking_start`, `contact_form_submit`, `membership_purchase_start`, `donation_click`, `app_download_click`, and `newsletter_signup_start`.
2. Mark the meaningful events as GA4 key events. Prioritize `class_booking_start` and `contact_form_submit`.
3. In Google Ads, import the GA4 key events as conversions.
4. Set `class_booking_start` and `contact_form_submit` as Primary conversion actions for bidding.
5. Keep `membership_purchase_start`, `donation_click`, `app_download_click`, and `newsletter_signup_start` as Secondary unless the account decides to optimize toward them.
6. Move the existing `About Us` page-view conversion to Secondary after the new imported conversions are active and recording.
7. If Google Ads event snippets are preferred later, create each conversion action in Google Ads first, then add the real generated labels. Do not invent labels in code.

Mariana Tek embedded widget completion tracking is not available from the static parent page. The site should track only CTAs around Mariana Tek, never modify the widget container attributes beyond the original `data-mariana-integrations` values. For actual reservation starts/completions, configure Mariana Tek's GA4 support or server-side/webhook reporting and reconcile the event names with the GA4 import plan above.

## Google Ads Grants Optimization Loop

Monthly review cadence:

1. Pull Google Ads search terms, conversion action performance, keyword Quality Score, and asset performance.
2. Pull Google Search Console queries for `/schedule/`, `/pricing/`, `/contact/`, `/classes/`, `/links/`, and `/impact/`.
3. Add useful, mission-aligned queries as tightly themed keywords only when the landing page already supports that intent.
4. Add irrelevant or off-mission queries as negatives.
5. Pause single-word keywords and keywords with Quality Score 1 or 2 to protect Ad Grants compliance.
6. Refresh responsive search ad assets with page-specific copy from the website.
7. Confirm sitemap submission in Search Console uses `https://latinasweatproject.com/sitemap-index.xml`.
