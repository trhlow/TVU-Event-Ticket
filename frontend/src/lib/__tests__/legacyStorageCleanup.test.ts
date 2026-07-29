import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_MOCK_STORAGE_KEYS, runLegacyStorageCleanup } from '../legacyStorageCleanup';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    keys: () => [...data.keys()],
  };
}

describe('runLegacyStorageCleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('removes every fixture key left behind on the user machine', () => {
    // C2 deleted the fixture modules from the bundle, but the keys they wrote are
    // already sitting in browsers and a hard reload does not clear localStorage.
    const storage = fakeStorage({
      tvu_event_ticket_events_v1: '[]',
      tvu_event_ticket_reservations_v1: '[]',
      tvu_event_ticket_tickets_v1: '[]',
    });

    runLegacyStorageCleanup(storage);

    expect(storage.keys()).toEqual([]);
  });

  it('leaves unrelated keys untouched', () => {
    const storage = fakeStorage({
      tvu_event_ticket_events_v1: '[]',
      'theme-preference': 'dark',
    });

    runLegacyStorageCleanup(storage);

    expect(storage.keys()).toEqual(['theme-preference']);
  });

  it('is safe to run when nothing is stored', () => {
    const storage = fakeStorage();

    expect(() => runLegacyStorageCleanup(storage)).not.toThrow();
    expect(storage.keys()).toEqual([]);
  });

  it('is idempotent, so running it on every startup is harmless', () => {
    const storage = fakeStorage({ tvu_event_ticket_tickets_v1: '[]' });

    runLegacyStorageCleanup(storage);
    runLegacyStorageCleanup(storage);

    expect(storage.keys()).toEqual([]);
  });

  it('does not throw when storage access is blocked', () => {
    // Safari private mode and some embedded webviews throw on access rather than
    // returning null. Cleanup must never take the whole app down.
    const hostile = {
      getItem: () => {
        throw new DOMException('denied');
      },
      setItem: () => {
        throw new DOMException('denied');
      },
      removeItem: () => {
        throw new DOMException('denied');
      },
    };

    expect(() => runLegacyStorageCleanup(hostile)).not.toThrow();
  });

  it('names exactly the three keys the fixtures used', () => {
    expect(LEGACY_MOCK_STORAGE_KEYS).toEqual([
      'tvu_event_ticket_events_v1',
      'tvu_event_ticket_reservations_v1',
      'tvu_event_ticket_tickets_v1',
    ]);
  });
});
