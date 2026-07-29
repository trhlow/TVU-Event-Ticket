import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_SPECIFIER = /(?:^|\/)(?:data\/mock|test\/fixtures)(?:\/|$)/i;
const STATIC_IMPORT = /\bfrom\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;
const LEGACY_STORAGE_KEYS = [
  'tvu_event_ticket_events_v1',
  'tvu_event_ticket_reservations_v1',
  'tvu_event_ticket_tickets_v1',
];
const CLEANUP_MODULE = 'src/lib/legacyStorageCleanup.ts';

// Addresses the product legitimately ships (support contact, organiser form
// placeholder). Anything else found in the bundle is a real user's data.
const EMAIL_ALLOWLIST = ['support@tvu.edu.vn', 'organizer@tvu.edu.vn'];
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Student ids are 8+ digits, and only count as evidence of leaked data when they
// appear as a quoted string literal (serialized data), not a bare numeric literal --
// minified bundles are full of the latter (hex colors, timestamps, MAX_SAFE_INTEGER)
// and a bare-number scan is unusably noisy without fixtures to derive real values from.
const STUDENT_ID = /["']\s*(\d{8,})\s*["']/g;

function walk(directory, predicate) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    if (statSync(absolute).isDirectory()) {
      files.push(...walk(absolute, predicate));
    } else if (predicate(absolute)) {
      files.push(absolute);
    }
  }
  return files;
}

function toPosix(absolute) {
  return path.relative(ROOT, absolute).split(path.sep).join('/');
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(new RegExp(STATIC_IMPORT.source, STATIC_IMPORT.flags)),
    ...source.matchAll(new RegExp(DYNAMIC_IMPORT.source, DYNAMIC_IMPORT.flags)),
  ].map((match) => match[1]);
}

function runtimeSources() {
  const sourceDirectory = path.join(ROOT, 'src');
  return walk(sourceDirectory, (file) => /\.(ts|tsx)$/.test(file)).map((file) => ({
    file: toPosix(file),
    source: readFileSync(file, 'utf8'),
  }));
}

function bundleSources() {
  const assetsDirectory = path.join(ROOT, 'dist/assets');
  if (!existsSync(assetsDirectory)) return null;
  return walk(assetsDirectory, (file) => file.endsWith('.js')).map((file) => ({
    file: toPosix(file),
    name: path.basename(file),
    source: readFileSync(file, 'utf8'),
  }));
}

function report(label, failures) {
  if (failures.length === 0) {
    console.log(`  ok   ${label}`);
    return false;
  }
  console.error(`  FAIL ${label}`);
  for (const failure of failures) console.error(`         ${failure}`);
  return true;
}

function main() {
  const sources = runtimeSources();
  const bundle = bundleSources();
  let failed = false;

  failed = report(
    'no runtime import of fixture or mock data',
    sources.flatMap(({ file, source }) =>
      importSpecifiers(source)
        .filter((specifier) => FIXTURE_SPECIFIER.test(specifier))
        .map((specifier) => `${file} imports ${specifier}`),
    ),
  ) || failed;

  failed = report(
    'no legacy mock storage key outside the cleanup module',
    sources.flatMap(({ file, source }) =>
      file === CLEANUP_MODULE
        ? []
        : LEGACY_STORAGE_KEYS.filter((key) => source.includes(key)).map((key) => `${file} contains ${key}`),
    ),
  ) || failed;

  if (bundle === null) {
    console.error('  FAIL dist/assets not found -- run the production build first');
    failed = true;
  } else {
    failed = report(
      'no mock or fixture chunk in dist/assets',
      bundle.filter(({ name }) => /(mock|fixture)/i.test(name)).map(({ file }) => file),
    ) || failed;

    failed = report(
      'no unexpected email address in dist/assets',
      bundle.flatMap(({ file, source }) =>
        [...new Set(source.match(EMAIL) ?? [])]
          .filter((email) => !EMAIL_ALLOWLIST.includes(email))
          .map((email) => `${file} contains ${email}`),
      ),
    ) || failed;

    failed = report(
      'no student id in dist/assets',
      bundle.flatMap(({ file, source }) => {
        const ids = new Set(
          [...source.matchAll(new RegExp(STUDENT_ID.source, STUDENT_ID.flags))].map((m) => m[1]),
        );
        return [...ids].map((id) => `${file} contains ${id}`);
      }),
    ) || failed;
  }

  if (failed) {
    console.error('\nProduction bundle is NOT clean.');
    process.exit(1);
  }
  console.log('\nProduction bundle is clean.');
}

main();
