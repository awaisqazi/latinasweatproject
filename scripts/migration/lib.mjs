// Shared helpers for the Firebase -> Supabase data migration scripts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATION_DIR = path.dirname(fileURLToPath(import.meta.url));
export const KEYS_DIR = path.join(MIGRATION_DIR, 'keys');
export const EXPORTS_DIR = path.join(MIGRATION_DIR, 'exports');

export const ZONE = 'America/Chicago';

// Legacy recurring shift doc ids look like 2025-03-14_0600-0700.
export const RECURRING_SHIFT_ID_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{4}$/;

// Source Firestore projects and the collections we migrate from each.
// (volunteerapp's monthly_availability is derived data and intentionally skipped.)
export const PROJECTS = [
  { id: 'volunteerapp-74ebe', label: 'Volunteer app', collections: ['shifts', 'custom_shifts'] },
  { id: 'substracker-c0a34', label: 'Sub tracker', collections: ['sub_requests'] },
  { id: 'lspelections', label: 'Elections', collections: ['votes', 'settings'] },
  { id: 'galathermometerapp', label: 'Gala thermometer', collections: ['gala_guests', 'gala_donations'] },
];

export function keyPath(projectId) {
  return path.join(KEYS_DIR, `${projectId}.json`);
}

export function ndjsonPath(projectId, collection) {
  return path.join(EXPORTS_DIR, projectId, `${collection}.ndjson`);
}

export function section(title) {
  console.log('');
  console.log(`=== ${title} ${'='.repeat(Math.max(3, 60 - title.length))}`);
}

export function warn(message) {
  console.warn(`  [warn] ${message}`);
}

export function info(message) {
  console.log(`  ${message}`);
}

// Reads an NDJSON export. Returns null (with a warning) if the file is
// missing, so partial exports degrade gracefully downstream.
export function readNdjson(projectId, collection) {
  const file = ndjsonPath(projectId, collection);
  if (!fs.existsSync(file)) {
    warn(`Missing export ${path.relative(MIGRATION_DIR, file)}; skipping.`);
    return null;
  }
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Lowercased, trimmed email, or null when the value would fail the
// database check constraint.
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function requireSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
  }
  return { url, key };
}
