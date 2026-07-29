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

const ATTENDEE_PAGE = {
  content: [
    {
      ticketId: "t1",
      eventId: "e1",
      studentId: "sv-001",
      studentEmail: "student1@tvu.edu.vn",
      studentMssv: "110120001",
      status: "VALID",
      issuedAt: "2026-07-01T00:00:00Z",
      checkedInAt: null,
    },
  ],
  page: 0,
  size: 100,
  totalElements: 142,
  totalPages: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ticketService.listAttendeesPage", () => {
  it("extracts rows from the paginated envelope, not a bare array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    const result = await ticketService.listAttendeesPage("e1");

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("t1");
  });

  it("surfaces totalElements from the envelope so callers can detect truncation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE)));

    const { ticketService } = await import("../ticketService");
    const result = await ticketService.listAttendeesPage("e1");

    expect(result.totalElements).toBe(142);
  });

  it("requests the given size and a properly encoded keyword param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    await ticketService.listAttendeesPage("e1", { size: 100, keyword: "a b@tvu.edu.vn" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("size")).toBe("100");
    expect(requestedUrl.searchParams.get("keyword")).toBe("a b@tvu.edu.vn");
  });

  it("forwards supported server-side status and sort filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    await ticketService.listAttendeesPage("e1", { status: "CHECKED_IN", sort: "checkedInAt,desc" });

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("status")).toBe("CHECKED_IN");
    expect(requestedUrl.searchParams.get("sort")).toBe("checkedInAt,desc");
  });

  it("omits the keyword param when no keyword is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    await ticketService.listAttendeesPage("e1");

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.has("keyword")).toBe(false);
  });

  it("maps studentEmail and studentMssv through onto the Ticket object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(200, ATTENDEE_PAGE)));

    const { ticketService } = await import("../ticketService");
    const result = await ticketService.listAttendeesPage("e1");

    expect(result.items[0].studentEmail).toBe("student1@tvu.edu.vn");
    expect(result.items[0].studentMssv).toBe("110120001");
  });
});

describe("ticketService.listAttendees", () => {
  it("flattens every page into a single Ticket array", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(200, { ...ATTENDEE_PAGE, page: 0, totalPages: 2 }))
      .mockResolvedValueOnce(
        mockJsonResponse(200, {
          ...ATTENDEE_PAGE,
          content: [{ ...ATTENDEE_PAGE.content[0], ticketId: "t2" }],
          page: 1,
          totalPages: 2,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    const result = await ticketService.listAttendees("e1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.map((ticket) => ticket.id)).toEqual(["t1", "t2"]);
  });
});

describe("ticketService.exportAttendeesCsv", () => {
  it("downloads the full CSV using the same keyword and status filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/csv;charset=UTF-8" }),
      text: async () => "ticketId,studentEmail\n1,a@tvu.edu.vn",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { ticketService } = await import("../ticketService");
    const csv = await ticketService.exportAttendeesCsv("e1", {
      keyword: "a@tvu.edu.vn",
      status: "VALID",
    });

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("keyword")).toBe("a@tvu.edu.vn");
    expect(requestedUrl.searchParams.get("status")).toBe("VALID");
    expect(csv).toContain("studentEmail");
  });
});
