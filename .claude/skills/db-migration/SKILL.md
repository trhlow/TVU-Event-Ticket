---
name: db-migration
description: Add or change a Flyway database migration in event-service or ticket-service. Use when creating tables/columns/constraints, adding a JPA entity that needs schema, or altering the DB schema in this backend.
---

# Flyway Migration (TVU Event & Ticket backend)

Flyway owns the schema in the two DB-backed services (`event-service`, `ticket-service`). Hibernate runs with
`ddl-auto: validate` — it never creates or alters tables, it only checks the entities match the schema Flyway
produced. So **every schema change is a migration file**, and entity + migration must stay in sync.

## Where migrations live

```
event-service/src/main/resources/db/migration/
ticket-service/src/main/resources/db/migration/
```

Configured in each service's `application.yml`:
```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
```

## Rules

1. **Naming:** `V<n>__<snake_case_description>.sql` — double underscore after the version. Increment `<n>`
   per service (each service has its own history). Example: `V2__add_reservation_tables.sql`.
2. **Immutability:** once a `V<n>__*.sql` has been applied (locally or anywhere), **never edit it** — Flyway
   validates a checksum and will fail. To change something, add a new `V<n+1>__*.sql`.
3. **Entity sync:** after writing the migration, make the JPA `@Entity` in `domain/` match exactly (column
   names, nullability, types). A mismatch fails startup under `validate`.
4. **No blobs:** store metadata only, never file/image bytes (Neon free-tier storage cap — see
   `.claude/docs/deployment.md`).

## Steps to add a migration

1. Pick the service and the next version number (look at the highest existing `V<n>` in that service's
   `db/migration/`).
2. Write the `.sql` (DDL). Then write/adjust the matching entity in `domain/` and its repository.
3. Start local infra and run the service so Flyway applies it:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   mvn -pl ticket-service spring-boot:run      # applies pending migrations on startup
   ```
   Or just build — tests boot the context and validate the schema:
   ```bash
   mvn -pl ticket-service -am test
   ```
4. Verify it applied: check the `flyway_schema_history` table, or confirm the app started without a
   `ValidationException`.

## ticket-service: required first real migration

The baseline `ticket-service/.../V1__init_schema.sql` is a placeholder (`SELECT 1;`). The first real migration
must encode the overbooking/anti-fraud guarantees (CLAUDE.md §6.3, §6.11):

- `reservations.status` constrained to `PENDING | APPROVED | REJECTED` (CHECK or enum).
- `UNIQUE (event_id, student_id)` — enforces max 1 ticket per student per event.
- a `version` column on the ticket/reservation row for JPA `@Version` optimistic locking.
- `tickets.status` for the single-use QR check-in (`VALID → CHECKED_IN`).

Keep the atomic ticket-count decrement in Redis (not the DB) — the DB constraints above are the second line of
defense, not the primary counter.
