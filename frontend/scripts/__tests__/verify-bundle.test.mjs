import { describe, expect, it } from 'vitest';
import {
  collectFixtureTerms,
  findMockChunks,
  findRuntimeMockImports,
  findStorageKeyViolations,
  scanForTerms,
} from '../verify-bundle.mjs';
import { readRuntimeSources } from '../verify-bundle.mjs';

describe('findRuntimeMockImports', () => {
  it('flags an import of a fixture module from a runtime file', () => {
    const hits = findRuntimeMockImports([
      { file: 'src/services/clubService.ts', source: 'import { mockClubs } from "../data/mockClubs";' },
    ]);

    expect(hits).toEqual([
      { file: 'src/services/clubService.ts', specifier: '../data/mockClubs' },
    ]);
  });

  it('accepts a runtime file with no fixture import', () => {
    expect(
      findRuntimeMockImports([
        { file: 'src/services/clubService.ts', source: 'import { apiRequest } from "./apiClient";' },
      ]),
    ).toEqual([]);
  });

  it('catches a dynamic import too, not only static ones', () => {
    // Lazy-loading fixtures still ships them in dist/, so it is not a way out.
    const hits = findRuntimeMockImports([
      { file: 'src/services/clubService.ts', source: 'const m = await import("../data/mockClubs");' },
    ]);

    expect(hits).toHaveLength(1);
  });
});

describe('findMockChunks', () => {
  it('flags emitted chunks whose name mentions a fixture module', () => {
    expect(findMockChunks(['index-a1b2.js', 'mockClubs-CKIiTdil.js'])).toEqual(['mockClubs-CKIiTdil.js']);
  });

  it('accepts a bundle with no fixture chunk', () => {
    expect(findMockChunks(['index-a1b2.js', 'vendor-c3d4.js'])).toEqual([]);
  });
});

describe('collectFixtureTerms', () => {
  it('derives the denylist from the fixture sources instead of hardcoding it', () => {
    // Hardcoding would rot the moment someone edits a fixture; deriving keeps the
    // gate honest without anyone remembering to update it.
    const terms = collectFixtureTerms([
      'export const mockUsers = [{ email: "an.nguyen.student@tvu.edu.vn", mssv: "110120001" }];',
    ]);

    expect(terms).toContain('an.nguyen.student@tvu.edu.vn');
    expect(terms).toContain('110120001');
  });

  it('ignores short digit runs that are not student ids', () => {
    const terms = collectFixtureTerms(['export const x = { capacity: 100, page: 2 };']);

    expect(terms).toEqual([]);
  });
});

describe('scanForTerms', () => {
  it('reports a fixture email that reached the bundle', () => {
    const hits = scanForTerms(
      [{ file: 'dist/assets/userService-x.js', content: 'const a="an.nguyen.student@tvu.edu.vn"' }],
      ['an.nguyen.student@tvu.edu.vn'],
      [],
    );

    expect(hits).toEqual([
      { file: 'dist/assets/userService-x.js', term: 'an.nguyen.student@tvu.edu.vn' },
    ]);
  });

  it('lets an allowlisted address through', () => {
    const hits = scanForTerms(
      [{ file: 'dist/assets/index-x.js', content: 'mailto:hotro@tvu.edu.vn' }],
      ['hotro@tvu.edu.vn'],
      ['hotro@tvu.edu.vn'],
    );

    expect(hits).toEqual([]);
  });
});

describe('findStorageKeyViolations', () => {
  const keys = ['tvu_event_ticket_events_v1'];

  it('rejects a mock storage key outside the cleanup module', () => {
    const hits = findStorageKeyViolations(
      [{ file: 'src/services/eventService.ts', source: 'const K = "tvu_event_ticket_events_v1";' }],
      keys,
      'src/lib/legacyStorageCleanup.ts',
    );

    expect(hits).toEqual([
      { file: 'src/services/eventService.ts', key: 'tvu_event_ticket_events_v1' },
    ]);
  });

  it('allows the key inside the cleanup module, which must name it to remove it', () => {
    // C3 ships a one-shot cleanup that calls removeItem() on exactly these keys,
    // so phase 1 has to permit them there or the cleanup release can never pass.
    const hits = findStorageKeyViolations(
      [{ file: 'src/lib/legacyStorageCleanup.ts', source: 'localStorage.removeItem("tvu_event_ticket_events_v1");' }],
      keys,
      'src/lib/legacyStorageCleanup.ts',
    );

    expect(hits).toEqual([]);
  });
});

describe('the real source tree', () => {
  it('has no runtime import of a fixture module', () => {
    const hits = findRuntimeMockImports(readRuntimeSources());

    expect(hits).toEqual([]);
  });
});
