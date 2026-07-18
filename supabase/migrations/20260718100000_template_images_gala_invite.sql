-- Templates can now carry inline image attachments (site-relative URLs) that
-- the donor mail-merge panel renders with copy-to-clipboard buttons, and the
-- library gains the formal 2026 gala invite used by the "send the gala
-- invite" preset task.

alter table public.fundraising_templates
  add column if not exists image_urls text[] not null default '{}';

insert into public.fundraising_templates (category, title, kind, subject, body, sort_order, image_urls)
values
(
  'Donor Relations', 'Gala 2026 formal invite', 'email',
  $$Your invitation: The Latina Sweat Project Annual Gala · September 25$$,
  $tpl$Dear [First Name],

It is my privilege to invite you to The Latina Sweat Project's Annual Gala, held this year at one of our city's great cultural landmarks: the Museum of Contemporary Art Chicago. For one night, this extraordinary space is ours, and we would be honored to have you in the room.

Friday, September 25, 2026 · six o'clock in the evening until midnight
Museum of Contemporary Art Chicago · 220 East Chicago Avenue · Black tie

The evening begins with cocktails and live music as the galleries glow around us, followed by a seated three-course dinner and a live auction in support of our mission. From nine o'clock the museum is ours after dark: open galleries and an open bar until midnight, an awards presentation honoring the leaders who carry this work forward, a fourth-floor fashion show, and dancing with a live DJ to close the night.

Your support is part of how we got here. [Add a personal line about their giving or connection to LSP.] Every seat and every sponsorship funds accessible wellness across Chicago, along with the 200-hour teacher training scholarships that turn our own participants into certified instructors and community leaders.

Seats are limited and sponsorships close on September 15. Reserve your evening at latinasweatproject.com/gala. I would be honored to welcome you to the museum this fall, and prouder still to have you standing beside us as we build what comes next.

Con luz y amor,
[Your Name]
The Latina Sweat Project

P.S. Your formal invitation and an overview of the evening are below.$tpl$,
  15,
  array['/images/gala/gala-2026-invite-letter.png', '/images/gala/gala-2026-evening-overview.png']
)
on conflict (category, title) do nothing;
