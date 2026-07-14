# Backend security & API requirements blocked on the backend team

This document lists every gap found during the frontend hardening pass (2026-07) that **cannot
be fixed from `frontend/`, `.github/`, or documentation alone** because the underlying capability
does not exist in `backend/`. Per the scope of that pass, no file under `backend/` was created,
edited, deleted, renamed, or reformatted — this document is the substitute for those changes.

Each item states the problem, the risk, the endpoint/module involved, the API contract the
frontend already expects (or would need), acceptance criteria for the fix, priority, and status.
None of the JSON contracts below are implemented anywhere — they are proposals for the backend
team, not endpoints the frontend calls today.

Status legend: all items are **Blocked by backend** unless noted otherwise.

---

## 1. Organizer accounts have no credential of their own

**Problem.** `backend/auth-service`'s `User` entity has no password/credential field. Organizer
accounts created via `POST /admin/organizers` authenticate through the exact same
`IdentityProvider` used for students (dev stub or Microsoft OIDC), so "logging in as an
organizer" only ever means "presenting an identity that matches the organizer's stored email" —
there is no secret an admin actually hands the organizer.

**Risk.** Anyone who knows an organizer's email can authenticate as that organizer (dev profile:
zero verification; prod profile: any Microsoft account with a matching email address). This
directly contradicts the business requirement that club accounts log in with a school-issued
username/password.

**Module.** `backend/auth-service` — `domain/User.java`, `service/AdminManagementService.java`,
`identity/DevStubIdentityProvider.java`, `identity/MicrosoftIdentityProvider.java`.

**API contract the frontend expects once fixed** (one of the two shapes below — pick one):

```json
// Option A: temporary password, forced change on first login
{
  "email": "club@tvu.edu.vn",
  "displayName": "Câu lạc bộ Tin học",
  "clubId": "uuid",
  "initialPassword": "temporary-secret",
  "mustChangePassword": true
}
```

```json
// Option B: invite/activation token sent by email, organizer sets their own password
{
  "email": "club@tvu.edu.vn",
  "displayName": "Câu lạc bộ Tin học",
  "clubId": "uuid",
  "sendActivationInvite": true
}
```

**Acceptance criteria.**
- `POST /admin/organizers` returns either a one-time temporary credential or triggers an
  activation email with a single-use, expiring token.
- A new endpoint exists for the organizer to set/change their password (e.g.
  `POST /auth/activate` or `POST /auth/me/password`).
- Organizer login no longer succeeds solely by presenting an email string with no secret.

**Priority.** Critical.
**Frontend today.** `SuperAdminOrganizersPage` calls `userService.createOrganizer()` (which maps
1:1 to the current `CreateOrganizerRequest { email, displayName, clubId }`) but the create form
is disabled in the UI (`supportsSecureOrganizerProvisioning = false`) with an explanatory banner,
so the frontend never claims an account was provisioned securely. See
[FRONTEND_IMPLEMENTATION_STATUS.md](FRONTEND_IMPLEMENTATION_STATUS.md).

---

## 2. Super Admin bootstrap is not environment-gated

**Problem.** `BootstrapSuperAdminRunner` has no `@Profile` restriction and runs in every profile
including `prod`. `AuthApplicationService.isBootstrapAdmin()` is also re-evaluated on **every**
login, not just once at startup, so any account whose email matches `BOOTSTRAP_ADMIN_EMAIL` is
auto-promoted to `SUPER_ADMIN` the next time it logs in — not only the first time the row is
created.

**Risk.** If `BOOTSTRAP_ADMIN_EMAIL` is ever left at its dev default (`admin@example.com`) or is
otherwise guessable/reachable in a real environment, whoever controls that identity (a dev-stub
string in a misconfigured deploy, or a matching Microsoft account in prod) becomes `SUPER_ADMIN`
with no password check at all.

**Module.** `backend/auth-service` — `config/BootstrapSuperAdminRunner.java`,
`config/BootstrapAdminProperties.java`, `service/AuthApplicationService.java`.

**Acceptance criteria.**
- `BootstrapSuperAdminRunner` only runs in a non-production profile, or requires an explicit
  one-time confirmation step outside normal login.
- `isBootstrapAdmin()` promotion happens at most once per configured email, not on every login.
- No shipped default value for `BOOTSTRAP_ADMIN_EMAIL`.

**Priority.** Critical.
**Frontend today.** Cannot mitigate — this is entirely a backend startup/login code path with no
frontend-observable surface to gate.

---

## 3. Backend defaults to the `dev` Spring profile

**Problem.** `SPRING_PROFILES_ACTIVE` defaults to `dev` in both `auth-service` and `api-gateway`
when the environment variable is not explicitly exported. There is no fail-fast check that
refuses to start a `dev`-profiled instance on a non-localhost network.

**Risk.** Combined with items 1 and 2, a deploy that forgets to set
`SPRING_PROFILES_ACTIVE=prod` silently ships the zero-verification dev identity stub, an
insecure CSRF secret default, and non-`Secure` cookies to a real network.

**Module.** `backend/auth-service/src/main/resources/application.yml`,
`backend/api-gateway/src/main/resources/application.yml`.

**Acceptance criteria.** Either remove the `dev` default (require the profile to be set
explicitly) or add a startup check that refuses to boot the `dev` profile unless an explicit
"I am local" signal is present.

**Priority.** Critical.
**Frontend today.** `frontend/src/lib/env.ts` independently blocks the *frontend* from running
with `VITE_AUTH_PROVIDER=devstub` in a production build, but this cannot detect or prevent the
backend itself from booting in `dev` profile — that's a backend-only fix.

---

## 4. Microsoft OIDC accepts any tenant, not just TVU

**Problem.** `MicrosoftIdentityProvider` verifies tokens against the multi-tenant `common` JWKS
endpoint and checks only that the token's issuer matches *some* `tid`, not a pinned TVU tenant
ID. There is no `@tvu.edu.vn` domain allowlist anywhere in the login path.

**Risk.** Any Microsoft account holder — not just TVU students — can register as `SINH_VIEN`.
This is a deviation from the business requirement that only `@tvu.edu.vn` accounts may register.

**Module.** `backend/auth-service` — `identity/MicrosoftIdentityProvider.java`.

**Acceptance criteria.** Either pin the accepted tenant ID to TVU's Entra ID tenant, or add an
explicit email-domain allowlist check, and document which approach was chosen and why.

**Priority.** High (confirm with the project owner whether this is acceptable before treating it
as blocking — see `backend/.claude/rules/architecture.md` which currently documents this as an
intentional decision).
**Frontend today.** No frontend mitigation is possible; tenant/domain restriction must happen
server-side against the signed token.

---

## 5. Auth-service CSRF secret silently falls back to a known dev value

**Problem.** `CsrfProperties` in `auth-service` falls back to the hardcoded string
`dev-csrf-signing-secret-change-me` whenever the configured secret is blank, **regardless of
active profile**. The equivalent gateway-side property (`GatewayCsrfProperties`) throws instead
of silently falling back.

**Risk.** A production deployment with an empty `CSRF_SIGNING_SECRET` env var starts up
successfully using a publicly-known default secret instead of refusing to start, which would
allow CSRF token forgery.

**Module.** `backend/auth-service` — `security/CsrfProperties.java`.

**Acceptance criteria.** `CsrfProperties` throws (like `GatewayCsrfProperties` already does)
instead of substituting a default when the configured secret is blank.

**Priority.** High.
**Frontend today.** No mitigation possible; the frontend only ever reads the `XSRF-TOKEN` cookie
and echoes it back in `X-XSRF-TOKEN` — it has no visibility into which secret signed it.

---

## 6. `POST /admin/organizers` has no password/invite fields

Same underlying gap as item 1, stated as a narrow API-contract note: `CreateOrganizerRequest`
today is `{ email, displayName, clubId }` only. See item 1 for the full writeup and proposed
contracts.

**Priority.** Critical (tracked jointly with item 1).

---

## 7. `POST /admin/organizers/{id}/reset` does not reset a password

**Problem.** This endpoint's real behavior is `resetExternalSubject()` — it clears the stored
`extSubject` placeholder so the *next* login re-binds the account's external identity. It does
not, and structurally cannot, reset a password, because none exists (item 1).

**Risk.** The endpoint name/semantics ("reset") is easy to misread as "password reset" by anyone
integrating against it, which could lead to a false sense of security if a frontend ever labeled
this button "Đặt lại mật khẩu."

**Module.** `backend/auth-service` — `controller/AdminController.java#resetOrganizer`,
`service/AdminManagementService.java#resetOrganizer`.

**Acceptance criteria.** Once item 1 is implemented, this endpoint (or a new one) should also
support actually rotating the organizer's credential/temporary password, and the two concepts
(identity rebind vs. credential reset) should be exposed as distinct, clearly named operations.

**Priority.** Medium (depends on item 1).
**Frontend today.** `SuperAdminOrganizersPage` only exposes "Khóa tài khoản" (lock); it does not
expose a "reset" button labeled as a password reset, to avoid promising a capability that does
not exist.

---

## 8. CSV injection in attendee export

**Problem.** `TicketingService.csv()` in `ticket-service` quotes and escapes embedded quotes in
CSV cell values but does not neutralize a leading `=`, `+`, `-`, or `@` character. Cell values
include `studentEmail`/`studentMssv`, which originate from student-controlled profile fields.

**Risk.** A student could set a profile value like `=1+1` or `@SUM(...)`; when an organizer opens
the exported CSV in Excel/LibreOffice, a leading trigger character can still be interpreted as a
formula even inside a quoted field — classic CSV/formula injection.

**Module.** `backend/ticket-service` — `service/TicketingService.java` (`csv()` helper),
endpoint `GET /ticketing/events/{eventId}/attendees.csv`.

**Acceptance criteria.** Prefix any cell value starting with `=`, `+`, `-`, or `@` with a `'`
(or an equivalent neutralizing escape) before writing it to the CSV.

**Priority.** High.
**Frontend today.** The frontend only links to the existing `.csv` endpoint
(`AttendeesPage.tsx`) and does not post-process the response — it cannot sanitize a file
generated and streamed entirely by the backend.

---

## 9. Backend container image runs as root

**Problem.** `backend/Dockerfile`'s runtime stage (`eclipse-temurin:25-jre`) has no `USER`
instruction, so the Java process runs as root inside the container.

**Risk.** Standard container-hardening gap — if any dependency vulnerability allows remote code
execution, the attacker gets root inside the container rather than an unprivileged user.

**Module.** `backend/Dockerfile`.

**Acceptance criteria.** Add a non-root user in the runtime stage and run the JAR as that user.

**Priority.** High.
**Frontend today.** Not applicable; this is a backend/infra-only fix.

---

## 10. Docker Compose has no healthchecks

**Problem.** Neither `backend/infra/docker-compose.yml` nor `docker-compose.app.yml` define a
`healthcheck` for any service (Postgres, Redis, RabbitMQ, Mailpit, or any of the 5 Spring
services). `depends_on` is plain-list form, so it only orders container *start*, not readiness.

**Risk.** App services can attempt DB/broker connections before those are actually accepting
connections, causing flaky/non-deterministic startup — particularly relevant for Flyway
migrations racing a not-yet-ready Postgres.

**Module.** `backend/infra/docker-compose.yml`, `backend/infra/docker-compose.app.yml`.

**Acceptance criteria.** Add `healthcheck` blocks to each service and switch `depends_on` entries
to `condition: service_healthy` where applicable.

**Priority.** Medium.
**Frontend today.** Not applicable.

---

## 11. Notification Dead Letter Queue has no re-drive path

**Problem.** `NotificationDeadLetterListener` only logs and records a metric for messages that
land in the DLQ (e.g., after a transient SMTP outage). There is no mechanism — admin endpoint or
scheduled job — to replay DLQ messages back onto the main queue once the underlying issue is
resolved.

**Risk.** A transient failure (SMTP down for a few minutes during a busy approval period)
permanently strands the affected ticket-confirmation emails unless an engineer manually
intervenes at the broker level.

**Module.** `backend/notification-service` — `listener/NotificationDeadLetterListener.java`.

**Acceptance criteria.** Add an admin-triggerable or scheduled re-drive mechanism for DLQ
messages, with idempotency preserved (reuse the existing Redis `messageId` dedup key).

**Priority.** Medium.
**Frontend today.** Not applicable; no frontend surface exists for this today, and none should
be added until the backend capability exists (see item 14 on missing admin operational APIs).

---

## 12. `POST /tickets/inventories` lacks an explicit URL-level role rule

**Problem.** Unlike every other organizer-only route in `ticket-service`, this endpoint has no
explicit entry in `SecurityConfig`'s path-matcher rules — it falls through to the default
`anyRequest().authenticated()`. Authorization is currently enforced only inside the service layer
(`requireOrganizerOrAdmin()`), which is safe today but is a defense-in-depth gap versus the
pattern used everywhere else.

**Module.** `backend/ticket-service` — `security/SecurityConfig.java`.

**Acceptance criteria.** Add an explicit `hasAnyRole('ORGANIZER','SUPER_ADMIN')` path-matcher
rule for this route, matching the pattern used for other organizer-only endpoints.

**Priority.** Low (functionally safe today; this closes a consistency/defense-in-depth gap).
**Frontend today.** Not applicable.

---

## 13. No endpoint for a student to re-fetch their ticket QR

**Problem.** The signed QR payload is generated once by `notification-service` and delivered only
as an email attachment. `ticket-service` exposes no "get my ticket QR" endpoint.

**Risk.** Not a security issue, but a real support gap: a student who loses/deletes the ticket
email has no self-service way to retrieve their QR again.

**Module.** `backend/ticket-service` — would need a new endpoint, e.g.
`GET /tickets/{ticketId}/qr`, scoped to the ticket's own `studentId`.

**Acceptance criteria.** New authenticated endpoint returns the same signed QR payload/image for
a ticket owned by the requesting student.

**Priority.** Medium.
**Frontend today.** `ticketService.getQrPayload()` intentionally throws
`createUnsupportedApiError(...)` rather than fabricating a QR client-side; `QRDisplayCard` shows
"Backend chưa cung cấp QR payload cho vé này" instead of a fake QR when the payload is absent.

---

## 14. No statistics or audit-log read API for Super Admin

**Problem.** `auth-service` records audit log entries internally (`AuditLog` entity/service) for
every admin action, but exposes no endpoint to *read* them. No service exposes a
cross-club/school-wide statistics endpoint at all (event counts, registration trends, check-in
rates).

**Risk.** Not a security issue by itself, but it means the entire Super Admin "Dashboard",
"Thống kê", and "Nhật ký hệ thống" surface has nothing real to connect to.

**Module.** `backend/auth-service` (audit log read API), and a new or existing service for
school-wide statistics (candidates: `event-service` for aggregate event/registration counts,
`ticket-service` for aggregate check-in rates — needs a design decision on which service owns
cross-club aggregation, since today every existing endpoint is scoped to a single club by JWT
`clubId`).

**Proposed contracts (for discussion, not implemented anywhere):**

```json
// GET /admin/audit-logs?role=&action=&page=&size=
{
  "content": [
    { "id": "uuid", "actorId": "uuid", "actorEmail": "...", "action": "auth.organizer.create",
      "targetType": "USER", "targetId": "uuid", "createdAt": "2026-07-01T08:00:00Z" }
  ],
  "totalElements": 42
}
```

```json
// GET /admin/statistics/overview
{
  "totalClubs": 12, "totalEvents": 84, "totalReservations": 5310,
  "totalTicketsIssued": 4890, "totalCheckedIn": 3102
}
```

**Acceptance criteria.** Endpoints exist, are `SUPER_ADMIN`-scoped, paginated where appropriate,
and documented in OpenAPI.

**Priority.** Medium (blocks Super Admin Dashboard/Stats/Logs pages from ever showing real data,
but does not block the core registration → approval → ticket → check-in flow).
**Frontend today.** `SuperAdminDashboard`, `SuperAdminStatsPage`, `SuperAdminUsersPage`,
`SuperAdminStudentsPage`, and `SuperAdminLogsPage` now show an honest "waiting on backend" state
instead of presenting fixture data as if it were live. See
[FRONTEND_IMPLEMENTATION_STATUS.md](FRONTEND_IMPLEMENTATION_STATUS.md).

---

## 15. Reservation/Event response DTOs are missing display fields the UI needs

**Problem.** `ReservationResponse` has no student display-name field (only `studentEmail` and
`studentMssv`), and no class code. `EventResponse` has no club display-name field (only
`clubId`). The frontend previously papered over these gaps by fabricating values (student name
shown as their email; club name hardcoded to a single fake string for every event) — both have
now been removed in favor of honest "chưa có thông tin" placeholders (see
[FRONTEND_IMPLEMENTATION_STATUS.md](FRONTEND_IMPLEMENTATION_STATUS.md)), but the underlying data
gap remains.

**Module.** `backend/ticket-service` (`ReservationResponse`), `backend/event-service`
(`EventResponse`).

**Acceptance criteria.** `ReservationResponse` includes the student's display name and class
code (or the frontend is given a legitimate way to resolve them); `EventResponse` includes the
owning club's display name (or a batch club-lookup endpoint the frontend is authorized to call).

**Priority.** Medium (data-completeness, not a security defect).
**Frontend today.** Renders neutral fallback text ("Chưa có thông tin") instead of fabricated
values wherever these fields are missing.

---

## Summary table

| ID | Issue | Priority | Status |
| -- | ----- | -------- | ------ |
| 1 | Organizer accounts have no credential | Critical | Blocked by backend |
| 2 | Super Admin bootstrap not environment-gated | Critical | Blocked by backend |
| 3 | Backend defaults to `dev` profile | Critical | Blocked by backend |
| 4 | Microsoft OIDC accepts any tenant | High | Blocked by backend |
| 5 | auth-service CSRF secret silent fallback | High | Blocked by backend |
| 6 | `CreateOrganizerRequest` has no password/invite field | Critical | Blocked by backend (= item 1) |
| 7 | `.../reset` does not reset a password | Medium | Blocked by backend |
| 8 | CSV injection in attendee export | High | Blocked by backend |
| 9 | Backend container runs as root | High | Blocked by backend |
| 10 | Docker Compose has no healthchecks | Medium | Blocked by backend |
| 11 | Notification DLQ has no re-drive path | Medium | Blocked by backend |
| 12 | `/tickets/inventories` missing explicit role rule | Low | Blocked by backend |
| 13 | No endpoint to re-fetch a ticket's QR | Medium | Blocked by backend |
| 14 | No statistics/audit-log read API | Medium | Blocked by backend |
| 15 | Reservation/Event DTOs missing display fields | Medium | Blocked by backend |
