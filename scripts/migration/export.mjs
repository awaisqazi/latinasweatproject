// Export Firestore collections from the four legacy Firebase projects to
// NDJSON files under exports/<projectId>/<collection>.ndjson.
//
// One line per document: {"__id": "...", "__collection": "...", ...data}
// with all Firestore Timestamps deep-converted to ISO-8601 strings.
//
// Idempotent: re-running overwrites the export files with fresh data.

import fs from 'node:fs';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { PROJECTS, keyPath, ndjsonPath, section, info, warn } from './lib.mjs';

const PAGE_SIZE = 500;

// Deep-convert Firestore values to plain JSON: Timestamps -> ISO strings,
// DocumentReferences -> path strings, arrays/objects recursed.
function toPlain(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value.path === 'string' && typeof value.get === 'function') {
    return value.path; // DocumentReference
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

async function exportCollection(db, projectId, collection) {
  const file = ndjsonPath(projectId, collection);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { flags: 'w' });

  let count = 0;
  let lastDoc = null;
  for (;;) {
    let query = db
      .collection(collection)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const line = { __id: doc.id, __collection: collection, ...toPlain(doc.data()) };
      stream.write(`${JSON.stringify(line)}\n`);
      count += 1;
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) break;
  }

  await new Promise((resolve, reject) => {
    stream.end((err) => (err ? reject(err) : resolve()));
  });
  info(`${collection}: ${count} docs -> ${path.relative(process.cwd(), file)}`);
  return count;
}

async function main() {
  let exportedProjects = 0;

  for (const project of PROJECTS) {
    section(`Export ${project.label} (${project.id})`);

    const key = keyPath(project.id);
    if (!fs.existsSync(key)) {
      warn(`No service-account key at keys/${project.id}.json; skipping project.`);
      continue;
    }

    const app = initializeApp(
      { credential: cert(JSON.parse(fs.readFileSync(key, 'utf8'))), projectId: project.id },
      project.id
    );
    const db = getFirestore(app);

    for (const collection of project.collections) {
      await exportCollection(db, project.id, collection);
    }
    exportedProjects += 1;
  }

  section('Export complete');
  info(`${exportedProjects}/${PROJECTS.length} projects exported.`);
  if (exportedProjects < PROJECTS.length) {
    warn('Some projects were skipped (missing keys). import.mjs and verify.mjs will skip them too.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
