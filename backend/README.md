# Backend — TVU Event & Ticket

Modular monolith built with Maven, Java 25 and Spring Boot 4.0.x. It exposes
the public API at `http://localhost:8080/api` from one deployable application.

Frontend integration status is summarized in
[docs/BACKEND_STATUS_FOR_FRONTEND.md](docs/BACKEND_STATUS_FOR_FRONTEND.md).

## Conventions

- **Layer-based packages** inside each feature (`auth`, `event`, `ticket`, `notification`):
  `controller → service (+ impl/) → repository → domain`, with `dto/{request,response}`, `mapper`
  (MapStruct), `config`, `security`, `exception`. `MonolithApplication` scans only `vn.edu.tvu.monolith`
  and pulls each feature in through its `*FeatureConfiguration`.
- **Two packages sit outside the features.** `vn.edu.tvu.shared` holds beanless types more than one
  feature needs (`web.ErrorResponse`, `web.PageResponse`, `web.PageableFactory`, `domain.UserRole`,
  `audit.AuditRecorder`, `messaging.*`); `vn.edu.tvu.monolith` is the composition root and the only place
  allowed to depend on two features at once.
- **Flyway** owns the DB schema (`src/main/resources/db/migration/Vn__*.sql`); Hibernate is `ddl-auto: validate`.
  Migration files are immutable once applied — add a new version, never edit a shipped one.
- **Profiles**: `application.yml` holds common config (default profile `dev`); `application-dev.yml` uses
  localhost, `application-prod.yml` reads everything from env vars with no fallback defaults.
- **Shared frontend types** should eventually be generated from the OpenAPI spec (§6.7). Until that pipeline
  is wired, keep frontend handwritten types aligned with [docs/BACKEND_STATUS_FOR_FRONTEND.md](docs/BACKEND_STATUS_FOR_FRONTEND.md).

## Runtime

| Component | Port | Responsibility |
|---|---:|---|
| `monolith` | 8080 | Auth/RBAC, event lifecycle, reservations, tickets, analytics, outbox and notification consumer |
| PostgreSQL | 5432 | Single `tvu_app` schema managed by Flyway |
| Redis | 6379 | Capacity counter and notification idempotency |
| RabbitMQ | 5672 / 15672 | Durable outbox-to-notification boundary — carries `reservation.approved` only; audit is a direct in-process call |
| Mailpit | 8025 | Local mail inbox |

## Run locally

Run the complete local application (one Spring Boot JVM plus supporting infrastructure):

```bash
docker compose -f infra/docker-compose.monolith.yml up -d --build --wait
```

`--wait` returns only after the monolith and dependencies pass healthchecks. The API is exposed at
`http://localhost:8080`, and Mailpit's inbox is at `http://localhost:8025`.

Frontend dev server should call the monolith:

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

# Build/test the deployable runtime (with all feature libraries)
mvn -pl monolith -am clean test

# Build then run the single application
mvn -pl monolith -am package
java -jar monolith/target/monolith-0.0.1-SNAPSHOT.jar

# Run against the prod profile (expects env vars to be set)
SPRING_PROFILES_ACTIVE=prod java -jar monolith/target/monolith-0.0.1-SNAPSHOT.jar

# Run a single test class
mvn -pl monolith -am test -Dtest=TicketReservationServiceTest
```

## Production

For the complete server preparation, secret generation, build, deploy, smoke
test, backup, and rollback path, follow
[`docs/PRODUCTION_DEPLOYMENT_VI.md`](docs/PRODUCTION_DEPLOYMENT_VI.md).

## Notes

- The atomic ticket deduction happens at **organizer approval time**, not at student submit (§6.3, §6.11).
- The implemented APIs cover auth/profile/admin management, event CRUD/lifecycle, reservations, ticket
  inventory, signed QR check-in, notification email, club/admin analytics and attendee/audit-log queries,
  plus read-only per-club statistics for super-admin (`/api/admin/clubs/stats`,
  `/api/admin/clubs/{clubId}/stats`, backed by the indexes in `V5`/`V6`).
- **Super-admin is read-only across club scope by design.** It administers club and organizer accounts and
  reads aggregates; every club-scoped route answers `403`. Enforced in `SecurityConfig` and again in the
  services.
- **Audit is written in-process and transactionally** through `shared.audit.AuditRecorder`, not published
  to RabbitMQ. The broker carries `reservation.approved` and nothing else.
- **`V7` adds the foreign keys** that the old database-per-service split had made impossible. No
  `ON DELETE` behaviour is declared: deleting a referenced row fails loudly rather than cascading away
  ticket history.
- The frontend currently uses handwritten API types; OpenAPI-based TypeScript generation remains a follow-up.
- The manual approval-capacity load test is in [load-test/](load-test/README.md); it is intentionally
  not part of CI.
- Production topology, deployment steps and cost guidance are in
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full set of design invariants.
