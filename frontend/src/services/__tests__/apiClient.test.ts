import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "../apiClient";

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

describe("apiRequest", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("always sends credentials: include", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/events");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("attaches X-XSRF-TOKEN on mutating requests when the cookie is present", async () => {
    document.cookie = "XSRF-TOKEN=signed-token-value";
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/reservations", { method: "POST", body: JSON.stringify({ eventId: "e1" }) });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("X-XSRF-TOKEN")).toBe("signed-token-value");
  });

  it("does not attach X-XSRF-TOKEN on GET requests", async () => {
    document.cookie = "XSRF-TOKEN=signed-token-value";
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/events");

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.has("X-XSRF-TOKEN")).toBe(false);
  });

  it("maps a network failure to ApiError with status 0, not a silent success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(apiRequest("/events")).rejects.toMatchObject({ status: 0 });
    await expect(apiRequest("/events")).rejects.toBeInstanceOf(ApiError);
  });

  it("maps HTTP 401 to an ApiError with status 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(401, { message: "Unauthorized" })));

    await expect(apiRequest("/auth/me")).rejects.toMatchObject({ status: 401 });
  });

  it("maps HTTP 409 to an ApiError with status 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(409, { message: "duplicate" })));

    await expect(apiRequest("/reservations", { method: "POST" })).rejects.toMatchObject({ status: 409 });
  });

  it("deduplicates concurrent remembered-device refresh requests", async () => {
    let refreshCount = 0;
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const url = String(input);
      if (url.includes("/auth/session/refresh")) {
        refreshCount += 1;
        await Promise.resolve();
        return mockJsonResponse(200, {});
      }
      const count = attempts.get(url) ?? 0;
      attempts.set(url, count + 1);
      return count === 0
        ? mockJsonResponse(401, { message: "Unauthorized" })
        : mockJsonResponse(200, { data: { ok: true } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([apiRequest("/admin/stats"), apiRequest("/events/stats")]);

    expect(refreshCount).toBe(1);
    expect(attempts.get("http://localhost:8080/api/admin/stats")).toBe(2);
    expect(attempts.get("http://localhost:8080/api/events/stats")).toBe(2);
  });
});
