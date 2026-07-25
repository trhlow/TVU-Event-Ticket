import { afterEach, describe, expect, it, vi } from "vitest";

function mockJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    clone() {
      return this;
    },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("statisticsService.adminStats", () => {
  it("calls GET /admin/stats and returns the envelope as-is", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(200, { totalClubs: 3, totalUsers: 40, usersByRole: { SINH_VIEN: 38, ORGANIZER: 2 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.adminStats();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/admin/stats");
    expect(result.totalClubs).toBe(3);
    expect(result.usersByRole.SINH_VIEN).toBe(38);
  });

  it("tolerates a partial usersByRole record (not every role need be present)", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(200, { totalClubs: 0, totalUsers: 0, usersByRole: {} })));

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.adminStats();

    expect(result.usersByRole.SUPER_ADMIN).toBeUndefined();
  });
});

describe("statisticsService.eventStats", () => {
  it("calls GET /events/stats and passes eventsByStatus through untouched", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(200, { totalEvents: 5, eventsByStatus: { DRAFT: 1, OPEN: 3, CLOSED: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.eventStats();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/events/stats");
    expect(result.eventsByStatus).toEqual({ DRAFT: 1, OPEN: 3, CLOSED: 1 });
  });
});

describe("statisticsService.ticketStats", () => {
  it("calls GET /ticketing/stats and preserves a null checkInRate (no tickets issued yet)", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(200, { ticketsIssued: 0, checkedIn: 0, checkInRate: null }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.ticketStats();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/ticketing/stats");
    expect(result.checkInRate).toBeNull();
  });

  it("passes through a numeric checkInRate unchanged", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse(200, { ticketsIssued: 10, checkedIn: 7, checkInRate: 0.7 })),
    );

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.ticketStats();

    expect(result.checkInRate).toBe(0.7);
  });
});

describe("statisticsService.overview", () => {
  it("fans out to all three stat endpoints and combines them under admin/events/tickets keys", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/admin/stats")) {
        return mockJsonResponse(200, { totalClubs: 1, totalUsers: 2, usersByRole: {} });
      }
      if (url.includes("/events/stats")) {
        return mockJsonResponse(200, { totalEvents: 3, eventsByStatus: {} });
      }
      return mockJsonResponse(200, { ticketsIssued: 4, checkedIn: 1, checkInRate: 0.25 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { statisticsService } = await import("../statisticsService");
    const result = await statisticsService.overview();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      admin: { totalClubs: 1, totalUsers: 2, usersByRole: {} },
      events: { totalEvents: 3, eventsByStatus: {} },
      tickets: { ticketsIssued: 4, checkedIn: 1, checkInRate: 0.25 },
    });
  });

  it("rejects if any one of the three underlying calls fails", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/events/stats")) {
        return mockJsonResponse(500, { message: "Internal error" });
      }
      return mockJsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { statisticsService } = await import("../statisticsService");
    await expect(statisticsService.overview()).rejects.toThrow();
  });
});
