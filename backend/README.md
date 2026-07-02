# Backend — TVU Event & Ticket

Maven multi-module project. Java 21, Spring Boot 3.3.x. Base package `vn.edu.tvu`.

## Conventions

- **Layer-based packages** inside each service: `controller → service (+ impl/) → repository → domain`,
  with `dto/{request,response}`, `mapper` (MapStruct), `config`, `security`, `exception`. The main
  `@SpringBootApplication` class sits in the root package so component scan covers only `vn.edu.tvu.*`.
- **Flyway** owns the DB schema (`src/main/resources/db/migration/Vn__*.sql`); Hibernate is `ddl-auto: validate`.
  Migration files are immutable once applied — add a new version, never edit a shipped one.
- **Profiles**: `application.yml` holds common config (default profile `dev`); `application-dev.yml` uses
  localhost, `application-prod.yml` reads everything from env vars with no fallback defaults.
- **DTOs** are generated from the OpenAPI spec on the frontend — do not hand-write shared types (§6.7).

## Modules

| Module                 | Port | Responsibility |
|------------------------|------|----------------|
| `api-gateway`          | 8080 | Single entry point: CORS, JWT auth, RBAC, rate limiting, routing |
| `event-service`        | 8081 | Events and clubs (JPA / PostgreSQL) |
| `ticket-service`       | 8082 | Reservations, tickets, check-in; atomic reservation via Redis (§6.3) |
| `notification-service` | 8083 | Consumes RabbitMQ → generates signed QR → emails ticket (§6.4, §6.6) |

## Prerequisites

Start local dependencies (Postgres, Redis, RabbitMQ):

```bash
docker compose -f infra/docker-compose.yml up -d
```

`event-service` and `ticket-service` use separate logical DBs (`tvu_event`, `tvu_ticket`).
Create the second one once:

```bash
docker exec -it infra-postgres-1 psql -U tvu -d tvu_event -c "CREATE DATABASE tvu_ticket;"
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

- DTOs are generated from the OpenAPI spec — do not hand-write shared types (§6.7).
- The atomic ticket deduction happens at **organizer approval time**, not at student submit (§6.3, §6.11).
- See [CLAUDE.md](CLAUDE.md) for the full set of design invariants.
