// DEV ONLY mock of rpc("giving_public"), shaped exactly like the contract in
// live.js. Loaded through a dynamic import behind import.meta.env.DEV, so it
// never ships. Names are derived from the avatar slugs that already exist in
// public/images/popup/instructors (photo and name always match); a few rows
// drop the avatar to exercise the initials fallback. Amounts are fake.
//
//   ?mock=0|5|40       number of fundraisers (default 5)
//   &total=6240        campaign total in dollars (default 0)
//   &mock=fail         make the call throw (static fallback state)
//   &board=closed      board_open false
//   &signup=closed     signup_open false
//   &prize=Some+prize  prize_label
//   &giveurl=1         campaign give_url set

const SLUGS = [
  "alondra-alcazar", "amayrani-nunez", "anabel-hernandez", "andrea-fuentes", "antonia-rosales",
  "ariel-cervera", "ariesna-garcia-sedano", "ashley-reitz", "benjamin-drury", "brenda-maldonado",
  "celina-huerta", "courtney-luedke", "dinorah-zubieta", "efren-ramirez-jr", "fabiola-davila",
  "fabiola-saldana", "ghazala-irshad", "gigi-torres", "gisella-mitchell", "giselle-castaneda",
  "jade-nguyen", "jay-pena", "jessica-eguia", "jiana-calixto", "jocelyn-vega",
  "juanita-barajas", "kellyn-mitchell", "lizette-vega", "lucia-del-rincon-martinez", "luz-rodriguez",
  "marelin-enriquez", "marlene-garcia", "rut-merida", "sarah-esparza", "savannah-alvarez",
  "vanessa-tirado", "vero-quinones", "xochyl-perez", "yaritza-jurado", "zoraida-magana",
];
const titleCase = (slug) =>
  slug
    .split("-")
    .map((w) => (w === "jr" ? "Jr." : w === "del" ? "del" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
// Placeholder lines only: never put words in a real instructor's mouth.
const WHYS = [
  "Sample why line for layout testing.",
  null,
  "A longer sample why line, to test how two lines wrap.",
  null,
  null,
  "Short sample line.",
];
const COHORTS = ["instructor", "ytt-2026", "both"];

function rand(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockGivingPublic(q) {
  if (q.get("mock") === "fail") throw new Error("mock failure");
  const n = Math.max(0, Math.min(40, Number(q.get("mock")) || (q.get("mock") === "0" ? 0 : 5)));
  const totalCents = Math.round((Number(q.get("total")) || 0) * 100);
  const r = rand(7 + n);
  const fundraisers = SLUGS.slice(0, n).map((slug, i) => {
    // Spread the total across fundraisers when there is one; else zeros.
    const raised = totalCents > 0 ? Math.round((r() < 0.25 ? 150 + r() * 260 : r() * 149) ) * 100 : 0;
    return {
      slug,
      name: titleCase(slug),
      cohort: COHORTS[i % 3],
      avatar: i % 7 === 3 ? null : slug,
      why: WHYS[i % WHYS.length],
      raised_cents: raised,
      gift_count: raised ? 1 + Math.floor(raised / 4000) : 0,
      goal_cents: 15000,
      reached: raised >= 15000,
      give_url: i % 4 === 1 ? null : `https://www.zeffy.com/en-US/peer-to-peer/mock-${slug}`,
    };
  });
  return {
    ok: true,
    campaign: {
      slug: "giving-tuesday-2026",
      title: "LSP Giving Tuesday",
      goal_cents: 1500000,
      threshold_cents: 15000,
      starts_at: "2026-11-19T06:00:00Z",
      ends_at: "2026-12-02T05:59:59Z",
      give_url: q.get("giveurl") ? "https://www.zeffy.com/en-US/peer-to-peer/mock-campaign" : null,
      prize_label: q.get("prize") || null,
      board_open: q.get("board") !== "closed",
      signup_open: q.get("signup") !== "closed",
    },
    total_cents: totalCents,
    gift_count: totalCents ? Math.max(1, Math.round(totalCents / 9000)) : 0,
    fundraiser_count: n,
    reached_count: fundraisers.filter((f) => f.reached).length,
    fundraisers,
    turnstile_site_key: "mock",
    server_time: new Date().toISOString(),
  };
}
