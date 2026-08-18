import { describe, expect, it } from "vitest";

// Regression guard for the API surface the frontend actually calls. Each service source file is
// scanned for `apiRequest(...)` call sites; the endpoint literal is normalized (template
// interpolations -> `:param`, query strings dropped) and paired with its HTTP method (GET when
// `{ method: "..." }` is absent, matching apiRequest's own default). If this list changes, it's
// because an endpoint was added, removed, or renamed — update BACKEND_STATUS_FOR_FRONTEND.md
// alongside the snapshot rather than blindly accepting the diff.
//
// Reads raw source text via Vite's import.meta.glob (not node:fs) so this stays a normal
// browser-scoped module — no Node types needed in the app's tsconfig.
const serviceSources = import.meta.glob("../*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function extractEndpoints(source: string): string[] {
  const endpoints: string[] = [];
  const callRegex = /apiRequest(?:<[\s\S]*?>)?\(\s*(`[^`]*`|"[^"]*")/g;
  let match: RegExpExecArray | null;

  while ((match = callRegex.exec(source))) {
    const rawLiteral = match[1].slice(1, -1);
    const normalizedPath = rawLiteral
      .split("?")[0]
      .replace(/\$\{[^}]*\}/g, ":param");

    const windowEnd = source.indexOf(")", match.index);
    const tailStart = match.index + match[0].length;
    const window = source.slice(tailStart, windowEnd === -1 ? tailStart + 200 : Math.min(windowEnd + 40, tailStart + 200));
    const methodMatch = window.match(/method:\s*"([A-Z]+)"/);
    const method = methodMatch ? methodMatch[1] : "GET";

    endpoints.push(`${method} ${normalizedPath}`);
  }

  return endpoints;
}

function allServiceEndpoints(): string[] {
  const sources = Object.entries(serviceSources)
    .filter(([file]) => !file.endsWith(".test.ts") && !file.endsWith("apiClient.ts") && !file.endsWith("index.ts"))
    .map(([, source]) => source);

  const endpoints = sources.flatMap(extractEndpoints);
  return Array.from(new Set(endpoints)).sort();
}

describe("frontend API surface", () => {
  it("matches the known list of backend endpoints the frontend calls", () => {
    expect(allServiceEndpoints()).toEqual([
      "DELETE /admin/clubs/:param",
      "DELETE /admin/organizers/:param",
      "DELETE /events/:param",
      "GET /admin/audit-log",
      "GET /admin/clubs",
      "GET /admin/clubs/:param/stats",
      "GET /admin/clubs/stats",
      "GET /admin/events",
      "GET /admin/organizers",
      "GET /admin/stats",
      "GET /admin/users:param",
      "GET /auth/me",
      "GET /events",
      "GET /events/:param",
      "GET /events/mine",
      "GET /events/stats",
      "GET /reservations/me",
      "GET /reservations/pending",
      "GET /ticketing/dashboard/club",
      "GET /ticketing/events/:param/attendees",
      "GET /ticketing/events/:param/attendees.csv:param",
      "GET /ticketing/events/:param/availability",
      "GET /ticketing/events/:param/dashboard",
      "GET /ticketing/events/availability",
      "GET /ticketing/stats",
      // The QR fallback. Note it sits under /tickets, not /ticketing: SecurityConfig claims all of
      // /api/tickets/** for ORGANIZER, so this route needs its own SINH_VIEN rule ahead of that one.
      "GET /tickets/:param/qr",
      "PATCH /admin/clubs/:param",
      "PATCH /admin/clubs/:param/activate",
      "PATCH /admin/organizers/:param/lock",
      "PATCH /admin/users/:param/verify-mssv",
      "PATCH /auth/me",
      "PATCH /auth/me/profile",
      "PATCH /events/:param/status",
      "POST /admin/clubs",
      "POST /admin/organizers",
      "POST /auth/login",
      "POST /auth/logout",
      "POST /auth/otp/request",
      "POST /auth/otp/verify",
      "POST /auth/session/refresh",
      "POST /events",
      "POST /reservations",
      "POST /reservations/:param/approve",
      "POST /reservations/:param/reject",
      "POST /ticketing/check-in",
      "PUT /events/:param",
    ]);
  });
});
