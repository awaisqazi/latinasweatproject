// Compare the NDJSON exports (source of truth, works offline) against what
// landed in Supabase. Prints a table of source vs Supabase counts plus
// invariant checks. Exits 1 on any hard mismatch; capacity overruns from
// legacy data are reported as warnings only.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import {
  RECURRING_SHIFT_ID_RE,
  info,
  normalizeEmail,
  readNdjson,
  requireSupabaseEnv,
  section,
  warn,
} from './lib.mjs';

const { url, key } = requireSupabaseEnv();
const supabase = createClient(url, key, { auth: { persistSession: false } });

const results = []; // { entity, source, supabase, hard, note }
const warnings = [];
let hardFailure = false;

function compare(entity, source, supabaseCount, { hard = true, note = '' } = {}) {
  const match = source === supabaseCount;
  if (!match && hard) hardFailure = true;
  results.push({
    entity,
    source: String(source),
    supabase: String(supabaseCount),
    status: match ? 'OK' : hard ? 'MISMATCH' : 'WARN',
    note,
  });
}

async function countRows(table, applyFilters = (q) => q) {
  const { count, error } = await applyFilters(
    supabase.from(table).select('*', { count: 'exact', head: true })
  );
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchAll(table, columns, applyFilters = (q) => q) {
  const PAGE = 1000;
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await applyFilters(
      supabase.from(table).select(columns).order('id').range(offset, offset + PAGE - 1)
    );
    if (error) throw new Error(`select ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Volunteer shifts

async function verifyVolunteers() {
  section('Verify volunteer shifts');
  const shiftDocs = readNdjson('volunteerapp-74ebe', 'shifts');
  const customDocs = readNdjson('volunteerapp-74ebe', 'custom_shifts');
  if (!shiftDocs && !customDocs) {
    warn('No volunteerapp exports; skipping volunteer checks.');
    return;
  }

  const recurringIds = new Set(
    (shiftDocs ?? []).map((d) => d.__id).filter((id) => RECURRING_SHIFT_ID_RE.test(id))
  );
  const customIds = new Set((customDocs ?? []).filter((d) => d.start && d.end).map((d) => d.__id));

  compare(
    'recurring shifts',
    recurringIds.size,
    await countRows('volunteer_shifts', (q) => q.eq('kind', 'recurring').not('legacy_id', 'is', null))
  );
  compare(
    'custom shifts',
    customIds.size,
    await countRows('volunteer_shifts', (q) => q.eq('kind', 'custom').not('legacy_id', 'is', null))
  );

  // Expected registrations: valid emails, deduped per shift, on a doc whose
  // id resolves to a migrated shift (mirrors import.mjs skip rules).
  let expectedRegistrations = 0;
  for (const doc of shiftDocs ?? []) {
    if (!Array.isArray(doc.registrations)) continue;
    if (!recurringIds.has(doc.__id) && !customIds.has(doc.__id)) continue;
    const seen = new Set();
    for (const reg of doc.registrations) {
      const email = normalizeEmail(reg?.email);
      if (email && !seen.has(email)) seen.add(email);
    }
    expectedRegistrations += seen.size;
  }
  compare('shift registrations', expectedRegistrations, await countRows('shift_registrations'), {
    note: 'Supabase total; equal under cutover freeze',
  });

  // Soft invariant: per-shift role counts within capacities.
  const shiftsPublic = await fetchAll(
    'shifts_public',
    'id, starts_at, lead_count, lead_capacity, volunteer_count, volunteer_capacity'
  );
  let overruns = 0;
  for (const s of shiftsPublic) {
    if (s.lead_count > s.lead_capacity || s.volunteer_count > s.volunteer_capacity) {
      overruns += 1;
      warnings.push(
        `capacity overrun on shift ${s.id} (${s.starts_at}): leads ${s.lead_count}/${s.lead_capacity}, volunteers ${s.volunteer_count}/${s.volunteer_capacity}`
      );
    }
  }
  info(`capacity check: ${overruns} overrun(s) across ${shiftsPublic.length} shifts (warnings only, legacy data may exceed).`);
}

// ---------------------------------------------------------------------------
// Sub requests

async function verifySubs() {
  section('Verify sub requests');
  const docs = readNdjson('substracker-c0a34', 'sub_requests');
  if (!docs) {
    warn('No substracker exports; skipping sub checks.');
    return;
  }

  const importable = docs.filter((d) => d.date);
  compare(
    'sub requests',
    importable.length,
    await countRows('sub_requests', (q) => q.not('legacy_id', 'is', null))
  );

  let expectedVolunteers = 0;
  for (const doc of importable) {
    if (!Array.isArray(doc.volunteers)) continue;
    const seen = new Set();
    for (const vol of doc.volunteers) {
      const email = normalizeEmail(vol?.email);
      if (email && !seen.has(email)) seen.add(email);
    }
    expectedVolunteers += seen.size;
  }
  compare('sub volunteers', expectedVolunteers, await countRows('sub_volunteers'), {
    note: 'Supabase total; equal under cutover freeze',
  });
}

// ---------------------------------------------------------------------------
// Elections

async function verifyElections() {
  section('Verify elections');
  const docs = readNdjson('lspelections', 'votes');
  if (!docs) {
    warn('No elections exports; skipping vote checks.');
    return;
  }

  const validEmails = docs.map((d) => normalizeEmail(d.email)).filter(Boolean);
  const distinctEmails = new Set(validEmails);
  if (validEmails.length !== docs.length) {
    warnings.push(`votes: ${docs.length - validEmails.length} source vote(s) had invalid emails (skipped at import).`);
  }
  if (distinctEmails.size !== validEmails.length) {
    warnings.push(
      `votes: ${validEmails.length - distinctEmails.size} duplicate-email vote(s) in source; only the first per email migrates.`
    );
  }

  const { data: current, error } = await supabase
    .from('elections')
    .select('id')
    .eq('is_current', true)
    .limit(1);
  if (error) throw new Error(`select current election: ${error.message}`);
  if (!current?.[0]) {
    compare('election votes (distinct emails)', distinctEmails.size, 0, { note: 'no current election found' });
    return;
  }

  const voteCount = await countRows('election_votes', (q) => q.eq('election_id', current[0].id));
  compare('election votes (distinct emails)', distinctEmails.size, voteCount);
  results.push({
    entity: 'source votes (raw)',
    source: String(docs.length),
    supabase: '-',
    status: 'INFO',
    note: 'before email validation/dedupe',
  });

  // Invariant: votes unique per lowercase email (enforced by index; double-check).
  const votes = await fetchAll('election_votes', 'email', (q) => q.eq('election_id', current[0].id));
  const lowered = new Set(votes.map((v) => v.email.toLowerCase()));
  if (lowered.size !== votes.length) {
    hardFailure = true;
    results.push({
      entity: 'votes unique per email',
      source: String(lowered.size),
      supabase: String(votes.length),
      status: 'MISMATCH',
      note: 'duplicate emails in election_votes',
    });
  } else {
    info(`vote uniqueness: ${votes.length} votes, all distinct emails.`);
  }
}

// ---------------------------------------------------------------------------
// Gala

async function verifyGala() {
  section('Verify gala');
  const guestDocs = readNdjson('galathermometerapp', 'gala_guests');
  const donationDocs = readNdjson('galathermometerapp', 'gala_donations');
  if (!guestDocs && !donationDocs) {
    warn('No gala exports; skipping gala checks.');
    return;
  }

  if (guestDocs) {
    const validPaddles = guestDocs
      .map((d) => parseInt(d.paddleNumber, 10))
      .filter((p) => Number.isInteger(p) && p > 0);
    const uniquePaddles = new Set(validPaddles);
    if (validPaddles.length !== guestDocs.length) {
      warnings.push(`gala_guests: ${guestDocs.length - validPaddles.length} guest(s) had unparseable paddles (skipped at import).`);
    }
    if (uniquePaddles.size !== validPaddles.length) {
      warnings.push(`gala_guests: ${validPaddles.length - uniquePaddles.size} duplicate paddle(s) in source; later docs skipped at import.`);
    }
    compare(
      'gala guests (unique paddles)',
      uniquePaddles.size,
      await countRows('gala_guests', (q) => q.not('legacy_id', 'is', null))
    );
  }

  if (donationDocs) {
    compare(
      'gala donations',
      donationDocs.length,
      await countRows('gala_donations', (q) => q.not('legacy_id', 'is', null))
    );

    // Invariant: donation totals match to the cent.
    const sourceCents = donationDocs.reduce(
      (sum, d) => sum + Math.round(Math.max(0, Number(d.amount) || 0) * 100),
      0
    );
    const dbRows = await fetchAll('gala_donations', 'amount', (q) => q.not('legacy_id', 'is', null));
    const dbCents = dbRows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
    compare('donation total (cents)', sourceCents, dbCents);
  }
}

// ---------------------------------------------------------------------------

function printTable() {
  section('Results');
  const headers = ['Entity', 'Source', 'Supabase', 'Status', 'Note'];
  const rows = results.map((r) => [r.entity, r.source, r.supabase, r.status, r.note]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(`  ${line(headers)}`);
  console.log(`  ${line(widths.map((w) => '-'.repeat(w)))}`);
  for (const row of rows) console.log(`  ${line(row)}`);

  if (warnings.length > 0) {
    section('Warnings');
    for (const w of warnings) warn(w);
  }
}

async function main() {
  await verifyVolunteers();
  await verifySubs();
  await verifyElections();
  await verifyGala();

  printTable();

  if (hardFailure) {
    console.error('\nVerification FAILED: hard mismatches found.');
    process.exit(1);
  }
  console.log('\nVerification passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
