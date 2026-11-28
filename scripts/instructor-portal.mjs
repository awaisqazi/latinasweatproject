#!/usr/bin/env node
// Instructor portal (/instructors): validate, push and pull the content document
// and set the passcode, out of band. Contract: src/lib/instructorPortal/README.md.
//
// Talks to the database through the Supabase Management API SQL endpoint, with
// the Supabase CLI's own login token read from the macOS keychain. The owner-only
// functions it calls (instructor_portal_set_content, instructor_portal_set_passcode)
// are not reachable from the Data API at all.
//
// Secrets: the passcode is read from PORTAL_PASSCODE or a hidden prompt, never
// from argv, and is never printed or written to disk. The keychain token is never
// printed. Content is never printed either, only its size and timestamp.
//
// Usage: node scripts/instructor-portal.mjs --help

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../src/lib/instructorPortal/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_DIR = path.join(ROOT, "private/instructor-portal");
const CONTENT_FILE = path.join(PRIVATE_DIR, "content.json");
const PROJECT_REF = "jcseaxtvsozylsbmykka";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const DEFAULT_SLUG = "instructors";
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const HELP = `Instructor portal content and passcode

  node scripts/instructor-portal.mjs <command> [--slug <slug>]

Commands
  check            validate private/instructor-portal/content.json (schema 1)
  push             check, then store it as the live content for the slug
  pull             fetch the live content into private/instructor-portal/pulled-<slug>.json
                   (content.json is never overwritten)
  set-passcode     set or rotate the passcode; signs everyone out of that slug.
                   Reads PORTAL_PASSCODE, or prompts with echo off when unset.
  status           access row, content row and updated_at, live sessions,
                   wrong attempts in the last 10 minutes
  clear-lockout    delete the slug's attempt rows (lifts a lockout)

Options
  --slug <slug>    instructors (default) or instructors-dev for browser testing
  --help, -h       this text

push, pull, set-passcode, status and clear-lockout use the Supabase CLI login
from the macOS keychain ("supabase login" for the LSP account).`;

/* ------------------------------------------------------------------ *
 * args
 * ------------------------------------------------------------------ */

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { command: null, slug: DEFAULT_SLUG, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--slug") {
      const v = argv[++i];
      if (v === undefined) fail("--slug needs a value");
      args.slug = v;
    } else if (a.startsWith("--slug=")) args.slug = a.slice("--slug=".length);
    else if (!args.command && !a.startsWith("-")) args.command = a;
    else {
      // Never echo the stray value: it could be a passcode typed in the wrong place.
      fail("unexpected argument. The passcode is never taken from the command line; use PORTAL_PASSCODE or the prompt. See --help.");
    }
  }
  return args;
}

function checkSlug(slug) {
  if (!SLUG_RE.test(slug)) fail("slug must match ^[a-z0-9-]{3,40}$");
  return slug;
}

/* ------------------------------------------------------------------ *
 * content file
 * ------------------------------------------------------------------ */

function loadContentFile() {
  if (!existsSync(CONTENT_FILE)) fail(`not found: ${path.relative(ROOT, CONTENT_FILE)}`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(CONTENT_FILE, "utf8"));
  } catch (e) {
    fail(`${path.relative(ROOT, CONTENT_FILE)} is not valid JSON (${e.message})`);
  }
  return doc;
}

function runCheck() {
  const doc = loadContentFile();
  const { ok, errors, warnings } = validateContent(doc);
  for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`error    ${e}`);
  const rel = path.relative(ROOT, CONTENT_FILE);
  if (!ok) {
    console.log(`\nFAIL  ${rel}: ${errors.length} error${errors.length === 1 ? "" : "s"}`);
    process.exit(1);
  }
  const bytes = Buffer.byteLength(JSON.stringify(doc), "utf8");
  console.log(`OK    ${rel} is valid schema 1 (${bytes} bytes compact${warnings.length ? `, ${warnings.length} warning(s)` : ""})`);
  return doc;
}

/* ------------------------------------------------------------------ *
 * Management API
 * ------------------------------------------------------------------ */

function accessToken() {
  let raw;
  try {
    raw = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    fail('no Supabase CLI login found in the keychain. Run "supabase login" with the LSP account.');
  }
  const prefix = "go-keyring-base64:";
  if (raw.startsWith(prefix)) {
    raw = Buffer.from(raw.slice(prefix.length), "base64").toString("utf8").trim();
  }
  if (!/^sbp_[A-Za-z0-9]+$/.test(raw)) {
    fail('the keychain entry "Supabase CLI" is not a Supabase access token. Run "supabase login" with the LSP account.');
  }
  return raw;
}

function b64(text) {
  const out = Buffer.from(text, "utf8").toString("base64");
  if (!B64_RE.test(out)) fail("internal: base64 encoding produced unexpected characters");
  return out;
}

async function sql(query, { scrub = [] } = {}) {
  const token = accessToken();
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    fail(`could not reach the Supabase Management API (${e.name === "TimeoutError" ? "timed out" : e.message})`);
  }
  if (res.status === 401 || res.status === 403) {
    fail(
      `the Management API refused the request (HTTP ${res.status}). The Supabase CLI is most likely ` +
        `logged in to a different account. Run "supabase login" for the LSP account and try again.`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message || text;
    } catch {
      /* keep raw */
    }
    for (const s of scrub) if (s) message = message.split(s).join("[redacted]");
    fail(`Management API HTTP ${res.status}: ${String(message).slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail("the Management API returned something that is not JSON");
  }
}

function firstResult(rows, column) {
  const row = Array.isArray(rows) ? rows[0] : null;
  let v = row ? row[column] : undefined;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      /* leave as string */
    }
  }
  return v;
}

/* ------------------------------------------------------------------ *
 * passcode prompt (echo off)
 * ------------------------------------------------------------------ */

function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Piped in: first line of stdin.
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (d) => (buf += d));
      stdin.on("end", () => resolve(buf.split(/\r?\n/)[0] ?? ""));
      return;
    }
    process.stderr.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function newPasscode() {
  const fromEnv = process.env.PORTAL_PASSCODE;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const first = await readHidden("New passcode (hidden): ");
  if (process.stdin.isTTY) {
    const again = await readHidden("Type it again: ");
    if (again !== first) fail("the two entries did not match. Nothing was changed.");
  }
  return first;
}

/* ------------------------------------------------------------------ *
 * commands
 * ------------------------------------------------------------------ */

async function runPush(slug) {
  const doc = runCheck();
  const json = JSON.stringify(doc);
  const query =
    `select public.instructor_portal_set_content('${slug}', ` +
    `convert_from(decode('${b64(json)}', 'base64'), 'utf8')::jsonb) as r;`;
  const r = firstResult(await sql(query), "r");
  if (!r || r.ok !== true) fail(`push refused: ${r?.reason || "no result"}`);
  console.log(`pushed  slug=${slug}  updated_at=${r.updated_at}  bytes=${r.bytes}`);
}

async function runPull(slug) {
  const rows = await sql(
    `select content, updated_at from public.instructor_portal_content where slug = '${slug}';`,
  );
  if (!Array.isArray(rows) || rows.length === 0) fail(`no content stored for slug ${slug}`);
  let content = rows[0].content;
  if (typeof content === "string") content = JSON.parse(content);
  mkdirSync(PRIVATE_DIR, { recursive: true });
  const out = path.join(PRIVATE_DIR, `pulled-${slug}.json`);
  const body = `${JSON.stringify(content, null, 2)}\n`;
  writeFileSync(out, body);
  console.log(`pulled  slug=${slug}  updated_at=${rows[0].updated_at}  bytes=${Buffer.byteLength(body)}`);
  console.log(`wrote   ${path.relative(ROOT, out)} (content.json left as it was)`);
}

async function runSetPasscode(slug) {
  const pass = await newPasscode();
  if (pass.length < 8) fail("the passcode must be at least 8 characters. Nothing was changed.");
  if (Buffer.byteLength(pass, "utf8") > 72) fail("the passcode must be at most 72 bytes. Nothing was changed.");
  const enc = b64(pass);
  const query =
    `select public.instructor_portal_set_passcode('${slug}', ` +
    `convert_from(decode('${enc}', 'base64'), 'utf8')) as r;`;
  const r = firstResult(await sql(query, { scrub: [enc, pass] }), "r");
  if (!r || r.ok !== true) fail(`set-passcode refused: ${r?.reason || "no result"}`);
  console.log(`passcode set  slug=${slug}  sessions signed out=${r.sessions_ended ?? 0}`);
}

async function runStatus(slug) {
  const q = `'${slug}'`;
  const rows = await sql(`
    select
      (select count(*) from public.instructor_portal_access where slug = ${q}) > 0 as has_access,
      (select updated_at from public.instructor_portal_access where slug = ${q}) as passcode_updated_at,
      (select count(*) from public.instructor_portal_content where slug = ${q}) > 0 as has_content,
      (select updated_at from public.instructor_portal_content where slug = ${q}) as content_updated_at,
      (select octet_length(content::text) from public.instructor_portal_content where slug = ${q}) as content_bytes,
      (select count(*) from public.instructor_portal_sessions where slug = ${q} and expires_at > now()) as live_sessions,
      (select count(*) from public.instructor_portal_attempts
         where slug = ${q} and attempted_at > now() - interval '10 minutes') as wrong_attempts_10m;`);
  const s = rows?.[0];
  if (!s) fail("status returned no row");
  const n = Number(s.wrong_attempts_10m) || 0;
  console.log(`slug                 ${slug}`);
  console.log(`passcode set         ${s.has_access ? `yes (${s.passcode_updated_at})` : "no"}`);
  console.log(`content stored       ${s.has_content ? `yes (${s.content_updated_at}, ${s.content_bytes} bytes)` : "no"}`);
  console.log(`live sessions        ${s.live_sessions}`);
  console.log(`wrong tries, 10 min  ${n}${n >= 20 ? "  LOCKED (clear-lockout lifts it)" : ""}`);
}

async function runClearLockout(slug) {
  const rows = await sql(
    `with d as (delete from public.instructor_portal_attempts where slug = '${slug}' returning 1)
     select count(*) as cleared from d;`,
  );
  console.log(`lockout cleared  slug=${slug}  attempt rows removed=${rows?.[0]?.cleared ?? 0}`);
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.command) {
  console.log(HELP);
  process.exit(args.help ? 0 : 1);
}
const slug = checkSlug(args.slug);

switch (args.command) {
  case "check":
    runCheck();
    break;
  case "push":
    await runPush(slug);
    break;
  case "pull":
    await runPull(slug);
    break;
  case "set-passcode":
    await runSetPasscode(slug);
    break;
  case "status":
    await runStatus(slug);
    break;
  case "clear-lockout":
    await runClearLockout(slug);
    break;
  default:
    // Not echoed, for the same reason as a stray argument.
    fail("unknown command. See --help.");
}
