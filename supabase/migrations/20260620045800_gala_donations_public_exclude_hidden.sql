-- Hidden donations (ticket sales, extras.hidden=true) must never appear in the
-- public ticker, leaderboard, or fundraising total. The anon key can't read
-- extras, so the client-side !hidden filter was a no-op; filter here instead.
create or replace view public.gala_donations_public as
  select
    d.id,
    d.amount,
    coalesce(
      nullif(btrim((coalesce(g.first_name, ''::text) || ' '::text) || coalesce(g.last_name, ''::text)), ''::text),
      d.donor_name,
      'Anonymous'::text
    ) as donor_name,
    d.paddle_number,
    d.created_at
  from public.gala_donations d
  left join public.gala_guests g on g.paddle_number = d.paddle_number
  where not coalesce((d.extras ->> 'hidden')::boolean, false);
