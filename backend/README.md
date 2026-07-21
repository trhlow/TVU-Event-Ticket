# Backend — TVU Event & Ticket

Modular monolith built with Maven, Java 25 and Spring Boot 4.0.x. It exposes
the public API at `http://localhost:8080/api` from one deployable application.

Frontend integration status is summarized in
[docs/BACKEND_STATUS_FOR_FRONTEND.md](docs/BACKEND_STATUS_FOR_FRONTEND.md).

## Conventions

- **Layer-based packages** inside each feature: `controller → service (+ impl/) → repository → domain`,
  with `dto/{request,response}`, `mapper` (MapStruct), `config`, `security`, `exception`. The main
  `@SpringBootApplication` class sits in the root package so component scan covers only `vn.edu.tvu.*`.
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
| RabbitMQ | 5672 / 15672 | Durable outbox-to-notification boundary |
| Mailpit | 8025 | Local mail inbox |

## Run locally

Run the complete local application (one Spring Boot JVM plus supporting infrastructure):

```bash
docker compose -f infra/docker-compose.app.yml up -d --build --wait
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

## Notes

- The atomic ticket deduction happens at **organizer approval time**, not at student submit (§6.3, §6.11).
- The implemented APIs cover auth/profile/admin management, event CRUD/lifecycle, reservations, ticket
  inventory, signed QR check-in, notification email, club/admin analytics and attendee/audit-log queries.
- The frontend currently uses handwritten API types; OpenAPI-based TypeScript generation remains a follow-up.
- The manual approval-capacity load test is in [load-test/](load-test/README.md); it is intentionally
  not part of CI.
- Production topology, deployment steps and cost guidance are in
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full set of design invariants.
