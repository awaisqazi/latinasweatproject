// 2026 Junior Board Elections: single source of truth for the public
// /elections page and the ElectionBallot component.
//
// Facts confirmed so far:
//   - Four roles, nine candidates total (names below are the official
//     spellings; do not "fix" accents or nicknames).
//   - Speeches stream live on YouTube; the same video ID serves the live
//     broadcast and the on-demand replay afterward.
//   - Every candidate spoke on the live broadcast of July 30, 2026. Each
//     `speech` below was transcribed from that broadcast and lightly edited
//     for readability: filler and false starts removed, punctuation and
//     paragraphing added, names normalized to the official spellings. No
//     wording was paraphrased or added; passages that were unintelligible in
//     the recording were dropped rather than guessed at.
//   - `speechTimestamp` is the offset in whole seconds from the start of the
//     stream to the moment that candidate begins speaking, so the page can
//     deep-link into the replay (e.g. `?t=${speechTimestamp}`).
//
// Deliberately NOT in this file:
//   - Voting dates. The voting window is controlled live from the admin
//     dashboard and read at runtime through the get_voting_status RPC, so
//     nothing here should ever hardcode an open or close time.
//   - Candidate bios and photos. None have been submitted yet, so every
//     candidate carries explicit null placeholders and the page renders
//     name-forward cards instead of the photo + bio card used in 2025.

export const election2026 = {
  name: "2026 Junior Board Elections",
  shortName: "Junior Board Elections",
  year: 2026,
  pagePath: "/elections",
  // Badge copy for the hero. Dates come from LSP, never from this file.
  scheduleNote: "Voting dates announced by LSP",
  tagline: "Get to know the leaders stepping up to serve our comunidad.",
  contactEmail: "collab@latinasweatproject.com",
};

// Candidate speeches livestream. Both URLs point at the same YouTube video:
// `watchUrl` for the "open in YouTube" link, `embedUrl` for the iframe.
export const electionLivestream = {
  watchUrl: "https://youtube.com/live/3EGEl5JyjUM",
  embedUrl: "https://www.youtube.com/embed/3EGEl5JyjUM",
  title: "LSP Junior Board Candidate Speeches",
};

// Who the ballot is for. The RPC decides what actually counts; this list is
// the public-facing explanation only.
export const electionEligibility = [
  "LSP Instructors",
  "Yoga Teacher Training (YTT) Students",
  "Current Board Members",
];

// Roles in the order they appear BOTH on the page and on the ballot, matching
// the 2025 election: secretary, treasurer, vice-president, president. The ids
// are the 2025 convention and are the keys the cast_vote RPC expects.
//
// Every candidate carries three placeholders:
//   bio        : null until candidate statements are collected.
//   image      : null until headshots are collected (filename only, resolved
//                against `${base}images/election/` by the page).
//   speechClip : an embeddable URL for that candidate's speech. Today these
//                are segment embeds of the full replay: the same video ID as
//                `electionLivestream`, with `start` and `end` params bounding
//                that candidate's remarks (`start` matches `speechTimestamp`,
//                `end` adds a few seconds of applause buffer). They stand in
//                until edited per-candidate clips arrive; when a real clip is
//                ready, replacing the URL here is the only change needed. The
//                ballot's acknowledgment row renders whatever is set inline.
//
// Plus the two speech fields, both filled in from the July 30, 2026 broadcast:
//   speech          : the candidate's remarks, paragraphs separated by "\n\n",
//                     or null if no attributable speech exists.
//   speechTimestamp : seconds into the replay where those remarks start, or
//                     null alongside a null speech.
export const electionRoles = [
  {
    title: "Secretary",
    id: "secretary",
    responsibilities:
      "Maintains clear communication on behalf of the Junior Board and documents key ideas, initiatives, and commitments. Represents the board in external storytelling, capturing and sharing narratives of impact, community wins, and program milestones. Acts as a liaison between the Junior Board and the broader Latina Sweat community, ensuring messaging is consistent and rooted in the mission.",
    candidates: [
      {
        name: "Gisela Mitchell",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=50&end=148",
        speech:
          "Okay, hi everybody. My name is Gisela. Of course, I'm from Chicago, born and raised. I've lived in the north side as well, but currently I'm in the Pilsen area, and I'm running for secretary.\n\nJust a little bit of general background on me. I have some experience in content creation and digital media, and then community outreach when I was younger. I did a lot of fundraising. I've been super into service and volunteering and things like that, and just a lot of really support roles throughout my life so far, and in recent days from my experience.\n\nI'm super into project coordination with my schooling and my school experience. I want to utilize that in this role. I do a lot of group projects, a lot of like spreadsheets and analytical data. Statistics really is where I'm in right now. And so I want to take that and put that into my role as secretary, and any vice president and president and whatever they need from me, to make things run smoothly for everybody else, so that we can do this again and have the same experience, so that more people can have the same experience, or one even better than the one that we have right now.\n\nI also love LSP, of course. Here all the time, I volunteer like every week and everything like that. And so I figure, what's the best way to try and reach in more and help out the community more and do more involvement than by running for a role that I think I could really help with? So yeah, that's the reason why, I guess, I want to run for secretary. Thank you.",
        speechTimestamp: 50,
      },
      {
        name: "Marlene Garcia",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=156&end=264",
        speech:
          "Hi everyone, my name is Marlene and I am running for junior board secretary, as well as Gisela. First and foremost, this is a very exciting opportunity, and I would be really humbled if I was voted for that role.\n\nSome of the things that I feel like I bring to the table are the fact that I'm really organized. I like to be behind the scenes as well a lot, but I also, like, I'm very detail oriented with everything that I do. And I feel like in that role you need a lot of that. I've also had many previous roles where I've had to do a lot of admin work and just administrative positions.\n\nSo outside of that, I feel like being a part of the junior board secretary, I would be able to give back to LSP in just a smaller way that they've already given me the ability to be a part of their movement and their leadership. So I feel like I would be able to just bring a lot of different opportunities, be able to talk to a lot of different people.\n\nI didn't mention this earlier, but I grew up in Brighton Park and now I live in the West Lawn neighborhood. So I feel like, being from the southwest side of Chicago, I feel like a lot of people also need to hear about LSP and just be aware of the movement that is happening here. And I feel like I would be able to do that by just like advocating and being able to connect with other people throughout the city as well.",
        speechTimestamp: 156,
      },
    ],
  },
  {
    title: "Treasurer",
    id: "treasurer",
    responsibilities:
      "Provides stewardship and awareness around fundraising initiatives, sponsorship opportunities, and community giving that support Latina Sweat Project programming. Serves as a public-facing representative when discussing financial impact, donor engagement, or fundraising campaigns. Mentors peers in understanding the financial sustainability of community wellness work and communicates this effectively in external settings.",
    candidates: [
      {
        name: "Fabiola Saldaña",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=440&end=612",
        speech:
          "All right, hi everyone. So my name is Fabiola Saldaña. I was born in Chicago and I was raised in Little Village. I am extremely, extremely honored that I was nominated by this group, because I was not expecting that. So thank you.\n\nInitially, I was so surprised that I thought like, what do I have to contribute? Because I've been an educator for over two decades. But after talking to some of you and being encouraged, I realized that there are a lot of similarities or talents that I can contribute and that transfer from teaching into the role of the treasurer. For example, as teachers, we learn to maximize whatever resources we have, and that's transferable. So that made me think like, maybe I can do this.\n\nAlso, when I teach, when I plan my lessons, when I set goals with administrators, we always maintain our goals, our mission and vision of the school. It's always at the forefront, and I feel like I know how to do that, and that's transferable here too. I can do that for LSP.\n\nI've mentored so many new teachers throughout the years, and I've also led teams of teachers. I've coached teams of teachers. So I've worked really well with others, and I've been like the liaison between my teacher team and my administration. I've been a voice for them. I find ways to meet their needs. I've been in a ton of committees over the years for school events. I've reorganized so many things, raised money. So I can also do that for LSP. I facilitated countless meetings as well.\n\nI'm like, you know what, let me try. Because I do have gifts to offer and to contribute. So, and in the end, if it doesn't work out, it's fine, because there are other ways that I can contribute and ensure that I keep the mission going here. But yes, I know that I can, I don't know, I'm getting a little stuck now. Sorry, after taking the test, it's a little overwhelming.\n\nYeah, so I'm very flexible. If you remember, during COVID we had to pivot so much. And that was rough. So I know that if there are things that I need to learn, I can, and even though it's not like, I don't have a lot of experience with it, I think I can do it. I wanna thank all of you for believing in me. So thank you.",
        speechTimestamp: 440,
      },
      {
        name: "Roberto Espino",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=1347&end=1523",
        speech:
          "Hello, my name is Roberto Espino. I'm from Mexico. So I think everyone knows a lot about the Latina Sweat Project. I will talk more about me and why I wanna be part of this, the treasurer position.\n\nSo my career: I have a bachelor degree in accounting. Currently, I'm working as accounting supervisor. I have almost 10 years of experience in accounting for nonprofits, and I also have like probably like almost 15 years working on individual tax returns. And also probably like close to 10 years working as a volunteer doing taxes for the community. Probably a lot of people heard about the Progreso Latino. So I was there for probably like 10 years doing tax returns during the time I was in college.\n\nSo yeah, like in my current role, like I was working in this nonprofit, so I have a lot of knowledge like related with nonprofits, like doing events, like working with grants, working with payroll. What else, like accounts payable, accounts receivable. Pretty much like I have been working in all the areas related with the accounting and financial stuff related with the nonprofit organization. Currently, I'm starting to get my CPA, so hopefully soon I can take my exam and pass it.\n\nAnd related to here and why I came here, I don't know, I think things happen for a reason. And a couple of years I started like calling like this a spiritual path. So I think being here helped me to open more like for that way, like doing meditation, doing the yoga, having like a big connection with my body, my mind. And that helped me to continue growing like, I don't know, like in my spirit and my body, like continue growing professionally.\n\nAnd I feel like I have a lot of knowledge and experience, and I can bring all this to this board. So yeah, I don't know, I'm excited to be part of this community. And I feel like I can bring a lot to the table.",
        speechTimestamp: 1347,
      },
      {
        name: "Kellyn Mitchell",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=313&end=414",
        speech:
          "Hello, everyone. My name is Kellyn and I am running for junior board treasurer. Is this working? Hello, everyone on the internet. Let's see. Well, all right. Professionally, this is right up my alley. For several years, I've run very large commercial projects and programs from six to eight figures, as far as forecasting, budgeting, payroll, all things financial in that regard.\n\nMy board experience, it goes back several years. I sat on the board of a nonprofit in California for many years as their tech lead, where I was able to get a better understanding of the different nuances and levels and layers of other things. And when it comes to this, it's kind of second nature to me in a lot of ways.\n\nAnd so I do have a desire to be able to contribute at a greater level to the organization. They got a lot of great things going on, and as far as the fundraising side and making dollars stretch, I see a lot of areas where I could be of value there, not to mention as far as looking at ways to create other revenue outlets for the organization as well, as we look to scale and grow and kind of mutualize expenses along the way there.\n\nSo without going on too much and just rambling on and on, regardless of what happens, I'll find other ways to be involved and continue to support the organization. So thank you.",
        speechTimestamp: 313,
      },
    ],
  },
  {
    title: "Vice President",
    id: "vice-president",
    responsibilities:
      "Supports the President in representing the Junior Board and steps in as needed during public or media engagements. Helps mentor fellow board members, strengthen communication within the cohort, and guide collaborative projects. Works closely with the President to uplift the stories, impact, and mission of the Latina Sweat Project across community spaces.",
    candidates: [
      {
        name: "Savannah Alvarez",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=645&end=965",
        speech:
          "Hi guys, my name's Savannah. Born and raised in Chicago, Little Village. And I am running for vice president of the junior board for yoga teacher training at the Latina Sweat Project. I'm really excited to be out here talking to you guys. And I just wanna say thank you to all of those who nominated me. It was truly a surprise, an honor, a blessing, all wrapped into one.\n\nSo I just kinda wanna start off by telling you guys a little bit how I found out about LSP and how it found me. I was, for the past three years, kind of moving around as a travel nurse, and I'll take you guys back kinda to early 2025. I was living in Hawaii, feeling really far from my family, obviously very, very far, and really kind of disconnected from community. There was a wonderful community there, but it still just wasn't home. And so I was super excited to come back to Chicago and just bring my roots back here and just start my life in a whole new chapter.\n\nAnd then I actually, while I was out in Hawaii, I kept seeing LSP on my Instagram, on my For You page. And I was like, this is amazing. I've never really experienced this. Growing up in Chicago, I was always going to corporate workout classes, and I was a big ClassPass person, and I went to all of those fun classes, and I loved the movement, and I loved the feeling that it had on my body. But I always felt like a sore thumb in those rooms, because I didn't always look like everybody. I didn't always have the Alo set. It just was very, it just didn't feel complete. It didn't feel like a complete experience for me. So that is part of why I wanted to join LSP, and it also led into why I wanted to be a yoga teacher.\n\nSo when I finally moved back to Chicago, I just felt gravitated towards the Latina Sweat Project with my first class, and I was absolutely hooked, and I just wanted to be here as much as I could. I wanted to get to know the people. I wanted to be a part of this community. And when I found out that they were offering yoga teacher training again for the second time, I was, like, first intimidated, 'cause I didn't think like I could ever be able to do this. And then, secondly, was excited. I was like, this would be such a cool opportunity to do. And I was kind of joking with the girls downstairs that like I didn't really read the fine print of the application, because I thought, knew there was a scholarship process, but I thought that if you didn't get the scholarship, you would have to pay. So I was gonna be like, can you get a scholarship? I was like, I know it's expensive. But in my interview, when Yari told me that, no, this came as a complete full scholarship, I was just like shocked that that was even available to me or to our community. And I just, I couldn't wrap my head around it, even like the first day of class. It just felt like such a gift.\n\nAnd I feel like that's how I felt throughout this whole process, is that like this has been such an amazing experience and such a gift to myself and to everyone else in this room and to our community, that I'm just so excited to have the opportunity to like push that forward into the community and to help bring, to help keep this YTT program alive. I totally went off my script here. So yeah, I just would love to be able to support other people who are interested in this program, who maybe have felt similar to us, who maybe are thinking like there's no way I could do this. But like, to be able to offer this to people and be able to transform their experience and their lives and their yoga practice, I think would be such a blessing.\n\nFrom a logistics standpoint, I am a nurse in the pediatric ICU. I'm currently in the like nursing leadership role. For a little bit, I did do some like nurse management, and I was able to interview a lot of like our new nurses to join our unit. And that was the absolute favorite part. My favorite part of being a nurse manager was to be able to like meet the people, ask them questions, get to know their personality. I know a part of the vice president role is to be a part of that process, and that just excites me so much, to be able to meet the people who will help continue to grow this community. It's just really exciting to me. So I'm really looking forward to that process if I'm honored with the position.\n\nAnd then, since my whole, for like a whole decade, I've been a pediatric ICU nurse, and so I've really had to work as a team with like different doctors, different disciplines. So I'm very collaborative. I know how to work with like other people and to really work together as a team to bring a mission to fruition. So again, I'm really blessed to be up here. But either way, I'm just so happy to be a part of this community and to contribute in any way that I can. So thank you.",
        speechTimestamp: 645,
      },
      {
        name: "Xavier Perez",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=996&end=1330",
        speech:
          "I didn't think I'd be nervous talking to all of you guys, especially after like these past few months, but I still am. But I actually wrote out my speech. And I'm usually wanting to like write out an entire script and memorize it, but I didn't have time to like fully memorize it. So I'd like to just read it off to you guys, and hopefully let you feel what I felt as writing this speech.\n\nFirst, I'd like to thank everyone here, the executive board, the lead assistants, the junior board, for helping select every single one of us. And lastly, our cohort, for truly giving me and each other an unforgettable experience. We've come such a long way and have grown beautifully, beautifully strong in our own ways. And that is so special. I have to say, I was surprised to even like receive a nomination. And I just feel extremely grateful that you believe that I can be like something here, as like other than like an instructor. And I'm just, yeah, actually grateful that you believe that I can contribute to that and progress the Latina Sweat Project's mission forward. And grateful that, you know, like you said, that you see something in me that I haven't seen about myself.\n\nLeadership is a skill that I'm constantly trying to learn and become better at, for myself and others. It's one of the many reasons why I applied to study and practice yoga with the Latina Sweat Project. I wanted to learn how to guide people and influence others as they embark on a spiritual and emotional journey to the movement. And personally, I also want to learn how to guide myself through life.\n\nI feel that throughout my life, I've taken small steps to improve this skill. I've taken leadership positions throughout my college career, as well as trying to be as proactive as I can be in my current job. In college, I was elected for an executive position for the professional architecture fraternity that I was a part of. I wasn't like a Greek one. I was really chill, I was really chill. I wasn't like that. But in college, yeah, I was elected to be the initiation or ritual director. And my responsibilities were to plan and organize the entire ritual and initiation process for the respective pledge class that year. And that was my first time being a part of an executive board, and it was a lot of fun. And super challenging, yet rewarding, just collaborating with so many people on a whole different level. And yeah, it was really fun, just like connecting with people and just speaking with your fellow students like in a manner that you don't get to like in a classroom setting.\n\nMy previous job and my current job was and is no different. As an architect, I'm very detail oriented, and I start to learn as much as I can to ensure that I can be the best associate for my team. My goals are constantly changing, but the underlying one that influences them all is to be the best version of myself in every way that I can.\n\nFrom as far as I can remember, I've always been extremely active and always had the hunger to become a better athlete. I consider myself to be very disciplined in that field. I love moving my body and pushing myself to reach new heights, but the beauty of that is that it is something that we can all do. I enjoy encouraging others to push themselves and embrace discomfort. I feel like that's like my mantra, embracing discomfort. Like when you're asking like, do you like the pain? Like, yeah, I really do. It's like, it does something to your mind that I just love. The benefits of movement are also great motivators for me, those being like mental, spiritual, and emotional. Practicing yoga ties all of this and allows them to ground themselves and realize their own true potential and so forth. This was part of my why heading into this program. It's changed me, and I hope to help people push past their limits, practice self-reflection, and have a better outlook in life.\n\nBeing a part of the Latina Sweat Project's 2026 YTT cohort has given me the opportunity to begin learning more about myself in those ways. We are a part of a much larger community and voice. LSP has expanded and accentuated Pilsen in everything that it stands for. And I wanna help give back to LSP, to Pilsen, and to my peers in any way that I can. Becoming a part of the junior board as a vice president, I will strive to continue and contribute to LSP's voice and mission. I don't believe I am the leader that I wanna be yet, but applying to do this program with you all has been the biggest step in the right direction. No matter what, LSP will always be in good hands, and I'm just excited and grateful to have been a part of this movement.",
        speechTimestamp: 996,
      },
    ],
  },
  {
    title: "President",
    id: "president",
    responsibilities:
      "Serves as the primary representative of the Junior Board and a public-facing ambassador for the Latina Sweat Project. Leads the board's vision, mentors peers in leadership development, and represents the cohort in media, press, and community engagements. Partners with the Executive Director to ensure the Junior Board's voice reflects community needs and the mission of expanding wellness access.",
    candidates: [
      {
        name: "Celina Huerta",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=1566&end=1989",
        speech:
          "All right, good evening, everyone. Hello, hello. All right, so before we begin, I would like for everyone, if you'd like, to close your eyes and maybe put your hand on your chest and your other hand on your belly, and just take a moment of gratitude for just finishing up the exam. Definitely soak in all the proudness, all the hard work that you've worked hard these last couple of months. So take a nice big inhale, exhale, let it go. One more, breathe in, exhale, let it go. Last one, breathe in, exhale, let it go. All right, just want us to get grounded, 'cause it's been a long day.\n\nAll right, so first I wanna thank each and every one of you for being here and for taking the time to listen to me. Whether you've met me during the yoga class, during the YTT, or simply just cheering people on during the sidelines, I'm definitely grateful to be a part of this community. These last couple of months have been beautiful, just having different conversations with you guys, with the community class, going out as well. That's been really fun too, so it's been amazing.\n\nMy name is Celina Huerta, if some of you guys don't know, especially online, and I'm honored to be running for president of Latina Sweat Project. When I first joined Latina Sweat Project, I didn't just find a fitness community, I found a place that reminded me what it feels like to truly belong. And with that, that means a lot to me, 'cause before I came here, I was just going around to different yoga studios through ClassPass, and it wasn't it. I was just like, something's missing. I'm like, no one's talking, everyone just comes to class and leaves. And when I came here, I'm like, this kind of feels like family, it feels like home. And so I really just loved the environment that I felt while I was here.\n\nI found people who celebrate one another instead of competing. People who remind each other that strength comes in many forms. People who show up authentically with kindness, compassion, and courage. As a therapist and as a future yoga instructor, I dedicated my life to helping people reconnect with themselves, heal, and discover the strength they've had all along. Every day I witness how community has the power to transform lives.\n\nI wanna reassure everyone with something. I'm not running because I have all the answers. I'm running because I believe leadership begins with listening, which I think is something I'm really good at. It begins with service. It begins with creating opportunities for every member to feel included and empowered. My vision is simple: to lead with heart and move with purpose. Those aren't just words to me, they're values that guide how I show up in every space I'm in.\n\nAs president, I see our board serving in four important ways. First, fundraising. So fundraising isn't just about raising money, it's about creating opportunities. Every dollar we raise has the potential to support more scholarships for future students as well, wellness programming, leadership development, and making Latina Sweat Project accessible to more people. I also want fundraising to feel fun, exciting, and community-centered. Not like an obligation, but something we're proud of, to be a part of, because we know exactly who we're impacting.\n\nSecond, supporting our community. One of the greatest strengths of Latina Sweat Project is our people. Support means making sure every member, from someone attending for the very first time, or maybe someone who's been here for years, feels welcome, seen, and connected. I want us to continue creating spaces where people feel comfortable showing up exactly as they are. Not just physically, but emotionally, mentally, personally. Because movement isn't just about exercise, it's about healing, confidence, and connection, and reminding ourselves that we don't have to do life alone.\n\nThird, thoughtful leadership selection. Strong organizations don't grow because of one great leader, they grow because they develop many leaders. I want to help create opportunities for members to discover their strengths, step into leadership roles, and feel supported throughout their journey. Leadership should reflect the diversity of experiences within our community. It should be collaborative, transparent, and focused on lifting others up. The strongest leaders create more leaders. That's the kind of board I want us to build together.\n\nFourth, program enhancement. We already have a great board, programs here, but growth means continuously asking ourselves, how can we serve our members even better? That means listening to feedback, evaluating what's working, being open to new ideas. Creating experiences that are inclusive, engaging, and meaningful for people at every stage of their wellness journey. Because that's what Latina Sweat Project has always represented to me: growth, community, and empowerment.\n\nSo why should you choose me? Because I don't believe leadership is about being the loudest voice in the room. I believe it's about creating space for everyone else's voice to be heard. I will lead with empathy, I will lead with transparency, and I will lead with accountability. And I'll always remember that this role isn't about me, it's about us. It's about making decisions that reflect the values of our community. It's about protecting and growing the culture that has made so many of us fall in love with Latina Sweat Project.\n\nThis organization has given so many people, including me, a place to grow. To challenge ourselves, to heal, to laugh, to sweat, to build friendships. Now I'd love the opportunity to give back in a bigger way. If you trust me with your vote, I promise to work hard, listen deeply, collaborate openly, and always keep our community at the center of every decision. Together we can continue building a Latina Sweat Project where every person feels welcome, where every individual feels empowered, where every individual knows they belong, because when people support people, incredible things happen.\n\nThank you for believing in this community, thank you for believing in one another, and I will be honored to earn your vote. My name is Celina: an eldest daughter, a sister, a friend, a therapist, a healer, a natural-born leader, and hopefully your next LSP president. Let's continue leading with heart, moving with purpose, and building an even stronger future for Latina Sweat Project. Thank you.",
        speechTimestamp: 1566,
      },
      {
        name: "Xochyl Perez",
        bio: null,
        image: null,
        speechClip:
          "https://www.youtube.com/embed/3EGEl5JyjUM?start=2003&end=2489",
        speech:
          "Hi everyone. Very excited, a lot of feelings right now. Well, good evening, everyone. First, I wanna thank you for being here tonight, whether you're a fellow trainee, an instructor, a board member, or part of the Latina Sweat community. I'm grateful that we get to share this space together.\n\nFor those who may not know me, those online, my name is Xochyl Perez. I'm a proud daughter of Mexican immigrants, a lifelong Chicagoan, and a Pilsen resident. Throughout my life, I've been guided by a deep commitment to community, justice, and creating spaces where people feel that they truly belong.\n\nWhen I first joined the yoga teacher training program, I came to deepen my practice, and also I came with the mission and vision already, being truly rooted within community. Some of you in this room may or may not know. One person here knows that I've dedicated a big chunk of my life to fighting for justice, standing up for our rights, and putting myself on the front lines to protect our communities. It doesn't matter whatever the threat is, I always put myself as a server of the community, not for a title, not for recognition, not to be lifted up, but to bring us all up. I want all of us to go up together and to support each other.\n\nAnd really, that's what I felt at Latina Sweat Project. I came and I found community, and I was happy at that, but I think over the course of the period, I realized that I also had family. And as many of you may or may not know, I know I don't share a lot about my personal story, but I come from a very untraditional family. So I never really felt what that felt like until I started coming here and until I was with all of you.\n\nAnd I wanna make sure that we are able to offer that feeling to other people that may not share their story, that might not want people to view them as victims, but that are also seeking that safety, that family, that safe space to move, heal, breathe, and be together. And to build something more powerful, that goes beyond me, beyond every single one of us. What I found was so much more than that. I found community that reminds me that wellness is not a privilege, it's something every person deserves. I found a space where culture, our stories, our lived experiences are not only welcomed, but they're celebrated.\n\nThat's why I'm running for junior board president. I'm not running because I have all the answers, or because I have every single skill that this position requires, although I have quite a few. I'm running because I believe in the mission of the Latina Sweat Project. And I believe in the incredible potential of this community. I want to help ensure that this organization continues to grow while staying rooted in the values that brought each and every one of us together: accessibility, community, and collective care.\n\nProfessionally, my work has always centered around bringing people together. I spent years organizing communities, building partnerships, facilitating difficult conversations, coordinating programs, and advocating for environmental and social justice. To add one to the list, I also am a grant manager now, as I finished my master's and then took a certification program at UIC to become a grant writer. And also now I manage the grants for my job, as well as managing coalition spaces. So a big part of what I do and what I love to do is to bring people together and have difficult conversations. It's something that I really feel grounded in and that I love to do, because I know that, again, the mission is bigger than each and every one of us.\n\nSo I know a thing or two about pushing a movement forward. Those experiences have taught me that meaningful leadership is about collaboration. Meaningful leadership is about uplifting each other. It's about creating opportunities and making decisions that reflect the needs of the community. And that's something that, when I did have my conversation with people downstairs, I was saying, I'm here to listen, and whatever decision that we create collectively, that's all the fire and power and intensity that you see within me. That's the fire and power that I'm gonna give to our collective decision.\n\nIf elected, my vision is simple: to expand access and our reach while protecting the heart of who we are. I want more people, especially those that have been historically excluded from wellness spaces, to know that the Latina Sweat Project exists for them. I want us to continue removing financial, cultural, and systemic barriers, for more families, more youth, more elders, more community can experience the healing that yoga and wellness can provide and have provided for each and every one of us. Growth is important, but growth should never come at the expense of community. As we continue to evolve in this new chapter of LSP, I want us to remain rooted in our relationships, our culture, and our commitment to showing up for one another.\n\nI also believe that leadership is collaborative. The junior board president should not simply lead the YTT Junior Board. They should help cultivate leadership in one another. I wanna work alongside the board, instructors, staff, volunteer, and community members to ensure that everyone's voice is valued and that together we continue to build an organization that we are proud to be part of. And as someone who has been volunteering at LSP, I know that even from the top all the way to the volunteers, like it is a community, it is family. And I have felt that even starting off here as a volunteer. I think it's almost been a year now that I'm doing it.\n\nAt the heart of all this is commitment and community, commitment to making wellness accessible, committed towards working towards the wellness spaces that we deserve to heal. And lastly, a strong knowing that together we can continue transforming not only individual lives, but entire communities. I would be honored to serve as your next junior board president. And if elected, I promise to lead with integrity, humility, transparency, and love for this community.\n\nSo thank you all so much for giving me this opportunity. I am truly honored that you all even saw me as a leader and nominated me. Already that is a win. And the similar sentiment as other people have shared, I know that no matter who wins the votes, that LSP is gonna be in incredible hands, because each and every one of you have been part of this process. So thank you all so much for listening. And yeah, thank you.",
        speechTimestamp: 2003,
      },
    ],
  },
];

// Ballot section order, kept identical to the page section order above.
export const electionBallotOrder = electionRoles.map((role) => role.id);

// Total candidates across every role. Powers the ballot's
// "N of 9 speeches acknowledged" progress note.
export const electionCandidateCount = electionRoles.reduce(
  (total, role) => total + role.candidates.length,
  0,
);

// Stable key for a candidate, used for acknowledgment checkboxes. Namespaced
// by role so two candidates could share a name without colliding.
export function candidateKey(roleId, candidateName) {
  return `${roleId}::${candidateName}`;
}

// Two-letter monogram for the placeholder avatar on name-forward cards.
export function candidateInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
