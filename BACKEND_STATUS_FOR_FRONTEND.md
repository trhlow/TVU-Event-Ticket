# Backend status for frontend integration

Last updated: 2026-07-13

This page is the quick frontend-facing view of the backend. Use it before wiring UI screens to live APIs.

## Current runtime

| Item | Current value |
| --- | --- |
| Java | 25 |
| Spring Boot | 4.0.7 |
| Spring Cloud | 2025.1.2 |
| Database | PostgreSQL 18.4 Alpine |
| Local dependencies | PostgreSQL, Redis, RabbitMQ, Mailpit |
| Main entry point for frontend | API Gateway |

## How frontend should call backend

Use the gateway, not individual services:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_USE_DEMO_DATA=false
VITE_ENABLE_MOCK_FALLBACK=false
```

If local port `8080` is already occupied, run the gateway on another host port and point `VITE_API_BASE_URL`
there. During the last smoke test the gateway was exposed as `http://localhost:18080/api`.

Cookies are enabled. Login sets:

| Cookie | Purpose |
| --- | --- |
| `TVU_AUTH` | HTTP-only JWT used by gateway and services |
| `XSRF-TOKEN` | signed double-submit CSRF token; send the same value as `X-XSRF-TOKEN` on mutating requests |

Frontend requests must keep `credentials: "include"`.
The shared API client already adds `X-XSRF-TOKEN` for `POST`, `PUT`, `PATCH`, and `DELETE` after login.

## Local backend startup

From `backend/`:

```bash
docker compose -f infra/docker-compose.app.yml up --build
```

Default service ports:

| Service | Port | Health |
| --- | --- | --- |
| API Gateway | 8080 | `GET /actuator/health` |
| event-service | 8081 | `GET /actuator/health` |
| ticket-service | 8082 | `GET /actuator/health` |
| notification-service | 8083 | `GET /actuator/health` |
| auth-service | 8084 | `GET /actuator/health` |

## Available API surface

All paths below are called through the gateway with the `/api` base.

### Auth and profile

| Method | Path | Status | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Ready | Dev profile accepts any valid email-like `credential`. Returns `{ profile }` and auth cookies. |
| `GET` | `/auth/me` | Ready | Requires authenticated cookie/JWT. |
| `PATCH` | `/auth/me/profile` | Ready | Student profile completion. Body: `{ "mssv": "...", "classCode": "..." }`. |
| `POST` | `/auth/logout` | Ready | Clears auth cookies. |

Login request:

```json
{
  "credential": "student@tvu.edu.vn",
  "displayName": "Sinh vien TVU"
}
```

Login response:

```json
{
  "profile": {
    "id": "uuid",
    "email": "student@tvu.edu.vn",
    "displayName": "Sinh vien TVU",
    "role": "SINH_VIEN",
    "clubId": null,
    "mssv": null,
    "classCode": null,
    "profileComplete": false
  }
}
```

Dev note: `auth-service` promotes only the configured bootstrap email to `SUPER_ADMIN`.
Default dev value is `BOOTSTRAP_ADMIN_EMAIL=admin@example.com`. If the UI needs an `@tvu.edu.vn`
admin account, run auth-service with `BOOTSTRAP_ADMIN_EMAIL=admin@tvu.edu.vn`.

### Super admin

Requires role `SUPER_ADMIN`.

| Method | Path | Status | Notes |
| --- | --- | --- | --- |
| `POST` | `/admin/clubs` | Ready | Create club. |
| `GET` | `/admin/clubs` | Ready | List clubs. |
| `PATCH` | `/admin/clubs/{clubId}` | Ready | Update club. |
| `DELETE` | `/admin/clubs/{clubId}` | Ready | Deactivate club. |
| `POST` | `/admin/organizers` | Ready | Create organizer account for a club. |
| `GET` | `/admin/organizers` | Ready | List organizers. |
| `PATCH` | `/admin/organizers/{organizerId}/lock` | Ready | Lock organizer. |
| `POST` | `/admin/organizers/{organizerId}/reset` | Ready | Reset organizer external identity binding. |
| `DELETE` | `/admin/organizers/{organizerId}` | Ready | Delete organizer. |

### Events

| Method | Path | Status | Role | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/events` | Ready | Public | Lists OPEN events whose registration window includes the current time. |
| `GET` | `/events/{eventId}` | Ready | Public | Returns details for an OPEN event. |
| `GET` | `/events/mine` | Ready | `ORGANIZER` | Lists all events owned by the organizer's club. |
| `POST` | `/events` | Ready | `ORGANIZER` | Creates a DRAFT event; `clubId` comes from JWT. |
| `PUT` | `/events/{eventId}` | Ready | `ORGANIZER` | Updates an event in the same club. Capacity cannot change after OPEN. |
| `PATCH` | `/events/{eventId}/status` | Ready | `ORGANIZER` | Supports DRAFT -> OPEN -> CLOSED. |
| `DELETE` | `/events/{eventId}` | Ready | `ORGANIZER` | Deletes DRAFT events only. |

Event responses intentionally do not include `remainingTickets`; use ticket availability APIs when they are exposed.
The current frontend adapter supplies display-only defaults for legacy fields such as category and club name.

### Reservations and ticket inventory

| Method | Path | Status | Role | Notes |
| --- | --- | --- | --- | --- |
| `POST` | `/reservations` | Ready | `SINH_VIEN` | Requires `Idempotency-Key` header. Does not deduct ticket capacity yet. |
| `GET` | `/reservations/me` | Ready | `SINH_VIEN` | Current student's reservations. |
| `GET` | `/reservations/pending` | Ready | `ORGANIZER` | Pending reservations for organizer club. |
| `POST` or `PATCH` | `/reservations/{reservationId}/approve` | Ready | `ORGANIZER` | Approves and atomically reserves a ticket; POST is the master-contract method and PATCH remains compatible. |
| `POST` or `PATCH` | `/reservations/{reservationId}/reject` | Ready | `ORGANIZER` | Rejects pending reservation; POST is the master-contract method and PATCH remains compatible. |
| `POST` | `/tickets/inventories` | Ready | `ORGANIZER` or `SUPER_ADMIN` | Initializes ticket inventory for an event. |
| `GET` | `/ticketing/events/{eventId}/availability` | Ready | Public | Returns total, approved and remaining capacity. |
| `GET` | `/ticketing/events/availability?ids=...` | Ready | Public | Batch availability for up to 100 events. |
| `POST` | `/ticketing/check-in` | Ready | `ORGANIZER` | Verifies the signed QR and atomically checks in once. |
| `GET` | `/ticketing/events/{eventId}/attendees` | Ready | `ORGANIZER` | Club-scoped attendee JSON. |
| `GET` | `/ticketing/events/{eventId}/attendees.csv` | Ready | `ORGANIZER` | Club-scoped UTF-8 CSV export. |

Reservation submit request:

```json
{
  "eventId": "uuid"
}
```

Inventory request:

```json
{
  "eventId": "uuid"
}
```

## Backend progress by module

| Module | Progress | Frontend impact |
| --- | --- | --- |
| `api-gateway` | Ready for auth, strict credentialed CORS, JWT cookie auth, signed CSRF, RBAC, rate limiting, and routing. | Frontend can call gateway directly with credentials and the shared API client. |
| `auth-service` | Ready for dev login, profile, SUPER_ADMIN club/organizer management, JWT/JWKS, cookies. | Login/profile/admin screens can start live integration. |
| `ticket-service` | Ready for validated reservation, atomic approval, availability, QR check-in and attendee export. | Student registration and organizer ticket workflows can use live APIs. |
| `event-service` | Event schema, public discovery, organizer CRUD/lifecycle, club scoping, OpenAPI and audit publishing are ready. | Public and organizer event screens can use live APIs. |
| `notification-service` | Ready: consumes approved reservations, produces ticket-service-compatible signed QR PNGs, sends localized email, deduplicates by outbox message ID, and exposes DLQ metrics. | No frontend endpoint. After an organizer approves a reservation, the existing approval flow asynchronously sends the student's ticket email. Keep status UI based on reservation state, never on email delivery. |

## Known gaps for frontend

- Ticket availability, organizer QR check-in, attendee JSON and CSV APIs are available under `/api/ticketing/**`.
- Notification/email delivery is asynchronous after a successful organizer approval. It has no gateway route and should not be polled from the UI.
- OpenAPI-based TypeScript generation is planned, but frontend currently still has handwritten service/types.
- Internal password is not validated in dev auth; `credential` is the source of identity in the dev profile.

## EPIC delivery progress

| EPIC | Progress | Status |
| --- | ---: | --- |
| EPIC 0 - Platform and auth scaffold | 100% | Complete on `main`. |
| EPIC 1 - Identity, JWT, users, clubs and RBAC | 100% | Complete on `main`. |
| EPIC 2 - Gateway security and routing | 100% | Complete on `main`. |
| EPIC 3 - Event service | 100% | Complete on `main`. |
| EPIC 4 - Ticket service core | 100% | Complete on `main`; plan-audit hardening adds POST compatibility and additional concurrency/contract coverage. |
| EPIC 5 - Notification service | 100% | Complete on `main`: approved-reservation mail, signed QR, Redis idempotency, RabbitMQ DLQ and Mailpit smoke coverage. |
| EPIC 6-8 | Not started as complete EPICs | Some infrastructure/documentation pieces exist, but none should be marked complete yet. |

EPIC 4 now includes event-authoritative reservation snapshots, safe Redis Lua capacity, row-locked concurrent
approval, leased outbox delivery, availability APIs, signed single-use QR check-in, scoped attendee JSON/CSV,
and PostgreSQL/Redis concurrency tests. A complete implementation plan for EPIC 5 is available at
`backend/.claude/plans/epic-5-notification-service.md`.

## Last verification

The integrated main branch was verified with:

```bash
cd backend
mvn -B verify

cd ../frontend
npm run lint
npm run build
```

Additional smoke checks passed:

- Docker backend stack started with PostgreSQL 18.4, Redis, RabbitMQ.
- Gateway health returned `UP`.
- `POST /api/auth/login` through gateway returned `200` and auth cookies.
- Frontend login page submitted to the live gateway and rendered `/student/home`.
- EPIC 4 hardening suite passes 41 ticket-service tests, including EventClient failures/timeouts, PostgreSQL
  optimistic locking, Redis flush/reseed, approval rollback compensation, two-worker outbox claiming, publisher
  confirms, QR signature/expiry, HTTP RBAC, OpenAPI coverage, and cross-club attendee isolation.
- Docker EPIC 4 flow produced `APPROVED`, remaining capacity `0`, single-use `CHECKED_IN`, cross-club attendee
  HTTP `403`, and all approval/check-in outbox rows reached `SENT` after RabbitMQ confirms.
- EPIC 0-4 audit smoke verified login `200` with both auth cookies, missing CSRF `403`, valid signed CSRF
  profile update `200`, public events `200`, and auth OpenAPI `200` through the rebuilt Docker stack.
- EPIC 5 notification tests cover QR compatibility, MIME mail, Redis idempotency, RabbitMQ dead lettering and
  redelivery. The Docker smoke publishes a live `reservation.approved` message and confirms one Mailpit email
  for the original and duplicate message ID.
