// The fundraising board's four getting-started worksheets, as form
// definitions. Text is copied from
// marketing/fundraising-board-worksheets/build_worksheets.py (the Google Docs
// source). The only wording change: results that the docs placed "in the
// Fundraising tab of the admin dashboard" are now "in this dashboard", since
// the form lives there.
//
// KEYS ARE STORAGE. `part.key` is the `section` column and `row.key` is the
// `row_key` column of public.fundraising_worksheet_rows; `column.key` is the
// field name inside `data`. Never derive a key from label text and never
// rename one: saved answers would stop showing. Reword labels freely.
//
// Part kinds
//   text      a paragraph ({ text } or { lead, text } for a bold lead-in)
//   table     a grid. Columns marked `fixed: true` are fixed text on rows that
//             give a value for them (never stored); everywhere else a cell is
//             an input. `cells` on a row are prefilled values the form shows
//             until someone changes them. `canAdd` lets people add rows
//             (row_key null, ordered by position).
//   qa        question and answer: one label column and one long answer
//   checklist real checkboxes, data { checked }
//   reference a read-only table (the grant fit test)
//
// Column types: text (default), long, money (dollars, stored as a JSON
// number), count (whole number, stored as a JSON number), date.
//
// Section `size_share` is read by the board roll-up
// (public.fundraising_goal_rollup): rows low / realistic / stretch with data
// { amount, assumption } for events, grants and donors; rows people_trained /
// made_ask / introductions / employer_matches with data { low, realistic,
// stretch } for upskilling.

export const WORKSHEET_CYCLE = "2027";

export const HOW_TO_STEPS = [
  { lead: "Read your charge.", text: "One sentence on what your subcommittee owns." },
  { lead: "Take stock.", text: "Write down what LSP already has and did in 2026. No research needed yet." },
  { lead: "Research.", text: "Fill the table of options for 2027." },
  {
    lead: "Size your share.",
    text: "Give a low, a realistic and a stretch number for 2027, and what has to be true for each.",
  },
  {
    lead: "List what you need.",
    text: "Volunteers, budget, tools, help from another subcommittee, decisions from the board.",
  },
];

export const GROUND_RULES = [
  "Write real numbers where you have them and leave blanks where you do not. A blank is more useful than a guess.",
  "Keep donor names, emails and gift amounts in the Donors tab of this dashboard, not in this worksheet.",
  "Past results per campaign are in this dashboard.",
];

export const SHARE_SECTION_KEY = "size_share";
export const HEADER_SECTION_KEY = "header";
export const SHARE_NOTE = "This is the section that goes back to the board. The Overview adds these up against the goal.";

// Working group members and date: section `header`, two fixed rows, data { value }.
export const HEADER_PART = {
  kind: "qa",
  key: HEADER_SECTION_KEY,
  columns: [
    { key: "label", label: "Field", fixed: true },
    { key: "value", label: "Answer", type: "long" },
  ],
  rows: [
    { key: "members", cells: { label: "Working group members" } },
    { key: "date", cells: { label: "Date" }, type: "date" },
  ],
};

const MONTHS = [
  ["january", "January"],
  ["february", "February"],
  ["march", "March"],
  ["april", "April"],
  ["may", "May"],
  ["june", "June"],
  ["july", "July"],
  ["august", "August"],
  ["september", "September"],
  ["october", "October"],
  ["november", "November"],
  ["december", "December"],
];

// ── Builders (keep the definitions below short) ─────────────────

function labelled(column, label, answerKey, answerLabel, items) {
  return {
    columns: [
      { key: column, label, fixed: true },
      { key: answerKey, label: answerLabel, type: "long" },
    ],
    rows: items.map(([key, text]) => ({ key, cells: { [column]: text } })),
  };
}

function qa(key, items, { column = "question", label = "Question", answerKey = "answer", answerLabel = "Answer" } = {}) {
  return { kind: "qa", key, ...labelled(column, label, answerKey, answerLabel, items) };
}

function blankRows(count, prefix = "row") {
  return Array.from({ length: count }, (_, i) => ({ key: `${prefix}_${i + 1}`, cells: {} }));
}

function needs(items) {
  return qa("needs", items, { column: "need", label: "Need", answerKey: "detail", answerLabel: "Detail" });
}

function scenarios(totalLabel) {
  return {
    kind: "table",
    key: SHARE_SECTION_KEY,
    columns: [
      { key: "scenario", label: "Scenario", fixed: true },
      { key: "amount", label: totalLabel, type: "money" },
      { key: "assumption", label: "What has to be true", type: "long" },
    ],
    rows: [
      { key: "low", cells: { scenario: "Low" } },
      { key: "realistic", cells: { scenario: "Realistic" } },
      { key: "stretch", cells: { scenario: "Stretch" } },
    ],
  };
}

function questions(items) {
  return qa("questions", items);
}

function text(value, lead = "") {
  return lead ? { kind: "text", lead, text: value } : { kind: "text", text: value };
}

// ── The four worksheets ─────────────────────────────────────────

export const FUNDRAISING_WORKSHEETS = {
  events: {
    id: "events",
    title: "Fundraising Events worksheet",
    charge:
      "You own the calendar of fundraising events, their planning, and LSP's presence at events hosted by others.",
    sections: [
      {
        key: "take_stock",
        title: "1. Take stock: what LSP ran in 2026",
        parts: [
          text("Fill in what you know. Raised amounts per Zeffy campaign are in this dashboard."),
          {
            kind: "table",
            key: "events_2026",
            canAdd: true,
            columns: [
              { key: "event", label: "Event", fixed: true },
              { key: "when", label: "When" },
              { key: "raised", label: "Raised" },
              { key: "cost", label: "Cost" },
              { key: "attendance", label: "Attendance" },
              { key: "repeat", label: "Repeat in 2027?" },
            ],
            rows: [
              { key: "gala_2026", cells: { event: "Gala 2026", raised: "$71,132.50 (as of Sept 26)" } },
              { key: "giving_tuesday", cells: { event: "Giving Tuesday", when: "Dec 1", raised: "Goal: $15,000" } },
              { key: "sweat_fest", cells: { event: "Sweat Fest", when: "Aug 22" } },
              { key: "dia_de_los_muertos", cells: { event: "Día de los Muertos" } },
              { key: "haus_of_lsp", cells: { event: "Haus of LSP" } },
              { key: "popup_classes", cells: { event: "Pop-up classes" } },
              { key: "posada", cells: { event: "Posada", when: "Dec 19" } },
              { key: "row_1", cells: {} },
            ],
          },
        ],
      },
      {
        key: "hosted_by_others",
        title: "2. Events hosted by others",
        parts: [
          text("Where should LSP show up in 2027 to meet donors, sponsors and partners?"),
          {
            kind: "table",
            key: "hosted_events",
            canAdd: true,
            columns: [
              { key: "event", label: "Event or host" },
              { key: "date", label: "Date" },
              { key: "why", label: "Why LSP should be there", type: "long" },
              { key: "who", label: "Who attends for LSP" },
            ],
            rows: blankRows(4),
          },
        ],
      },
      {
        key: "calendar",
        title: "3. Draft 2027 calendar",
        parts: [
          text(
            "One line per event. Mark each as a fundraiser (must net money), a friend-raiser (builds the donor list) or a partner event.",
          ),
          {
            kind: "table",
            key: "calendar_2027",
            canAdd: true,
            columns: [
              { key: "month", label: "Month", fixed: true },
              { key: "event", label: "Event" },
              { key: "type", label: "Type" },
              { key: "revenue_goal", label: "Revenue goal" },
              { key: "budget", label: "Budget" },
              { key: "lead", label: "Lead" },
            ],
            rows: MONTHS.map(([key, label]) => ({ key, cells: { month: label } })),
          },
        ],
      },
      {
        key: "size_share",
        title: "4. Size your share",
        share: true,
        parts: [text("Net revenue (raised minus cost) across all 2027 events."), scenarios("2027 net total")],
      },
      {
        key: "needs",
        title: "5. What you need",
        parts: [
          needs([
            ["volunteers", "Volunteers (how many, for which events)"],
            ["budget", "Budget up front"],
            ["other_subcommittee", "Help from another subcommittee"],
            ["board_decisions", "Decisions from the board"],
          ]),
        ],
      },
      {
        key: "questions",
        title: "Questions to settle first",
        parts: [
          questions([
            ["fundraiser_or_community", "Which events are fundraisers, and which are community events that only need to break even?"],
            ["grow_most", "Which one event could grow the most in 2027, and what would it take?"],
            ["gala_sub_committee", "Does the Gala Sub Committee fold into this subcommittee?"],
            ["who_asks_sponsors", "Who asks sponsors for each event: this group or Existing Donor Engagement?"],
          ]),
        ],
      },
    ],
  },

  upskilling: {
    id: "upskilling",
    title: "Membership Upskilling worksheet",
    charge:
      "You own making everyone in the LSP circle able to ask for support with confidence. Your results show up as people prepared and asks made, which feed the other three subcommittees.",
    sections: [
      {
        key: "take_stock",
        title: "1. Take stock",
        parts: [
          qa("take_stock", [
            ["who_asks", "Who asks for support on LSP's behalf today?"],
            ["where_asks", "Where do those asks happen (work, class, events, online)?"],
            ["materials", "What materials exist now (one-pager, sponsorship deck, impact page)?"],
            ["hard_questions", "Which questions do people struggle to answer about LSP?"],
            ["employer_matches", "Whose employers match donations or sponsor community groups?"],
          ]),
        ],
      },
      {
        key: "pitch",
        title: "2. Build the one-minute pitch",
        parts: [
          text("One or two sentences per part. Use only numbers LSP can back up."),
          qa(
            "pitch",
            [
              ["who_we_are", "Who we are"],
              ["what_we_do", "What we do, and for whom"],
              ["proof", "Proof: one number and one story"],
              ["why_now", "Why now"],
              ["the_ask", "The ask"],
            ],
            { column: "part", label: "Part", answerKey: "draft", answerLabel: "Draft" },
          ),
        ],
      },
      {
        key: "versions",
        title: "3. Versions by setting",
        parts: [
          {
            kind: "table",
            key: "versions",
            columns: [
              { key: "setting", label: "Setting", fixed: true },
              { key: "audience", label: "Who you are talking to", type: "long" },
              { key: "ask", label: "What you ask for", type: "long" },
            ],
            rows: [
              ["at_work", "At work"],
              ["in_class", "In or after class"],
              ["party_family", "At a party or family event"],
              ["funder_meeting", "In a funder or sponsor meeting"],
            ].map(([key, label]) => ({ key, cells: { setting: label } })),
          },
        ],
      },
      {
        key: "training",
        title: "4. Training plan",
        parts: [
          qa(
            "training",
            [
              ["first_date", "First training date"],
              ["length", "Length (45 to 60 min suggested)"],
              ["format", "Format (in studio, on a call, both)"],
              ["invited", "Who is invited (board, YTT grads, instructors)"],
              ["leader", "Who leads it"],
              ["recorded", "Recorded for people who miss it?"],
              ["handout", "Handout: one page of talking points and how to give"],
            ],
            { column: "item", label: "Item", answerKey: "plan", answerLabel: "Plan" },
          ),
        ],
      },
      {
        key: "size_share",
        title: "5. Size your contribution",
        share: true,
        parts: [
          text("Targets for January to June 2027."),
          {
            kind: "table",
            key: SHARE_SECTION_KEY,
            columns: [
              { key: "measure", label: "Measure", fixed: true },
              { key: "low", label: "Low", type: "count" },
              { key: "realistic", label: "Realistic", type: "count" },
              { key: "stretch", label: "Stretch", type: "count" },
            ],
            rows: [
              ["people_trained", "People trained"],
              ["made_ask", "People who made at least one ask"],
              ["introductions", "Introductions passed to Grants, Donors or Events"],
              ["employer_matches", "Employer matches or workplace asks started"],
            ].map(([key, label]) => ({ key, cells: { measure: label } })),
          },
        ],
      },
      {
        key: "needs",
        title: "6. What you need",
        parts: [
          needs([
            ["pitch_testers", "Volunteers to test the pitch"],
            ["stats_stories", "Verified stats and stories (from whom)"],
            ["other_subcommittee", "Help from another subcommittee"],
            ["board_decisions", "Decisions from the board"],
          ]),
        ],
      },
      {
        key: "questions",
        title: "Questions to settle first",
        parts: [
          questions([
            ["single_ask", "What is the single ask we want most people to make: give, bring a friend, or introduce a sponsor?"],
            ["sign_off", "Who signs off on the numbers and claims used in the pitch?"],
            ["report_back", "How will people report an ask or an introduction back to the board?"],
          ]),
        ],
      },
    ],
  },

  grants: {
    id: "grants",
    title: "Grant Research and Identification worksheet",
    charge: "You own the pipeline of grants LSP applies for. Every grant applies as Latina Sweat Cares, the 501(c)(3).",
    sections: [
      {
        key: "take_stock",
        title: "1. Take stock",
        parts: [
          qa("take_stock", [
            ["received", "Grants received in 2025 and 2026 (funder, amount)"],
            ["not_awarded", "Grants applied for and not awarded"],
            ["talking_to", "Funders LSP is already talking to"],
            ["writers", "Who has written or managed a grant for LSP"],
            ["prospects_reviewed", "Prospects already in the Pipeline tab: reviewed?"],
          ]),
          text("Check off what is ready.", "Documents every application asks for."),
          {
            kind: "checklist",
            key: "documents",
            rows: [
              ["irs_letter", "IRS determination letter for Latina Sweat Cares"],
              ["form_990", "Most recent Form 990"],
              ["budget_financials", "Current-year budget and last year's financials"],
              ["board_list", "Board list"],
              ["program_description", "One-page description of programs and who they serve"],
              ["impact_numbers", "Impact numbers LSP can back up"],
              ["photos_cleared", "Photos cleared for use"],
            ].map(([key, label]) => ({ key, label })),
          },
        ],
      },
      {
        key: "research",
        title: "2. Research: build the pipeline",
        parts: [
          text(
            "Look across private and community foundations, city, county and state programs, corporate giving, and health-equity and arts funders. Add rows as you go.",
          ),
          {
            kind: "table",
            key: "pipeline",
            canAdd: true,
            columns: [
              { key: "funder", label: "Funder" },
              { key: "program", label: "Program" },
              { key: "typical_amount", label: "Typical amount" },
              { key: "deadline", label: "Deadline" },
              { key: "fit", label: "Fit" },
              { key: "why", label: "Why it fits", type: "long" },
              { key: "owner", label: "Owner" },
            ],
            rows: blankRows(6),
          },
          text("", "How to score fit"),
          {
            kind: "reference",
            columns: [
              { key: "test", label: "Test" },
              { key: "high", label: "High fit looks like" },
            ],
            rows: [
              ["Mission", "Funds health equity, wellness access, Latina or neighborhood-led work"],
              ["Geography", "Funds Pilsen, the Lower West Side or Chicago"],
              ["Size", "LSP's budget is inside the funder's usual range"],
              ["Effort", "Amount is worth the hours the application takes"],
              ["Relationship", "Someone in the LSP circle knows the funder"],
            ].map(([test, high]) => ({ cells: { test, high } })),
          },
        ],
      },
      {
        key: "rank",
        title: "3. Rank and hand off",
        parts: [
          text("Pick the 10 to 15 strongest. For each, name who writes it and when drafting starts."),
          {
            kind: "table",
            key: "ranked",
            canAdd: true,
            columns: [
              { key: "rank", label: "Rank", fixed: true },
              { key: "funder", label: "Funder" },
              { key: "ask_amount", label: "Ask amount" },
              { key: "deadline", label: "Deadline" },
              { key: "writer", label: "Writer" },
              { key: "draft_starts", label: "Draft starts" },
            ],
            rows: [1, 2, 3, 4, 5].map((n) => ({ key: `rank_${n}`, cells: { rank: String(n) } })),
          },
        ],
      },
      {
        key: "size_share",
        title: "4. Size your share",
        share: true,
        parts: [
          text(
            "Count only grants with a decision expected in 2027. For realistic, multiply each ask by an honest chance of winning.",
          ),
          scenarios("2027 total"),
        ],
      },
      {
        key: "needs",
        title: "5. What you need",
        parts: [
          needs([
            ["volunteers", "Volunteers (research, deadlines, gathering stats and photos)"],
            ["grant_writer", "A grant writer, paid or volunteer"],
            ["other_subcommittee", "Help from another subcommittee"],
            ["board_decisions", "Decisions from the board"],
          ]),
        ],
      },
      {
        key: "questions",
        title: "Questions to settle first",
        parts: [
          questions([
            ["capital_or_operating", "Which grants fund the new studio (capital) and which fund programs (operating)?"],
            ["writes_signs_off", "Who writes applications, and who signs off before they go out?"],
            ["how_many", "How many applications can LSP submit well in one year?"],
          ]),
        ],
      },
    ],
  },

  donors: {
    id: "donors",
    title: "Existing Donor Engagement worksheet",
    charge: "You own keeping the people who already give close, so they give again and give more.",
    sections: [
      {
        key: "take_stock",
        title: "1. Take stock: who gives today",
        parts: [
          text(
            "Counts only. Names, emails and gift amounts stay in the Donors tab of this dashboard.",
          ),
          {
            kind: "table",
            key: "donor_groups",
            columns: [
              { key: "group", label: "Group", fixed: true },
              { key: "how_many", label: "How many" },
              { key: "gave_again", label: "Gave again in 2026?" },
              { key: "who_knows", label: "Who in LSP knows them" },
            ],
            rows: [
              ["gala_sponsors", "Gala 2026 sponsors"],
              ["gala_paddle_auction", "Gala 2026 paddle-raise and auction donors"],
              ["giving_tuesday", "Giving Tuesday donors"],
              ["repeat_donors", "Repeat donors (two or more gifts)"],
              ["lapsed_2025", "Gave in 2025, nothing yet in 2026"],
              ["new_studio", "New-studio campaign supporters"],
            ].map(([key, label]) => ({ key, cells: { group: label } })),
          },
        ],
      },
      {
        key: "owners",
        title: "2. Give every top donor an owner",
        parts: [
          text("In the dashboard, open each top donor and set an owner and a next action. Track progress here."),
          {
            kind: "table",
            key: "owner_steps",
            columns: [
              { key: "step", label: "Step", fixed: true },
              { key: "target", label: "Target" },
              { key: "done", label: "Done" },
            ],
            rows: [
              ["top_20", "Top 20 donors identified"],
              ["owner_set", "Each has an owner in the dashboard"],
              ["next_action", "Each has a next action and a date"],
              ["first_touch", "First personal thank-you or check-in made"],
            ].map(([key, label]) => ({ key, cells: { step: label } })),
          },
        ],
      },
      {
        key: "touches",
        title: "3. Touch calendar for 2027",
        parts: [
          text("Every donor should hear from LSP several times a year without being asked for money each time."),
          {
            kind: "table",
            key: "touch_calendar",
            canAdd: true,
            columns: [
              { key: "when", label: "When" },
              { key: "touch", label: "Touch" },
              { key: "audience", label: "Who gets it" },
              { key: "owner", label: "Owner" },
            ],
            rows: [
              { key: "thank_you", cells: { when: "Within a week of any gift", touch: "Thank-you", audience: "Every donor" } },
              {
                key: "giving_tuesday_results",
                cells: { when: "January", touch: "Giving Tuesday results and thank-you", audience: "Giving Tuesday donors" },
              },
              { key: "impact_update", cells: { touch: "Impact update" } },
              { key: "class_invite", cells: { touch: "Invite to a class or event" } },
              { key: "renewal_ask", cells: { touch: "Renewal ask" } },
              { key: "row_1", cells: {} },
            ],
          },
        ],
      },
      {
        key: "size_share",
        title: "4. Size your share",
        share: true,
        parts: [
          text("Build the number from the parts, then set the three scenarios."),
          {
            kind: "table",
            key: "share_sources",
            columns: [
              { key: "source", label: "Source", fixed: true },
              { key: "donors", label: "Donors" },
              { key: "average_gift", label: "Expected average gift" },
              { key: "total", label: "Total" },
            ],
            rows: [
              ["renewals", "Renewals: last year's donors who give again"],
              ["upgrades", "Upgrades: donors asked to give more"],
              ["larger_asks", "Larger personal asks"],
              ["sponsor_renewals", "Sponsors who renew"],
            ].map(([key, label]) => ({ key, cells: { source: label } })),
          },
          scenarios("2027 total"),
        ],
      },
      {
        key: "needs",
        title: "5. What you need",
        parts: [
          needs([
            ["volunteers", "Volunteers (thank-you notes, calls, hosting donors at class)"],
            ["dashboard_access", "Dashboard access for the people who need donor details"],
            ["other_subcommittee", "Help from another subcommittee"],
            ["board_decisions", "Decisions from the board"],
          ]),
        ],
      },
      {
        key: "questions",
        title: "Questions to settle first",
        parts: [
          questions([
            ["renewal_rate", "What share of last year's donors gave again this year, and what share is a fair target?"],
            ["larger_asks", "Who makes the larger personal asks: co-leads, the Executive Director, or the donor's closest contact?"],
            ["sponsor_line", "Where is the line between this subcommittee and Events on sponsor asks?"],
          ]),
        ],
      },
    ],
  },
};

export function getWorksheet(subcommitteeId) {
  return FUNDRAISING_WORKSHEETS[subcommitteeId] || null;
}
