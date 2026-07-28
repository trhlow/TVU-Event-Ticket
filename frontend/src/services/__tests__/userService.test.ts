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

describe("userService.listAllRemote — query building", () => {
  it("requests /admin/users with no query string when no filters are given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    await userService.listAllRemote();

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.pathname.endsWith("/admin/users")).toBe(true);
    expect(requestedUrl.search).toBe("");
  });

  it("forwards role and mssvStatus as query params when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    await userService.listAllRemote({ role: "SINH_VIEN", mssvStatus: "UNVERIFIED" });

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.get("role")).toBe("SINH_VIEN");
    expect(requestedUrl.searchParams.get("mssvStatus")).toBe("UNVERIFIED");
  });

  it("omits mssvStatus from the query when only role is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    await userService.listAllRemote({ role: "ORGANIZER" });

    const [url] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url), "http://localhost");
    expect(requestedUrl.searchParams.has("mssvStatus")).toBe(false);
  });
});

describe("userService.listAllRemote — DTO mapping (mapAdminUser)", () => {
  const baseResponse = {
    id: "u1",
    email: "sv1@tvu.edu.vn",
    displayName: "Nguyen Van A",
    role: "SINH_VIEN" as const,
    status: "ACTIVE" as const,
  };

  it("maps clubId/mssv/classCode through when present, and derives profileComplete=true from a non-blank mssv", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, [
          { ...baseResponse, clubId: "club1", mssv: "110120001", classCode: "DA21CNTT", mssvStatus: "VERIFIED" },
        ]),
      ),
    );

    const { userService } = await import("../userService");
    const [user] = await userService.listAllRemote();

    expect(user.clubId).toBe("club1");
    expect(user.mssv).toBe("110120001");
    expect(user.className).toBe("DA21CNTT");
    expect(user.mssvStatus).toBe("VERIFIED");
    expect(user.profileComplete).toBe(true);
  });

  it("maps null clubId/mssv/classCode to undefined and derives profileComplete=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, [{ ...baseResponse, clubId: null, mssv: null, classCode: null, mssvStatus: undefined }]),
      ),
    );

    const { userService } = await import("../userService");
    const [user] = await userService.listAllRemote();

    expect(user.clubId).toBeUndefined();
    expect(user.mssv).toBeUndefined();
    expect(user.className).toBeUndefined();
    expect(user.mssvStatus).toBeUndefined();
    expect(user.profileComplete).toBe(false);
  });

  it("treats a whitespace-only mssv as incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse(200, [{ ...baseResponse, mssv: "   " }])),
    );

    const { userService } = await import("../userService");
    const [user] = await userService.listAllRemote();

    expect(user.profileComplete).toBe(false);
  });
});

describe("userService.listOrganizersRemote — DTO mapping (mapOrganizer)", () => {
  it("maps clubId through and always reports profileComplete=true for organizers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, [
          { id: "o1", email: "clb@tvu.edu.vn", displayName: "CLB CNTT", role: "ORGANIZER", clubId: "club1", status: "ACTIVE" },
        ]),
      ),
    );

    const { userService } = await import("../userService");
    const [organizer] = await userService.listOrganizersRemote();

    expect(organizer.clubId).toBe("club1");
    expect(organizer.profileComplete).toBe(true);
  });

  it("maps a null clubId to undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockJsonResponse(200, [
          { id: "o1", email: "clb@tvu.edu.vn", displayName: "CLB CNTT", role: "ORGANIZER", clubId: null, status: "ACTIVE" },
        ]),
      ),
    );

    const { userService } = await import("../userService");
    const [organizer] = await userService.listOrganizersRemote();

    expect(organizer.clubId).toBeUndefined();
  });
});

describe("userService — write operations", () => {
  it("verifyMssv PATCHes /admin/users/:id/verify-mssv", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    await userService.verifyMssv("u1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/admin/users/u1/verify-mssv");
    expect(init?.method).toBe("PATCH");
  });

  it("createOrganizer POSTs the email/displayName/clubId payload to /admin/organizers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(200, {
        id: "o2",
        email: "new-organizer@tvu.edu.vn",
        displayName: "New Organizer",
        role: "ORGANIZER",
        clubId: "club2",
        status: "ACTIVE",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    const result = await userService.createOrganizer({
      email: "new-organizer@tvu.edu.vn",
      displayName: "New Organizer",
      clubId: "club2",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/admin/organizers");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "new-organizer@tvu.edu.vn",
      displayName: "New Organizer",
      clubId: "club2",
    });
    expect(result.clubId).toBe("club2");
  });

  it("lockOrganizer PATCHes /admin/organizers/:id/lock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(200, {
        id: "o1",
        email: "clb@tvu.edu.vn",
        displayName: "CLB CNTT",
        role: "ORGANIZER",
        clubId: "club1",
        status: "LOCKED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    const result = await userService.lockOrganizer("o1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/admin/organizers/o1/lock");
    expect(init?.method).toBe("PATCH");
    expect(result.status).toBe("LOCKED");
  });

  it("deleteOrganizer DELETEs /admin/organizers/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, headers: new Headers() } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { userService } = await import("../userService");
    await userService.deleteOrganizer("o1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/admin/organizers/o1");
    expect(init?.method).toBe("DELETE");
  });
});
