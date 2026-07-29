import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "../authService";
import { getCurrentUser, isAuthenticated, setCurrentUser } from "../../state/authSession";
import { User } from "../../types/user";

const student: User = { id: "u1", fullName: "Sinh vien A", email: "a@tvu.edu.vn", role: "SINH_VIEN", profileComplete: true, status: "ACTIVE" };

afterEach(() => {
  vi.unstubAllGlobals();
  setCurrentUser(null);
});

describe("authService.logout", () => {
  it("clears the cached session so the next protected-route check requires login again", async () => {
    setCurrentUser(student);
    expect(isAuthenticated()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: async () => ({}),
        clone() {
          return this;
        },
      }),
    );

    await authService.logout();

    expect(isAuthenticated()).toBe(false);
    expect(getCurrentUser()).toBeNull();
  });

  it("still clears the session even if the backend logout call fails", async () => {
    setCurrentUser(student);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    await expect(authService.logout()).rejects.toThrow();
    expect(isAuthenticated()).toBe(false);
  });
});

describe("authService.requestOtp", () => {
  it("posts the address to the request endpoint and resolves regardless of the account", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers(),
      text: async () => "",
      json: async () => ({}),
      clone() {
        return this;
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authService.requestOtp("admin@tvu.edu.vn")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/otp/request");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("verifies a code with rememberDevice and refreshes the authenticated profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ profile: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "admin-1",
          email: "admin@tvu.edu.vn",
          displayName: "Admin",
          role: "SUPER_ADMIN",
          profileComplete: true,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = await authService.verifyOtp(" admin@tvu.edu.vn ", "123456", true);

    expect(user.role).toBe("SUPER_ADMIN");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/otp/verify");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: "admin@tvu.edu.vn",
      code: "123456",
      rememberDevice: true,
    });
  });
});
