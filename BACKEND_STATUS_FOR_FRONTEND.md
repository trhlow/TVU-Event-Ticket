# Backend status for frontend integration

Last updated: 2026-07-11

This page is the quick frontend-facing view of the backend. Use it before wiring UI screens to live APIs.

## Current runtime

| Item | Current value |
| --- | --- |
| Java | 25 |
| Spring Boot | 4.0.7 |
| Spring Cloud | 2025.1.2 |
| Database | PostgreSQL 18.4 Alpine |
| Local dependencies | PostgreSQL, Redis, RabbitMQ |
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
| `XSRF-TOKEN` | readable CSRF token placeholder for frontend-side use |

Frontend requests must keep `credentials: "include"`.

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
| `PATCH` | `/reservations/{reservationId}/approve` | Ready | `ORGANIZER` | Approves and atomically reserves a ticket. |
| `PATCH` | `/reservations/{reservationId}/reject` | Ready | `ORGANIZER` | Rejects pending reservation. |
| `POST` | `/tickets/inventories` | Ready | `ORGANIZER` or `SUPER_ADMIN` | Initializes ticket inventory for an event. |

Reservation submit request:

```json
{
  "eventId": "uuid",
  "clubId": "uuid"
}
```

Inventory request:

```json
{
  "eventId": "uuid",
  "clubId": "uuid",
  "totalCapacity": 150,
  "eventTitle": "Hoi thao cong nghe",
  "eventStartAt": "2026-07-20T08:00:00Z",
  "eventEndAt": "2026-07-20T11:00:00Z",
  "eventLocation": "Hoi truong D5"
}
```

## Backend progress by module

| Module | Progress | Frontend impact |
| --- | --- | --- |
| `api-gateway` | Ready for auth, CORS, JWT cookie auth, RBAC, rate limiting, routing. | Frontend can call gateway directly with credentials. |
| `auth-service` | Ready for dev login, profile, SUPER_ADMIN club/organizer management, JWT/JWKS, cookies. | Login/profile/admin screens can start live integration. |
| `ticket-service` | Ready for reservation submit/list/approve/reject and inventory initialization. | Student registration and organizer approval flows can start live integration once event IDs exist. |
| `event-service` | Event schema, public discovery, organizer CRUD/lifecycle, club scoping, OpenAPI and audit publishing are ready. | Public and organizer event screens can use live APIs. |
| `notification-service` | App scaffold only. QR generation/email consumer endpoints are not implemented yet. | Ticket QR/email notification UI should stay mock or be feature-flagged. |

## Known gaps for frontend

- QR ticket display/check-in APIs are not available yet.
- Notification/email delivery is not available yet.
- OpenAPI-based TypeScript generation is planned, but frontend currently still has handwritten service/types.
- Internal password is not validated in dev auth; `credential` is the source of identity in the dev profile.

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
