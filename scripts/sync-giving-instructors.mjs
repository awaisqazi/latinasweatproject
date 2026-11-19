// LSP Giving Tuesday: snapshot of the instructors on the public board, for the
// static per-person pages /give/<slug>/ (src/pages/give/[slug].astro) and
// their share cards (scripts/render-giving-instructor-og.mjs).
//
// Calls the public anon RPC giving_public (docs/giving-tuesday-2026/
// 01-backend-contract.md) with the site's PUBLIC Supabase URL and publishable
// key (the same values the browser uses; env, then .env, then the defaults in
// .github/workflows/deploy.yml). Never a service key.
//
// Writes src/data/givingInstructors.json with ONLY the public fields the board
// already shows: slug, name, first, why, avatar, goal_cents. No emails, phones
// or amounts raised. Sorted by slug, two-space JSON, trailing newline, so a
// rerun with no roster change leaves the file byte for byte the same.
//
// Usage: node scripts/sync-giving-instructors.mjs   (or npm run giving:cards)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/givingInstructors.json");
const CAMPAIGN = "giving-tuesday-2026";

// Public values only (also hard-coded in .github/workflows/deploy.yml).
const DEFAULT_URL = "https://jcseaxtvsozylsbmykka.supabase.co";
const DEFAULT_KEY = "sb_publishable_ByKQH4QqhYhrT7K-gqEhsw_zqdEvkB_";

function fileEnv() {
  const p = path.join(ROOT, ".env");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(PUBLIC_SUPABASE_URL|PUBLIC_SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = fileEnv();
const URL_BASE = (process.env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
const KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY;
if (/service_role|sb_secret_/.test(KEY)) throw new Error("refusing a non-public key; this script uses the publishable key only");

const res = await fetch(`${URL_BASE}/rest/v1/rpc/giving_public`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_campaign: CAMPAIGN }),
  signal: AbortSignal.timeout(20000),
});
if (!res.ok) throw new Error(`giving_public HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
const data = await res.json();
if (!data || data.ok !== true) throw new Error(`giving_public not ok: ${data?.reason || "unknown"}`);
if (!Array.isArray(data.fundraisers)) throw new Error("giving_public: no fundraisers array");

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const clean = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};
const fallbackGoal = Number(data.campaign?.threshold_cents) || 15000;

const rows = [];
for (const f of data.fundraisers) {
  const slug = String(f.slug || "").trim().toLowerCase();
  if (!SLUG.test(slug)) {
    console.warn(`skipping a fundraiser with an unusable slug: ${JSON.stringify(f.slug)}`);
    continue;
  }
  const name = clean(f.name);
  if (!name) {
    console.warn(`skipping ${slug}: no name`);
    continue;
  }
  const avatar = clean(f.avatar);
  rows.push({
    slug,
    name,
    first: name.split(" ")[0],
    why: clean(f.why),
    avatar: avatar && SLUG.test(avatar) ? avatar : null,
    goal_cents: Number.isFinite(Number(f.goal_cents)) && Number(f.goal_cents) > 0 ? Math.round(Number(f.goal_cents)) : fallbackGoal,
  });
}
rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

const next = JSON.stringify(rows, null, 2) + "\n";
const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
if (prev === next) {
  console.log(`givingInstructors.json unchanged (${rows.length} instructors)`);
} else {
  writeFileSync(OUT, next);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${rows.length} instructors): ${rows.map((r) => r.slug).join(", ")}`);
}
