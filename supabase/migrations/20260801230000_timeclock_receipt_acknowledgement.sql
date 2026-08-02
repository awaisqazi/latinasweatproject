-- Message acknowledgements for the time clock kiosk.
--
-- The kiosk's success screen now holds announcements on screen until the
-- employee taps "Got it" (with a safety auto-return). seen_at records that a
-- message was displayed; acknowledged_at records the explicit tap. A message
-- stops gating an employee once any of their receipts for it carries an
-- acknowledgement, so long-lived announcements don't nag on every punch.

alter table public.timeclock_message_receipts
  add column if not exists acknowledged_at timestamptz;

comment on column public.timeclock_message_receipts.acknowledged_at is
  'When the employee explicitly tapped "Got it" on the kiosk; null = displayed but not confirmed.';

notify pgrst, 'reload schema';
