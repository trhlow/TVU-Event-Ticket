import { describe, expect, it } from "vitest";

import { popupRedirectUri } from "../authService";

/**
 * The sign-in popup must land on the dedicated MSAL redirect-bridge page, not on the application root.
 *
 * Pointing it at the root loaded the whole React app inside the popup, and that app does not
 * run the MSAL 5 redirect bridge, so the popup could not broadcast the authorization response back
 * to the tab that opened it. Sign-in died with MSAL's `timed_out` while the popup sat on the home
 * page with the code still in its address bar.
 *
 * Nothing else can catch a regression here: it only shows up against a real Entra tenant in a real
 * popup, which no test in this repository can run.
 */
describe("popupRedirectUri", () => {
  it("sends the popup to the redirect-bridge page beside the application root", () => {
    expect(popupRedirectUri("https://evts.id.vn")).toBe("https://evts.id.vn/auth-redirect.html");
  });

  it("does not depend on whether the configured root carries a trailing slash", () => {
    expect(popupRedirectUri("https://evts.id.vn/")).toBe("https://evts.id.vn/auth-redirect.html");
  });

  it("never returns the application root itself, which is the failure being prevented", () => {
    for (const configured of ["https://evts.id.vn", "https://evts.id.vn/", "http://localhost:5173"]) {
      const resolved = popupRedirectUri(configured);
      expect(resolved).not.toBe(configured);
      expect(resolved.endsWith("/auth-redirect.html")).toBe(true);
    }
  });

  it("keeps the popup on the same origin, so MSAL can still read the fragment it lands with", () => {
    expect(new URL(popupRedirectUri("https://evts.id.vn")).origin).toBe("https://evts.id.vn");
  });
});
