import { afterEach, describe, expect, it, vi } from "vitest";

function mockJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("dashboardService", () => {
  it("loads the organizer club dashboard from the current backend route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        clubId: "club-1",
        pending: 2,
        approved: 8,
        checkedIn: 5,
        checkInRate: 0.625,
        registrationsByDay: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { dashboardService } = await import("../dashboardService");
    const result = await dashboardService.clubDashboard();

    expect(result.checkedIn).toBe(5);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticketing/dashboard/club");
  });

  it("loads an event dashboard using the event id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        eventId: "event-1",
        clubId: "club-1",
        totalCapacity: 100,
        remaining: 25,
        approved: 75,
        checkedIn: 50,
        checkInRate: 2 / 3,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { dashboardService } = await import("../dashboardService");
    const result = await dashboardService.eventDashboard("event-1");

    expect(result.remaining).toBe(25);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ticketing/events/event-1/dashboard");
  });
});
