import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("eventService — no silent mock fallback", () => {
  it("rejects instead of returning fixture data when the real API call fails and demo mode is off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    const { eventService } = await import("../eventService");
    await expect(eventService.getPublicEvents()).rejects.toThrow();
  });

});
