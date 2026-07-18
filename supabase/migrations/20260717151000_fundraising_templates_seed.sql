-- Seed the fundraising template library from "LSP Templates & Master CRM"
-- (PDF updated 6/27/26). Bodies preserve the original wording; only PDF
-- extraction artifacts were cleaned up. Idempotent via the (category, title)
-- unique key so re-running never duplicates or clobbers in-app edits.

insert into public.fundraising_templates (category, title, kind, subject, body, sort_order)
values
(
  'Donor Relations', 'Donation thank-you', 'email', null,
  $tpl$Dear [Donor Name],

Gracias — thank you. Your generosity to The Latina Sweat Project means our community gets to keep showing up for each other, on and off the mat.

Because of you, we're able to [briefly describe the impact or example: keep our classes free and accessible, expand our yoga teacher training scholarships, stock our studio with mats and supplies for neighbors who need them, and bring wellness to another corner of Chicago's Southwest Side].

We started as pop-up classes in underserved neighborhoods because we believed healing and movement shouldn't come with a price tag or a barrier. Every gift like yours is a reminder that this vision of a wellness space led by us, for us, is being built by a whole community of people who believe in it too.

We're so grateful to have you as part of the LSP familia. Thank you for moving with us.

Con gratitud / With gratitude,
[Your Name]
[Title]
The Latina Sweat Project

PERSONAL TOUCH (optional, add one or two):
- Thank you for showing up on your mat and in our community.
- We're grateful for your continued support of LSP — it doesn't go unnoticed.
- Your sponsorship helped make [event/program] possible for so many.
- It was such a joy meeting you and hearing what drew you to our mission.
- Thank you for believing in a Latina-led vision for wellness.

IMPACT STATEMENT (choose one):
- Your generosity keeps yoga and wellness free and accessible for the neighbors who need it most.
- Every gift brings us closer to a wellness industry led by the communities it serves.
- Your support directly funds scholarships, supplies, and safe spaces for BIPOC women and families.
- Together, we're building a healthier, more connected Chicago — one class at a time.
- Thank you for helping turn community care into everyday practice.$tpl$,
  10
),
(
  'Donor Relations', 'Donor tracking checklist', 'reference', null,
  $tpl$Use this checklist after referencing the donor's information in the CRM.

RECORD THE BASICS:
- Donor Name
- Organization (if applicable)
- Donation Date
- Donation Amount/Item
- Campaign or Program Supported
- Acknowledgment Sent By
- Date Thank-You Sent

ACKNOWLEDGMENT TYPE:
- Email
- Printed Letter
- Handwritten Card
- Phone Call
- Social Media Recognition (with permission)
- In-Person Thank You

FOLLOW-UP NEEDED:
- Invite to upcoming class/event
- Add to newsletter
- Schedule stewardship call
- Share impact report
- No additional follow-up at this time

RELATIONSHIP NOTES:
- How did this donor become connected to LSP (class, event, social media, word of mouth)?
- Any personal interests or giving preferences?
- Future stewardship opportunities (teacher training sponsor, event host, recurring donor)?
- Additional notes$tpl$,
  20
),
(
  'Donor Relations', 'Questions for outreach (CRM fields)', 'reference', null,
  $tpl$Fields to capture for every donor and prospect relationship:

- Warm Introduction Source (Who connected you?)
- Board Connection (Which board member knows them?)
- Last Contact Date
- Next Action
- Preferred Communication Method
- Areas of Interest (Youth, wellness, equity, education, etc.)
- Capacity Estimate (Small, Medium, Major donor potential)
- Relationship Owner (Who on your team manages the relationship?)

These fields live on each donor's profile in the Donors tab. Keeping them current is what makes handoffs and outreach campaigns work.$tpl$,
  30
),
(
  'Sponsorship & Partnerships', 'Partnership outreach', 'email', null,
  $tpl$Hi [First Name],

I hope you're doing well! My name is [Your Name], and I'm reaching out on behalf of The Latina Sweat Project, a Chicago-based nonprofit making yoga and wellness accessible to all, especially in communities that have historically been left out of these spaces.

We admire the work [Organization/Company Name] is doing in our community, particularly [mention something specific about their mission, programs, or impact]. It aligns closely with what we're building here at LSP.

Our mission is to break down the financial and cultural barriers that keep people, especially Latina, Black, and Indigenous communities from accessing yoga, movement, and mental health resources. What started as free pop-up classes in underserved Chicago neighborhoods has grown into a studio, a teacher training program, and a movement led by the very communities we serve. We're always looking to build partnerships with organizations who share our commitment to accessible wellness and community care.

I'd love the chance to connect and explore what a collaboration could look like, whether that's community programming, sponsorship, employee wellness experiences, fundraising initiatives, volunteer engagement, or something we dream up together. There may be real opportunities here to create impact side by side.

If you're open to it, I'd love to grab 20–30 minutes on a call at a time that works for you.

Thank you for your time and consideration. I'd be honored to learn more about your work and share more about ours.

Con gratitud / Warmly,
[Your Name]
[Title]
The Latina Sweat Project
[Phone Number]
[Email Address]
[Website]$tpl$,
  10
),
(
  'Sponsorship & Partnerships', 'Partnership follow-up', 'email',
  'Following up: [Organization Name] x The Latina Sweat Project',
  $tpl$Hi [First Name],

I wanted to follow up on my note from last week about a possible partnership between [Organization/Company Name] and The Latina Sweat Project. I know inboxes get full, so no worries at all if it got buried!

We're still really excited about the alignment between our work — especially [specific detail about their programs/mission]. Whether it's community programming, sponsorship, employee wellness experiences, or something else entirely, I'd love to find 20–30 minutes to talk through what could make sense together.

If now isn't the right time, that's completely okay too — I'd just love to know so I can follow up down the road instead of leaving you guessing.

Thank you again for considering this. Looking forward to hearing from you.

Con cariño / Warmly,
[Your Name]
The Latina Sweat Project$tpl$,
  20
),
(
  'Sponsorship & Partnerships', 'Partnership or sponsorship renewal', 'email',
  'Renewing our partnership for [Year/Season]',
  $tpl$Hi [First Name],

As we look ahead to [upcoming season/year], I wanted to reach out about renewing our partnership between [Organization/Company Name] and The Latina Sweat Project.

Last [year/season], your support helped us [specific impact — e.g., fund X teacher-training scholarships, sponsor X free classes, provide mats and supplies for X community members]. That kind of partnership doesn't just fund programming — it tells our community that organizations like yours believe accessible wellness is worth investing in.

We'd love to keep building on that together. [Mention relevant updates: new studio, new programs, growth in students served.]

I'd welcome the chance to hop on a call and talk through what a renewed partnership could look like for [Year]. Let me know what works for your schedule.

Thank you for standing with us.

Con gratitud / Warmly,
[Your Name]
The Latina Sweat Project$tpl$,
  30
),
(
  'Sponsorship & Partnerships', 'Gala sponsorship packages', 'reference', null,
  $tpl$TICKETS

BENEFACTOR — The Full Evening | $375 (Early Bird $325)
Includes: cocktail hour, three-course dinner, garden access, full museum access, open bar (9pm–12am), live entertainment, awards ceremony, and fashion show.

SUPPORTER — Late Night Access | $225 (Early Bird $200)
Includes: full museum access, open bar (9pm–12am), awards ceremony, fashion show, and dancing.

Early bird dates: July 1 to August 1.

SPONSORSHIPS

Presenting Sponsor — $10,000
As our Presenting Sponsor, your organization takes center stage as the headline partner of this year's gala at the Museum of Contemporary Art Chicago. Your brand will be featured as "presented by" across all event materials, including invitations, signage, and the official program, with prominent placement at the entrance and main stage throughout the evening.
Includes: cocktail hour, three-course dinner, garden access, full museum access, open bar (9pm–12am), live entertainment, awards ceremony, and fashion show for 20.

Gold Sponsor — $5,000
Gold Sponsors receive premier recognition throughout the evening, with logo placement on event signage and in the official program, along with a verbal mention during our awards presentation.
Includes: cocktail hour, three-course dinner, garden access, full museum access, open bar (9pm–12am), live entertainment, awards ceremony, and fashion show for 10.

Community Sponsor — $2,500
This package includes logo placement on event signage and recognition in the official program.
Includes: cocktail hour, three-course dinner, garden access, full museum access, open bar (9pm–12am), live entertainment, awards ceremony, and fashion show for 5.

EVENT DETAILS
- Event: LSP Gala
- Date: Friday, September 25, 2026, 6:00 PM CT
- Venue: Museum of Contemporary Art Chicago, 220 E Chicago Ave
- Dress code: Black tie$tpl$,
  40
),
(
  'Grants', 'Grant inquiry / letter of intent', 'email',
  'Letter of Intent: The Latina Sweat Project',
  $tpl$Dear [Program Officer Name / Foundation Name],

On behalf of The Latina Sweat Project, thank you for the opportunity to submit this Letter of Intent for [Grant Name / Program].

The Latina Sweat Project is a Chicago-based 501(c)(3) nonprofit founded in 2022 to make yoga and wellness accessible to communities that have historically been priced out or left out of these spaces. What began as free pop-up yoga classes in underserved neighborhoods on Chicago's Southwest and South Sides has grown into a dedicated studio, a free 200-hour yoga teacher training program, and a grassroots movement serving thousands of community members monthly.

Our mission is to create long-term, systemic change in the wellness industry by ensuring yoga and mental health resources are led by the communities they serve — beginning with removing the financial barriers that keep so many from accessing a safe space to practice.

We are requesting [amount/range] to support [specific program: teacher training scholarships, studio operations, community programming expansion]. This funding would allow us to [specific, measurable impact — e.g., certify X new instructors, serve X additional community members annually].

We would welcome the opportunity to share more about our work and are glad to provide any additional information your review process requires.

Thank you for considering The Latina Sweat Project.

Respectfully,
[Your Name]
[Title]
The Latina Sweat Project$tpl$,
  10
),
(
  'Community & Involvement', 'How do I get involved?', 'email',
  'Ways to get involved with LSP',
  $tpl$Hi [First Name],

Thank you so much for reaching out — we love hearing from folks who want to get involved!

Here are a few ways to connect with The Latina Sweat Project:
- Attend a class: [link/schedule]
- Volunteer at an event: [link/contact]
- Apply for teacher training: [link/timeline]
- Donate or sponsor: [link]
- Follow us on Instagram @latinasweatproject for updates

Let us know which of these feels like the right fit, and we'll point you in the right direction.

Con gratitud,
The Latina Sweat Project Team$tpl$,
  10
),
(
  'Teacher Training', 'YTT acceptance', 'email',
  $$You're in! Welcome to LSP Teacher Training$$,
  $tpl$Dear [Name],

Felicidades — congratulations! We are so excited to welcome you into The Latina Sweat Project's [Season/Year] 200-hour Yoga Teacher Training program.

This program exists because we believe yoga certification and mental health resources should be led by the communities they serve — and that includes you. [Optional: add a personal note about what stood out in their application.]

Here's what to expect next:
[Start date, orientation info, schedule, required materials, contact info]

This journey is going to challenge you, grow you, and connect you to a community of instructors who reflect the neighborhoods we serve. We are honored to walk it with you.

Con mucho orgullo y cariño,
[Your Name]
The Latina Sweat Project$tpl$,
  10
),
(
  'Teacher Training', 'YTT decline', 'email',
  'Update on your LSP Teacher Training application',
  $tpl$Dear [Name],

Thank you so much for applying to The Latina Sweat Project's [Season/Year] Yoga Teacher Training program, and for trusting us with your story and your interest in this path.

After thoughtful review, we aren't able to offer you a spot in this cohort. This was not an easy decision — we received applications from so many incredible people, and space in our free program is limited.

This is not a reflection of your worthiness or your journey. We'd love to stay connected: [mention future cohorts, community classes, ways to stay involved, newsletter, social media].

Thank you again for applying, and for being part of this community in whatever way you choose next.

Con cariño,
[Your Name]
The Latina Sweat Project$tpl$,
  20
),
(
  'Reference', 'LSP one-pager', 'reference', null,
  $tpl$MISSION
Latina Sweat Project is a movement building access to yoga, holistic health, and culturally rooted movement for our communities in Chicago and beyond. Rooted in the Latina experience and built for all, we center wellness and community care as pathways to healing, restoration, and collective strength.

VISION
We imagine a future where culturally rooted wellness spaces exist in every neighborhood and are held as essential community infrastructure. We are Latinas to the world, building community wellness para la comunidad.

ABOUT US
What began as classes in Little Village has grown into daily programming in our studio located in the southwest side of Chicago, in the spaces where our neighbors gather. Through free classes, 200-hour teacher training scholarships, mutual aid, and community care, we center wellness as restoration and collective strength. After a year of rising demand, with over 250,000 people joining us for free programming, our new studio is a home for healing and leadership development. It's a step toward a future where care is never out of reach.

VALUES
- Accessibility: Wellness is not a luxury. We keep movement, healing, and leadership opportunities accessible across income levels and communities.
- Cultural Rootedness: Our work is grounded in Latina leadership and shaped by the diverse communities we serve. We believe: families belong together, no one is illegal on stolen land, Black Lives Matter, Trans Lives Matter, and we stand with Palestine.
- Collective Care: Healing happens in the community. Through mutual aid, organizing, and intentional programming, we invest in the wellbeing of our neighborhoods.
- Belonging: We create spaces where people across identities, bodies, and backgrounds feel seen, safe, and welcomed. We were built for our Black, Indigenous, LGBTQ+, and people of color neighbors.
- Leadership Pathways: We cultivate pathways from participant to instructor to community leader, so this work can grow far beyond a single studio or city.
- Integrity and Alignment: We partner with organizations and supporters who respect our communities and believe in long-term investment in accessible wellness.

OUR FOUNDER
Margarita Quiñones Peña, a proud first-generation Mexican immigrant, founded Latina Sweat Project in 2022 with the vision of making wellness accessible to all. Born in Durango, Mexico, and raised in Chicago, Margarita's journey, from navigating life as an undocumented student to becoming a software engineer, published author, and 500 E-RYT certified yoga instructor, embodies resilience and equity in action.

OUR IMPACT
- 5,000+ participants monthly across Chicago
- 250,000+ registrations for free programming to date
- New community studio opened in 2025
- First 200-hour BIPOC Yoga Teacher Training cohort in progress

JOIN THE MOVEMENT
Learn more or support our work: www.latinasweatproject.org · Chicago, IL · info@latinasweatproject.org$tpl$,
  10
),
(
  'Reference', 'Mission, vision & taglines', 'reference', null,
  $tpl$MISSION
Latina Sweat Project is a movement building access to yoga, holistic health, and culturally rooted movement for our communities in Chicago and beyond. Rooted in the Latina experience and built for all, we center wellness and community care as pathways to healing, restoration, and collective strength.

VISION
We imagine a future where culturally rooted wellness spaces exist in every neighborhood and are held as essential community infrastructure. What began as classes in Little Village has grown into a movement grounded in Latina leadership and expanding nationwide through digital training, community partnerships, and permanent wellness hubs. Our long-term vision is to build a network of community-led wellness spaces, supported by trained instructors and aligned institutions, so that wellness, healing, and belonging are never out of reach. We are Latinas to the world, building community wellness para la comunidad.

POSITIONING
Latina Sweat Project is a community-led wellness movement rooted in Chicago and growing across communities nationwide. We create accessible, culturally grounded spaces for movement, restoration, and collective care while training the next generation of wellness leaders from our own neighborhoods. Rooted in Latina leadership and open to all, we are building wellness spaces where our communities belong, lead, and thrive.

TAGLINES
- More than a yoga studio. A movement for community wellness.
- Rooted in Latina leadership. Built for all.
- From Chicago, para la comunidad everywhere.
- Latinas to the world. Community wellness for all.$tpl$,
  20
),
(
  'Reference', 'Partner toolkit: voice & messaging', 'reference', null,
  $tpl$Use this guide when posting, speaking about, or partnering with Latina Sweat Project. It ensures our community, voice, and purpose are represented with care and consistency.

WHO WE ARE
Latina Sweat Project is a community-led wellness movement expanding access to yoga, holistic health, and culturally rooted movement across Chicago and beyond. Rooted in Latina leadership and built for all, we center wellness and community care as pathways to healing, restoration, and collective strength.

Abridged: Latina Sweat Project is a Chicago-based community wellness movement expanding access to yoga and holistic health while building Latina and BIPOC leadership in wellness.

VOICE
Inclusive · Community-first · Grounded · Proud · Warm · Direct

TONE SHIFTS BY CONTEXT
- Community celebration: warm, proud, inclusive
- Class or resource sharing: direct, grounded, welcoming
- Partnership announcements: direct, warm, community-centered
- Sensitive moments: grounded, human, direct

CORE LANGUAGE
- Community and belonging: para la comunidad, collective, neighbors, together, shared, belonging
- Movement and growth: building, becoming, showing up, rising, expanding, growing
- Healing and wellness: restoration, care, grounded, breath, release, support, access, wellness equity
- Rooted in culture: Chicago, Little Village, home, immigrant, our neighborhoods, our people
- Power and resilience: strength, thrive, leadership, joy, pride, imagine

WORDS TO AVOID
Innovation, disrupt, scalable, leverage, push, underprivileged, less fortunate. We are building with the community, not positioning ourselves above it.

WHAT TO SHARE WHEN COLLABORATING
Share: real experiences in our space, class moments and community energy, instructor or participant voices, reflections on how the space feels, moments of connection and care.
Avoid: overly staged or exclusive-feeling content, luxury-only framing, language that positions community as charity, corporate or overly polished messaging.

TAGGING
Instagram/TikTok/LinkedIn: @latinasweatproject$tpl$,
  30
),
(
  'Reference', 'Meeting agenda & success checklist', 'reference', null,
  $tpl$PURPOSE
Meetings are a dedicated space for connection, communication, and collective growth. Rather than simply sharing updates, meetings should be used to align around our mission, solve challenges together, and move important work forward. Every meeting should leave participants feeling informed, supported, engaged, and clear on next steps.

ROLES
- Facilitator: guides discussion with an agenda, sends the invite with the virtual meeting link, keeps the meeting on schedule, encourages participation, clarifies decisions and action items, maintains notes attached to the event invite. Assign a facilitator or owner for every agenda section before the meeting.
- Co-Pilot: admits participants, monitors chat and questions, keeps time, troubleshoots technical issues, records attendance, captures action items. Identify the Co-Pilot before the meeting.

MEETING FLOW
1. Welcome & Icebreaker (5–10 min): create presence, build connection, encourage participation, gauge the group's energy.
2. Announcements (5–10 min): concise informational updates (schedule changes, reminders, events, deadlines, opportunities).
3. Learning & Discussion (20–40 min): conversations that can't happen over email. Each discussion needs a clear objective, a facilitator, desired outcomes, and action items if applicable.
4. Celebrations (5–10 min): recognize accomplishments, milestones, impact stories, and appreciation.
5. Action Items & Next Steps (5 min): every action item gets an owner, a due date, and a clear expectation.
6. Closing (3–5 min): final questions, appreciation, where notes will be shared, confirm the next meeting.

POST-MEETING (within 24–48 hours)
Share meeting notes, distribute action items, upload relevant resources, follow up with responsible owners, schedule any follow-up conversations.

SUCCESS CHECKLIST
Before ending, confirm: everyone had an opportunity to participate, all announcements were communicated, discussion objectives were met, action items have owners and deadlines, meeting notes will be shared, next meeting is confirmed.$tpl$,
  40
),
(
  'Reference', 'LSP boards & focus areas', 'reference', null,
  $tpl$1. Community Programming Board
Focus: Daily class operations, instructor scheduling, registration, studio setup.
Chair: Vero · Co-Chair: Brenda

2. Instructor Development Board
Focus: LSP 200-Hour Yoga Teacher Training (curriculum, student management, manual development).
Co-Chairs: Brenda, MQP

Junior Board (YTT)
Focus: Operational support in studio application selection and program onboarding; press and media representation of mission, vision, and values.
Chair: Yari · Co-Chair: Yesi

3. Advancement & Partnerships Council
Focus: Grant writing, donor outreach, major gifts, cold calls, new funding opportunities.
Chair: MQP · Co-Chair: Dinorah

Gala Committee
Focus: Major fundraising and future flagship events.
Co-Chair: Vanessa Tirado

Marathon Fundraising
Focus: Major fundraising and future flagship events.
Chair: Diana Tate · Co-Chair: Edy

4. Brand & Visibility Board
Focus: Social media, visual identity, content creation, brand strategy, storytelling.
Chair: Lyanne · Co-Chair: Estevan

5. Culture & Ethics Board
Focus: HR, ethics, team care, internal culture building, feedback, emergency support.
Chair: Vane · Co-Chair: Yari

6. Community Impact Board
Focus: Donation drives, quarterly giveback events, mutual aid efforts.
Chair: Lucia · Co-Chair: Martha

7. Queer Events Board
Focus: Create welcoming spaces for the queer community within the LSP ecosystem.
Chair: David · Co-Chair: Ari

8. Nonprofit Web Data and AI Board
Focus: Support the nonprofit's technology needs, including studio tech support, data analytics, product management, web development, and leveraging AI tools for operational growth.
Chair: Fez · Co-Chair: MQP$tpl$,
  50
)
on conflict (category, title) do nothing;
