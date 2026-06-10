// Import the NDJSON exports (created by export.mjs) into Supabase.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Every write path is
// idempotent: rows with a legacy_id are upserted on it, and child rows
// (registrations, sub volunteers, votes) use duplicate-tolerant inserts that
// treat unique-index collisions (23505) as "already migrated".
//
// Projects whose exports are missing are skipped with a warning.

import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { createClient } from '@supabase/supabase-js';
import {
  EXPORTS_DIR,
  RECURRING_SHIFT_ID_RE,
  ZONE,
  chunk,
  info,
  normalizeEmail,
  readNdjson,
  requireSupabaseEnv,
  section,
  warn,
} from './lib.mjs';

const { url, key } = requireSupabaseEnv();
const supabase = createClient(url, key, { auth: { persistSession: false } });

const BATCH = 200;
const report = {};

function recordStats(entity, stats) {
  report[entity] = stats;
  info(`${entity}: inserted ${stats.inserted}, updated ${stats.updated}, skipped ${stats.skipped}`);
}

function fail(context, error) {
  throw new Error(`${context}: ${error.message ?? JSON.stringify(error)}`);
}

function clampText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// ---------------------------------------------------------------------------
// Generic write helpers

async function fetchLegacyIdMap(table, legacyIds) {
  const map = new Map();
  for (const part of chunk([...new Set(legacyIds)], BATCH)) {
    const { data, error } = await supabase.from(table).select('id, legacy_id').in('legacy_id', part);
    if (error) fail(`select ${table} legacy ids`, error);
    for (const row of data) map.set(row.legacy_id, row.id);
  }
  return map;
}

// Upsert on legacy_id, counting inserted vs updated by checking which
// legacy_ids already exist. Falls back to row-by-row on 23505 so a secondary
// unique constraint (e.g. gala paddle numbers) skips the offender, not the batch.
async function upsertByLegacyId(table, rows, describe = (r) => r.legacy_id) {
  const stats = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return stats;

  const existing = await fetchLegacyIdMap(table, rows.map((r) => r.legacy_id));

  for (const part of chunk(rows, BATCH)) {
    // defaultToNull: false -> rows missing optional keys (e.g. created_at)
    // fall back to column defaults instead of null.
    const { error } = await supabase
      .from(table)
      .upsert(part, { onConflict: 'legacy_id', defaultToNull: false });
    if (!error) {
      for (const row of part) (existing.has(row.legacy_id) ? stats.updated++ : stats.inserted++);
      continue;
    }
    if (error.code !== '23505') fail(`upsert ${table}`, error);
    for (const row of part) {
      const { error: rowError } = await supabase.from(table).upsert(row, { onConflict: 'legacy_id' });
      if (!rowError) {
        existing.has(row.legacy_id) ? stats.updated++ : stats.inserted++;
      } else if (rowError.code === '23505') {
        warn(`${table}: skipped ${describe(row)} (unique conflict: ${rowError.message})`);
        stats.skipped += 1;
      } else {
        fail(`upsert ${table} row ${describe(row)}`, rowError);
      }
    }
  }
  return stats;
}

// Plain insert that tolerates duplicates. The dedupe indexes use
// lower(email), which PostgREST upsert can't target, so emails are
// pre-lowercased and 23505 collisions are treated as already-migrated rows.
async function duplicateTolerantInsert(table, rows, describe, onCollision) {
  const stats = { inserted: 0, updated: 0, skipped: 0 };

  for (const part of chunk(rows, BATCH)) {
    const { error } = await supabase.from(table).insert(part, { defaultToNull: false });
    if (!error) {
      stats.inserted += part.length;
      continue;
    }
    if (error.code !== '23505') fail(`insert ${table}`, error);
    // Batch had at least one duplicate: retry row by row.
    for (const row of part) {
      const { error: rowError } = await supabase.from(table).insert(row);
      if (!rowError) {
        stats.inserted += 1;
      } else if (rowError.code === '23505') {
        stats.skipped += 1;
        if (onCollision) await onCollision(row);
      } else {
        fail(`insert ${table} row ${describe(row)}`, rowError);
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Volunteer shifts (volunteerapp-74ebe)

function parseRecurringShiftId(id) {
  const [date, times] = id.split('_');
  const [start, end] = times.split('-');
  const startsAt = DateTime.fromFormat(`${date} ${start}`, 'yyyy-MM-dd HHmm', { zone: ZONE });
  let endsAt = DateTime.fromFormat(`${date} ${end}`, 'yyyy-MM-dd HHmm', { zone: ZONE });
  if (!startsAt.isValid || !endsAt.isValid) return null;
  if (endsAt <= startsAt) endsAt = endsAt.plus({ days: 1 });
  return { startsAt, endsAt };
}

async function importVolunteerShifts(shiftDocs, customDocs) {
  section('Import volunteer shifts');

  // Recurring shifts come from pattern-matching `shifts` doc ids.
  const recurringRows = [];
  for (const doc of shiftDocs) {
    if (!RECURRING_SHIFT_ID_RE.test(doc.__id)) continue;
    const parsed = parseRecurringShiftId(doc.__id);
    if (!parsed) {
      warn(`shifts/${doc.__id}: unparseable id; skipped.`);
      continue;
    }
    recurringRows.push({
      legacy_id: doc.__id,
      kind: 'recurring',
      starts_at: parsed.startsAt.toUTC().toISO(),
      ends_at: parsed.endsAt.toUTC().toISO(),
      lead_capacity: doc.leadCapacity ?? 1,
      volunteer_capacity: doc.volunteerCapacity ?? 2,
      cancelled: !!doc.cancelled,
    });
  }
  recordStats('volunteer_shifts (recurring)', await upsertByLegacyId('volunteer_shifts', recurringRows));

  // Custom shifts come from the custom_shifts collection.
  const customRows = [];
  for (const doc of customDocs) {
    if (!doc.start || !doc.end) {
      warn(`custom_shifts/${doc.__id}: missing start/end; skipped.`);
      continue;
    }
    customRows.push({
      legacy_id: doc.__id,
      kind: 'custom',
      starts_at: doc.start,
      ends_at: doc.end,
      lead_capacity: doc.leadCapacity ?? 1,
      volunteer_capacity: doc.volunteerCapacity ?? 2,
      cancelled: !!doc.cancelled,
      ...(doc.createdAt ? { created_at: doc.createdAt } : {}),
    });
  }
  recordStats('volunteer_shifts (custom)', await upsertByLegacyId('volunteer_shifts', customRows));

  await backfillTemplateIds();
}

// Match imported recurring shifts to shift_templates by Chicago-local
// (weekday, start time, end time) and fill template_id where it is null.
async function backfillTemplateIds() {
  const { data: templates, error: templatesError } = await supabase
    .from('shift_templates')
    .select('id, day_of_week, start_time, end_time');
  if (templatesError) fail('select shift_templates', templatesError);

  const templateByKey = new Map(
    templates.map((t) => [`${t.day_of_week}|${t.start_time}|${t.end_time}`, t.id])
  );

  // Fetch every candidate first (updating while paginating a
  // template_id-is-null filter would shift the result window).
  const candidates = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: shifts, error } = await supabase
      .from('volunteer_shifts')
      .select('id, legacy_id, starts_at, ends_at')
      .eq('kind', 'recurring')
      .not('legacy_id', 'is', null)
      .is('template_id', null)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) fail('select shifts for template backfill', error);
    candidates.push(...shifts);
    if (shifts.length < PAGE) break;
  }

  let updated = 0;
  let unmatched = 0;
  let conflicted = 0;

  for (const shift of candidates) {
    const start = DateTime.fromISO(shift.starts_at, { zone: ZONE });
    const end = DateTime.fromISO(shift.ends_at, { zone: ZONE });
    const key = `${start.weekday % 7}|${start.toFormat('HH:mm:ss')}|${end.toFormat('HH:mm:ss')}`;
    const templateId = templateByKey.get(key);
    if (!templateId) {
      unmatched += 1;
      continue;
    }
    const { error: updateError } = await supabase
      .from('volunteer_shifts')
      .update({ template_id: templateId })
      .eq('id', shift.id);
    if (!updateError) {
      updated += 1;
    } else if (updateError.code === '23505') {
      // A cron-generated instance already holds (template_id, starts_at).
      warn(`template backfill conflict for ${shift.legacy_id}; generated duplicate exists.`);
      conflicted += 1;
    } else {
      fail(`backfill template for ${shift.legacy_id}`, updateError);
    }
  }

  report['template_backfill'] = { updated, unmatched, conflicted };
  info(`template backfill: ${updated} linked, ${unmatched} without a matching template, ${conflicted} conflicts`);
}

// Registrations live on `shifts` docs for both recurring (pattern ids) and
// custom shifts (doc id = custom_shifts doc id).
async function importRegistrations(shiftDocs) {
  section('Import shift registrations');

  const holders = shiftDocs.filter((d) => Array.isArray(d.registrations) && d.registrations.length > 0);
  const shiftIdMap = await fetchLegacyIdMap('volunteer_shifts', holders.map((d) => d.__id));

  const rows = [];
  let skipped = 0;
  for (const doc of holders) {
    const shiftId = shiftIdMap.get(doc.__id);
    if (!shiftId) {
      warn(`shifts/${doc.__id}: no volunteer_shifts row resolved; ${doc.registrations.length} registrations skipped.`);
      skipped += doc.registrations.length;
      continue;
    }
    const seenEmails = new Set();
    for (const reg of doc.registrations) {
      const email = normalizeEmail(reg?.email);
      if (!email) {
        warn(`shifts/${doc.__id}: invalid email ${JSON.stringify(reg?.email ?? null)} for "${reg?.name ?? ''}"; skipped.`);
        skipped += 1;
        continue;
      }
      if (seenEmails.has(email)) {
        warn(`shifts/${doc.__id}: duplicate registration email ${email} in source array; skipped.`);
        skipped += 1;
        continue;
      }
      seenEmails.add(email);
      rows.push({
        shift_id: shiftId,
        name: clampText(reg.name, 120) ?? email.split('@')[0],
        email,
        phone: clampText(reg.phone, 30),
        role: reg.role === 'lead' ? 'lead' : 'volunteer',
        checked_in: !!reg.checkedIn,
        check_in_time: reg.checkInTime || null,
      });
    }
  }

  const stats = await duplicateTolerantInsert(
    'shift_registrations',
    rows,
    (r) => `${r.email} on shift ${r.shift_id}`
  );
  stats.skipped += skipped;
  recordStats('shift_registrations', stats);
}

// ---------------------------------------------------------------------------
// Sub requests (substracker-c0a34)

function parseDurationMinutes(duration) {
  const match = String(duration ?? '').match(/\d+/);
  if (!match) return null;
  const minutes = parseInt(match[0], 10);
  if (minutes < 5 || minutes > 600) {
    warn(`duration "${duration}" outside 5-600 minutes; stored as null.`);
    return null;
  }
  return minutes;
}

async function importSubRequests(docs) {
  section('Import sub requests');

  const rows = [];
  for (const doc of docs) {
    const date = doc.date ? DateTime.fromISO(doc.date, { zone: ZONE }).toISODate() : null;
    if (!date) {
      warn(`sub_requests/${doc.__id}: missing/invalid date; skipped.`);
      continue;
    }

    let requestedByName = clampText(doc.requestedBy?.name, 120);
    if (!requestedByName) {
      warn(`sub_requests/${doc.__id}: missing requester name; using "Unknown".`);
      requestedByName = 'Unknown';
    }
    let requestedByEmail = normalizeEmail(doc.requestedBy?.email);
    if (!requestedByEmail) {
      warn(`sub_requests/${doc.__id}: missing/invalid requester email; using fallback.`);
      requestedByEmail = 'unknown@latinasweatproject.com';
    }

    let status = doc.status;
    if (!['open', 'pending', 'approved'].includes(status)) {
      warn(`sub_requests/${doc.__id}: unknown status "${status}"; using "open".`);
      status = 'open';
    }

    rows.push({
      legacy_id: doc.__id,
      class_name: clampText(doc.className, 120) ?? 'Unknown class',
      date,
      duration_minutes: parseDurationMinutes(doc.duration),
      location: clampText(doc.location, 200),
      notes: clampText(doc.notes, 2000),
      requested_by_name: requestedByName,
      requested_by_email: requestedByEmail,
      status,
      assigned_sub_name: clampText(doc.assignedSub?.name, 120),
      assigned_sub_email: normalizeEmail(doc.assignedSub?.email),
      assigned_sub_phone: clampText(doc.assignedSub?.phone, 30),
      assigned_at: doc.assignedSub?.assignedAt || null,
      ...(doc.createdAt ? { created_at: doc.createdAt } : {}),
    });
  }
  recordStats('sub_requests', await upsertByLegacyId('sub_requests', rows));

  // volunteers[] -> sub_volunteers
  const requestIdMap = await fetchLegacyIdMap('sub_requests', docs.map((d) => d.__id));
  const volunteerRows = [];
  let skipped = 0;
  for (const doc of docs) {
    const requestId = requestIdMap.get(doc.__id);
    if (!requestId || !Array.isArray(doc.volunteers)) continue;
    const seen = new Set();
    for (const vol of doc.volunteers) {
      const email = normalizeEmail(vol?.email);
      if (!email) {
        warn(`sub_requests/${doc.__id}: volunteer with invalid email ${JSON.stringify(vol?.email ?? null)}; skipped.`);
        skipped += 1;
        continue;
      }
      if (seen.has(email)) {
        skipped += 1;
        continue;
      }
      seen.add(email);
      volunteerRows.push({
        request_id: requestId,
        name: clampText(vol.name, 120) ?? email.split('@')[0],
        email,
        phone: clampText(vol.phone, 30),
      });
    }
  }

  const stats = await duplicateTolerantInsert(
    'sub_volunteers',
    volunteerRows,
    (r) => `${r.email} on request ${r.request_id}`
  );
  stats.skipped += skipped;
  recordStats('sub_volunteers', stats);
}

// ---------------------------------------------------------------------------
// Elections (lspelections)

async function ensureCurrentElection(settingsDocs) {
  const { data: current, error } = await supabase
    .from('elections')
    .select('id, name, override')
    .eq('is_current', true)
    .limit(1);
  if (error) fail('select current election', error);

  let election = current?.[0];
  if (!election) {
    const { data: created, error: insertError } = await supabase
      .from('elections')
      .insert({ name: 'LSP Board Elections', is_current: true })
      .select('id, name, override')
      .single();
    if (insertError) fail('insert current election', insertError);
    election = created;
    info(`Created current election "${election.name}".`);
  } else {
    info(`Using current election "${election.name}".`);
  }

  const votingPeriod = (settingsDocs ?? []).find((d) => d.__id === 'votingPeriod');
  if (votingPeriod) {
    const override = ['open', 'closed'].includes(votingPeriod.override) ? votingPeriod.override : null;
    const { error: updateError } = await supabase
      .from('elections')
      .update({ override })
      .eq('id', election.id);
    if (updateError) fail('apply votingPeriod override', updateError);
    info(`Applied legacy votingPeriod override: ${override ?? 'null (scheduled window)'}.`);
  }
  return election;
}

async function importVotes(voteDocs, settingsDocs) {
  section('Import election votes');

  const election = await ensureCurrentElection(settingsDocs);

  const rows = [];
  let skipped = 0;
  for (const doc of voteDocs) {
    const email = normalizeEmail(doc.email);
    if (!email) {
      warn(`votes/${doc.__id}: invalid email ${JSON.stringify(doc.email ?? null)}; skipped.`);
      skipped += 1;
      continue;
    }
    const createdAt = doc.submittedAt || doc.submittedAtLocal;
    rows.push({
      election_id: election.id,
      email,
      president: clampText(doc.president, 120),
      vice_president: clampText(doc.vicePresident, 120),
      treasurer: clampText(doc.treasurer, 120),
      secretary: clampText(doc.secretary, 120),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }

  const stats = await duplicateTolerantInsert(
    'election_votes',
    rows,
    (r) => r.email,
    async (row) => {
      // Log both the incoming email and the stored one it collided with.
      const pattern = row.email.replace(/([%_\\])/g, '\\$1');
      const { data } = await supabase
        .from('election_votes')
        .select('email')
        .eq('election_id', row.election_id)
        .ilike('email', pattern)
        .limit(1);
      warn(`election_votes: collision for "${row.email}" (existing vote: "${data?.[0]?.email ?? 'unknown'}").`);
    }
  );
  stats.skipped += skipped;
  recordStats('election_votes', stats);
}

// ---------------------------------------------------------------------------
// Gala (galathermometerapp)

const GUEST_KNOWN_KEYS = new Set([
  '__id', '__collection', 'paddleNumber', 'firstName', 'lastName',
  'checkedIn', 'checkInTime', 'originalPaddle',
]);
const DONATION_KNOWN_KEYS = new Set([
  '__id', '__collection', 'amount', 'paddleNumber', 'donorName', 'timestamp',
]);

function collectExtras(doc, knownKeys) {
  const extras = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!knownKeys.has(k)) extras[k] = v;
  }
  return extras;
}

function parsePaddle(value) {
  const paddle = parseInt(value, 10);
  return Number.isInteger(paddle) && paddle > 0 ? paddle : null;
}

async function importGalaGuests(docs) {
  section('Import gala guests');

  const rows = [];
  let skipped = 0;
  for (const doc of docs) {
    const paddle = parsePaddle(doc.paddleNumber);
    if (paddle === null) {
      warn(`gala_guests/${doc.__id}: unparseable paddle ${JSON.stringify(doc.paddleNumber ?? null)}; skipped.`);
      skipped += 1;
      continue;
    }
    rows.push({
      legacy_id: doc.__id,
      paddle_number: paddle,
      first_name: clampText(doc.firstName, 200),
      last_name: clampText(doc.lastName, 200),
      checked_in: !!doc.checkedIn,
      check_in_time: doc.checkInTime || null,
      original_paddle: parsePaddle(doc.originalPaddle),
      extras: collectExtras(doc, GUEST_KNOWN_KEYS),
    });
  }

  const stats = await upsertByLegacyId('gala_guests', rows, (r) => `${r.legacy_id} (paddle ${r.paddle_number})`);
  stats.skipped += skipped;
  recordStats('gala_guests', stats);
}

async function importGalaDonations(docs) {
  section('Import gala donations');

  const rows = [];
  for (const doc of docs) {
    let amount = Number(doc.amount) || 0;
    if (amount < 0) {
      warn(`gala_donations/${doc.__id}: negative amount ${amount}; stored as 0.`);
      amount = 0;
    }
    rows.push({
      legacy_id: doc.__id,
      amount,
      paddle_number: parsePaddle(doc.paddleNumber),
      donor_name: clampText(doc.donorName, 200),
      extras: collectExtras(doc, DONATION_KNOWN_KEYS),
      ...(doc.timestamp ? { created_at: doc.timestamp } : {}),
    });
  }
  recordStats('gala_donations', await upsertByLegacyId('gala_donations', rows));
}

// ---------------------------------------------------------------------------

async function main() {
  // volunteerapp-74ebe
  section('Read volunteerapp-74ebe exports');
  const shiftDocs = readNdjson('volunteerapp-74ebe', 'shifts');
  const customDocs = readNdjson('volunteerapp-74ebe', 'custom_shifts');
  if (shiftDocs || customDocs) {
    await importVolunteerShifts(shiftDocs ?? [], customDocs ?? []);
    await importRegistrations(shiftDocs ?? []);
  } else {
    warn('No volunteerapp exports; skipping volunteer shifts entirely.');
  }

  // substracker-c0a34
  section('Read substracker-c0a34 exports');
  const subDocs = readNdjson('substracker-c0a34', 'sub_requests');
  if (subDocs) {
    await importSubRequests(subDocs);
  } else {
    warn('No substracker exports; skipping sub requests.');
  }

  // lspelections
  section('Read lspelections exports');
  const voteDocs = readNdjson('lspelections', 'votes');
  const settingsDocs = readNdjson('lspelections', 'settings');
  if (voteDocs) {
    await importVotes(voteDocs, settingsDocs ?? []);
  } else {
    warn('No elections exports; skipping votes.');
  }

  // galathermometerapp
  section('Read galathermometerapp exports');
  const guestDocs = readNdjson('galathermometerapp', 'gala_guests');
  const donationDocs = readNdjson('galathermometerapp', 'gala_donations');
  if (guestDocs) await importGalaGuests(guestDocs);
  if (donationDocs) await importGalaDonations(donationDocs);
  if (!guestDocs && !donationDocs) warn('No gala exports; skipping gala.');

  // Summary
  section('Import summary');
  const reportPath = path.join(EXPORTS_DIR, 'import-report.json');
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), entities: report }, null, 2));
  for (const [entity, stats] of Object.entries(report)) {
    info(`${entity}: ${JSON.stringify(stats)}`);
  }
  info(`Report written to ${path.relative(process.cwd(), reportPath)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
