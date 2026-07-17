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
| `notification-service` | 8083 | Consumes approval events, generates signed QR tickets and sends email |

## Run locally

Start local dependencies only (Postgres, Redis, RabbitMQ):

```bash
docker compose -f infra/docker-compose.yml up -d
```

The dependency Compose file starts PostgreSQL, Redis and RabbitMQ. Its init script creates `tvu_auth`,
`tvu_event`, and `tvu_ticket`.

Run the complete application stack (five services, dependencies and Mailpit) in containers:

```bash
docker compose -f infra/docker-compose.app.yml up -d --build --wait
```

`--wait` is important: it returns only after the services and their dependencies pass real healthchecks. The
gateway is exposed on `http://localhost:8080`, and Mailpit's inbox is at `http://localhost:8025`.

Frontend dev server should call the gateway:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_USE_DEMO_DATA=false
VITE_ENABLE_MOCK_FALLBACK=false
```

## Build / run / test

Run all commands from this `backend/` directory.

```bash
# Build and verify all modules
mvn clean verify

# Build/test a single module (with its dependencies)
mvn -pl ticket-service -am clean test

# Run one service (dev profile is the default; or run its ...Application class from the IDE)
mvn -pl ticket-service spring-boot:run

# Run against the prod profile (expects env vars to be set)
mvn -pl ticket-service spring-boot:run -Dspring-boot.run.profiles=prod

# Run a single test class
mvn -pl ticket-service test -Dtest=TicketReservationServiceTest
```

## Notes

- The atomic ticket deduction happens at **organizer approval time**, not at student submit (§6.3, §6.11).
- The implemented APIs cover auth/profile/admin management, event CRUD/lifecycle, reservations, ticket
  inventory, signed QR check-in, notification email, club/admin analytics and attendee/audit-log queries.
- The frontend currently uses handwritten API types; OpenAPI-based TypeScript generation remains a follow-up.
- The manual approval-capacity load test is in [load-test/](load-test/README.md). It records a measured
  500-concurrent-approval run with no overbooking; it is intentionally not part of CI.
- See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full set of design invariants.
