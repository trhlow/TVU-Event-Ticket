# Backend — TVU Event & Ticket

Maven multi-module project. Java 25, Spring Boot 4.0.x. Base package `vn.edu.tvu`.

Frontend integration status is summarized in
[../BACKEND_STATUS_FOR_FRONTEND.md](../BACKEND_STATUS_FOR_FRONTEND.md).

## Conventions

- **Layer-based packages** inside each service: `controller → service (+ impl/) → repository → domain`,
  with `dto/{request,response}`, `mapper` (MapStruct), `config`, `security`, `exception`. The main
  `@SpringBootApplication` class sits in the root package so component scan covers only `vn.edu.tvu.*`.
- **Flyway** owns the DB schema (`src/main/resources/db/migration/Vn__*.sql`); Hibernate is `ddl-auto: validate`.
  Migration files are immutable once applied — add a new version, never edit a shipped one.
- **Profiles**: `application.yml` holds common config (default profile `dev`); `application-dev.yml` uses
  localhost, `application-prod.yml` reads everything from env vars with no fallback defaults.
- **Shared frontend types** should eventually be generated from the OpenAPI spec (§6.7). Until that pipeline
  is wired, keep frontend handwritten types aligned with [../BACKEND_STATUS_FOR_FRONTEND.md](../BACKEND_STATUS_FOR_FRONTEND.md).

## Modules

| Module                 | Port | Responsibility |
|------------------------|------|----------------|
| `api-gateway`          | 8080 | Single entry point: CORS, JWT auth, RBAC, rate limiting, routing |
| `auth-service`         | 8084 | Dev login, profile, SUPER_ADMIN club/organizer management, JWT/JWKS, cookies |
| `event-service`        | 8081 | Public event discovery and club-scoped organizer CRUD/lifecycle APIs |
| `ticket-service`       | 8082 | Reservations and ticket inventory; atomic reservation via Redis (§6.3) |
| `notification-service` | 8083 | Scaffolded service for future QR/email delivery |

## Prerequisites

Start local dependencies only (Postgres, Redis, RabbitMQ):

```bash
docker compose -f infra/docker-compose.yml up -d
```

The compose init script creates `tvu_auth`, `tvu_event`, and `tvu_ticket`.

Run the full backend stack in containers:

```bash
docker compose -f infra/docker-compose.app.yml up --build
```

Frontend dev server should call the gateway:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_USE_DEMO_DATA=false
VITE_ENABLE_MOCK_FALLBACK=false
```

## Build / run / test

Run all commands from this `backend/` directory.

```bash
# Build all modules
mvn clean install

# Build/test a single module (with its dependencies)
mvn -pl ticket-service -am test

# Run one service (dev profile is the default; or run its ...Application class from the IDE)
mvn -pl ticket-service spring-boot:run

# Run against the prod profile (expects env vars to be set)
mvn -pl ticket-service spring-boot:run -Dspring-boot.run.profiles=prod

# Run a single test class
mvn -pl ticket-service test -Dtest=TicketReservationServiceTest
```

## Notes

- OpenAPI-based TypeScript generation is planned; frontend types are currently handwritten.
- The atomic ticket deduction happens at **organizer approval time**, not at student submit (§6.3, §6.11).
- Current implemented live APIs: auth/profile/admin, event CRUD/lifecycle, reservation workflow, and ticket inventory initialization.
- Current gaps: QR check-in and notification/email delivery are not implemented yet.
- See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full set of design invariants.
