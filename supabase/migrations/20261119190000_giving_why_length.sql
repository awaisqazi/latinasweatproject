-- A fundraiser's "why" may be up to 300 characters when an admin sets it
-- (the public sign-up form and giving-signup still cap new sign-ups at 160).
-- Raised 2026-11-19 so an instructor's longer why could be stored verbatim.
alter table public.giving_fundraisers
  drop constraint if exists giving_fundraisers_why_check;
alter table public.giving_fundraisers
  add constraint giving_fundraisers_why_check
  check (why is null or char_length(why) <= 300);
