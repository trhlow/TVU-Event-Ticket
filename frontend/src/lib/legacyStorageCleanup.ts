/**
 * Removes the localStorage keys the demo fixtures used to write.
 *
 * C2 took the fixture modules out of the bundle, but that only stops new writes. The
 * data those modules already persisted is sitting in users' browsers, and a hard
 * reload does not clear localStorage — only the app can.
 *
 * These three strings are the reason the bundle gate allows fixture storage keys in
 * this one module (phase 1). When the compatibility window closes, delete this file
 * and the exemption in scripts/verify-bundle.mjs together — that is phase 2.
 */
export const LEGACY_MOCK_STORAGE_KEYS = [
  'tvu_event_ticket_events_v1',
  'tvu_event_ticket_reservations_v1',
  'tvu_event_ticket_tickets_v1',
] as const;

interface KeyRemover {
  removeItem(key: string): void;
}

/**
 * Runs on every startup rather than once behind a marker key.
 *
 * A marker would mean writing a new key into every user's browser permanently, to
 * save three removeItem calls per page load. Being idempotent is also self-healing:
 * a stale tab that re-writes a key gets cleaned up on the next load instead of
 * surviving forever because the marker says the job is done.
 */
export function runLegacyStorageCleanup(storage: KeyRemover | undefined = globalThis.localStorage) {
  if (!storage) {
    return;
  }

  for (const key of LEGACY_MOCK_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Safari private mode and some webviews throw on storage access. Failing to
      // clean up stale fixture data must never stop the app from starting.
    }
  }
}
