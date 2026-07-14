import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("eventService — no silent mock fallback", () => {
  it("rejects instead of returning fixture data when the real API call fails and demo mode is off", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubEnv("VITE_ENABLE_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    const { eventService } = await import("../eventService");
    await expect(eventService.getPublicEvents()).rejects.toThrow();
  });

  it("returns fixture data without calling fetch when VITE_USE_DEMO_DATA=true", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { eventService } = await import("../eventService");
    const events = await eventService.getPublicEvents();

    expect(Array.isArray(events)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
