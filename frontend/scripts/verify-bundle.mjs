#!/usr/bin/env node
/**
 * Proves the production bundle carries no fixture data.
 *
 * The acceptance criterion is evidence, not a flag: `VITE_USE_DEMO_DATA=false` only
 * decided which branch ran, while the fixtures were imported at module top level and
 * shipped to every user regardless. So this checks the artifact and the source tree,
 * not the configuration.
 *
 * "No string that looks like an email" would be too broad -- it catches support
 * addresses and placeholders. The gate is four narrower checks instead.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Keys the fixture layer used to persist demo state in the browser. */
export const MOCK_STORAGE_KEYS = [
  'tvu_event_ticket_events_v1',
  'tvu_event_ticket_reservations_v1',
  'tvu_event_ticket_tickets_v1',
];

/**
 * Phase 1 (this release) allows the keys above in exactly one module: the one-shot
 * cleanup that calls removeItem() on them. Forbidding them outright would make the
 * very release that cleans users' browsers impossible to ship. Phase 2 deletes the
 * module and this exemption together.
 */
export const CLEANUP_MODULE = 'src/lib/legacyStorageCleanup.ts';

/**
 * Addresses the product legitimately ships: the support contact in the footer and the
 * placeholder on the organiser form. They are listed so that a fixture which happens
 * to reuse one of them does not become an unexplained failure -- not as decoration.
 */
export const EMAIL_ALLOWLIST = ['support@tvu.edu.vn', 'organizer@tvu.edu.vn'];

const FIXTURE_SPECIFIER = /data\/mock|test\/fixtures/i;
const STATIC_IMPORT = /\bfrom\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Student ids are 9+ digits. A shorter run is a capacity, a page size, a year.
const STUDENT_ID = /\b\d{8,}\b/g;

function matchAll(source, regex) {
  return [...source.matchAll(new RegExp(regex.source, regex.flags))].map((m) => m[1]);
}

/**
 * Fixture imports reachable from application code. Dynamic imports count: lazy-loading
 * a fixture still emits it into dist/, where anyone can fetch the chunk directly.
 */
export function findRuntimeMockImports(entries) {
  const hits = [];
  for (const { file, source } of entries) {
    for (const specifier of [...matchAll(source, STATIC_IMPORT), ...matchAll(source, DYNAMIC_IMPORT)]) {
      if (FIXTURE_SPECIFIER.test(specifier)) {
        hits.push({ file, specifier });
      }
    }
  }
  return hits;
}

/** Emitted chunks named after a fixture module. */
export function findMockChunks(fileNames) {
  return fileNames.filter((name) => /mock/i.test(name));
}

/**
 * Builds the denylist from the fixture files themselves. A hand-maintained list would
 * silently rot the first time someone edits a fixture.
 */
export function collectFixtureTerms(sources) {
  const terms = new Set();
  for (const source of sources) {
    for (const email of source.match(EMAIL) ?? []) terms.add(email);
    for (const id of source.match(STUDENT_ID) ?? []) terms.add(id);
  }
  return [...terms];
}

export function scanForTerms(entries, terms, allowlist) {
  const denied = terms.filter((term) => !allowlist.includes(term));
  const hits = [];
  for (const { file, content } of entries) {
    for (const term of denied) {
      if (content.includes(term)) hits.push({ file, term });
    }
  }
  return hits;
}

export function findStorageKeyViolations(entries, keys, cleanupModule) {
  const hits = [];
  for (const { file, source } of entries) {
    if (file === cleanupModule) continue;
    for (const key of keys) {
      if (source.includes(key)) hits.push({ file, key });
    }
  }
  return hits;
}

function walk(dir, predicate) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

const toPosix = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');

/** Application sources: everything under src/ that is not itself a test or fixture. */
export function readRuntimeSources() {
  const srcDir = path.join(ROOT, 'src');
  const files = walk(srcDir, (f) => /\.(ts|tsx)$/.test(f));
  return files
    .map((f) => ({ file: toPosix(f), source: readFileSync(f, 'utf8') }))
    .filter(
      ({ file }) =>
        !file.startsWith('src/test/') &&
        !file.includes('/__tests__/') &&
        !/\.test\.(ts|tsx)$/.test(file),
    );
}

function readFixtureSources() {
  const dir = path.join(ROOT, 'src/test/fixtures');
  if (!existsSync(dir)) return [];
  return walk(dir, (f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(f, 'utf8'));
}

function readBundle() {
  const dir = path.join(ROOT, 'dist/assets');
  if (!existsSync(dir)) return null;
  return walk(dir, (f) => f.endsWith('.js')).map((f) => ({
    file: toPosix(f),
    name: path.basename(f),
    content: readFileSync(f, 'utf8'),
  }));
}

function report(title, hits, format) {
  if (hits.length === 0) {
    console.log(`  ok   ${title}`);
    return 0;
  }
  console.error(`  FAIL ${title}`);
  for (const hit of hits) console.error(`         ${format(hit)}`);
  return 1;
}

function main() {
  const sources = readRuntimeSources();
  let failed = 0;

  console.log('Bundle evidence check');
  failed |= report(
    'no runtime import of a fixture module',
    findRuntimeMockImports(sources),
    (h) => `${h.file} imports ${h.specifier}`,
  );
  failed |= report(
    'no mock storage key outside the cleanup module',
    findStorageKeyViolations(sources, MOCK_STORAGE_KEYS, CLEANUP_MODULE),
    (h) => `${h.file} mentions ${h.key}`,
  );

  const bundle = readBundle();
  if (bundle === null) {
    console.error('  FAIL dist/assets not found -- run the production build first');
    failed = 1;
  } else {
    failed |= report('no fixture chunk in dist/assets', findMockChunks(bundle.map((b) => b.name)), (n) => n);

    const terms = collectFixtureTerms(readFixtureSources());
    if (terms.length === 0) {
      // Not a pass: it means the fixtures moved and this gate is now checking nothing.
      console.error('  FAIL no fixture terms derived -- the denylist would be empty');
      failed = 1;
    } else {
      failed |= report(
        `no fixture data in the bundle (${terms.length} terms)`,
        scanForTerms(bundle, terms, EMAIL_ALLOWLIST),
        (h) => `${h.file} contains ${h.term}`,
      );
    }
  }

  if (failed) {
    console.error('\nProduction bundle is NOT clean.');
    process.exit(1);
  }
  console.log('\nProduction bundle is clean.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
