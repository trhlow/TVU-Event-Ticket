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

const LOG_PAGE = {
  content: [
    {
      id: "log1",
      actorId: "u1",
      actorEmail: "organizer.cntt@tvu.edu.vn",
      action: "STATUS_CHANGED",
      targetType: "EVENT",
      targetId: "e1",
      detail: "OPEN",
      createdAt: "2026-07-21T21:30:00Z",
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("auditLogService.listRemote — query building", () => {
  it("defaults to page=0, size=20, sort=createdAt,desc with no filters set", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, LOG_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { auditLogService } = await import("../auditLogService");
    await auditLogService.listRemote();

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("page")).toBe("0");
    expect(requestedUrl.searchParams.get("size")).toBe("20");
    expect(requestedUrl.searchParams.get("sort")).toBe("createdAt,desc");
    expect(requestedUrl.searchParams.has("actorId")).toBe(false);
    expect(requestedUrl.searchParams.has("action")).toBe(false);
    expect(requestedUrl.searchParams.has("from")).toBe(false);
    expect(requestedUrl.searchParams.has("to")).toBe(false);
  });

  it("forwards page/size/sort overrides and all four filters when given", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, LOG_PAGE));
    vi.stubGlobal("fetch", fetchMock);

    const { auditLogService } = await import("../auditLogService");
    await auditLogService.listRemote({
      actorId: "u1",
      action: "auth.club.create",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T00:00:00.000Z",
      page: 2,
      size: 50,
      sort: "createdAt,asc",
    });

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("page")).toBe("2");
    expect(requestedUrl.searchParams.get("size")).toBe("50");
    expect(requestedUrl.searchParams.get("sort")).toBe("createdAt,asc");
    expect(requestedUrl.searchParams.get("actorId")).toBe("u1");
    expect(requestedUrl.searchParams.get("action")).toBe("auth.club.create");
    expect(requestedUrl.searchParams.get("from")).toBe("2026-07-01T00:00:00.000Z");
    expect(requestedUrl.searchParams.get("to")).toBe("2026-07-31T00:00:00.000Z");
  });

  it("surfaces the envelope's pagination fields on the returned page", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse(200, { ...LOG_PAGE, page: 1, totalElements: 42, totalPages: 3 })),
    );

    const { auditLogService } = await import("../auditLogService");
    const result = await auditLogService.listRemote({ page: 1 });

    expect(result.page).toBe(1);
    expect(result.totalElements).toBe(42);
    expect(result.totalPages).toBe(3);
  });
});

describe("auditLogService.listRemote — DTO mapping", () => {
  it("maps actorEmail/detail through when present, and builds target as type:id", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(200, LOG_PAGE)));

    const { auditLogService } = await import("../auditLogService");
    const result = await auditLogService.listRemote();

    expect(result.items[0]).toMatchObject({
      id: "log1",
      actorName: "organizer.cntt@tvu.edu.vn",
      userName: "organizer.cntt@tvu.edu.vn",
      action: "STATUS_CHANGED",
      target: "EVENT:e1",
      result: "OPEN",
    });
  });

  it("falls back actorName/userName to actorId when actorEmail is null", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, {
          ...LOG_PAGE,
          content: [{ ...LOG_PAGE.content[0], actorEmail: null }],
        }),
      ),
    );

    const { auditLogService } = await import("../auditLogService");
    const result = await auditLogService.listRemote();

    expect(result.items[0].actorName).toBe("u1");
    expect(result.items[0].userName).toBe("u1");
  });

  it("falls back result to an empty string when detail is null", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, {
          ...LOG_PAGE,
          content: [{ ...LOG_PAGE.content[0], detail: null }],
        }),
      ),
    );

    const { auditLogService } = await import("../auditLogService");
    const result = await auditLogService.listRemote();

    expect(result.items[0].result).toBe("");
  });
});

describe("auditLogService.listRemote — demo mode", () => {
  it("paginates the local fixture instead of calling fetch when VITE_USE_DEMO_DATA=true", async () => {
    vi.stubEnv("VITE_USE_DEMO_DATA", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { auditLogService } = await import("../auditLogService");
    const result = await auditLogService.listRemote({ page: 0, size: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.items.length).toBeLessThanOrEqual(1);
    expect(result.size).toBe(1);
  });
});
