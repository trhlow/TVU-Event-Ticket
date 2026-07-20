---
name: modular-monolith-migration
description: Migrate TVU Event & Ticket from its five Spring Boot microservices to one modular monolith. Use when moving a service capability, consolidating Compose/database/security, or retiring an internal HTTP boundary while keeping the public API stable.
---

# Modular monolith migration

Keep the public API at `/api/**` stable. Move one vertical capability at a time; do not mix unrelated
cleanup into a migration step.

## Required workflow

1. Read `backend/.claude/CLAUDE.md`, architecture rules, and the source service's complete configuration.
2. Use GitNexus impact analysis on every service class, controller, security config, client, and migration
   being moved. Review direct callers before editing.
3. Write a focused failing test in `monolith` for the capability's public behaviour. Use the narrowest Spring
   test slice that proves it.
4. Move the capability as a feature package under `vn.edu.tvu.monolith.<feature>`: controller, service,
   repository, domain, DTO, configuration, security, and tests together.
5. Preserve Flyway history: copy only unapplied migrations or introduce a new baseline/database. Never edit a
   shipped migration. For this local-reset migration, use `tvu_app` and a monolith-owned migration sequence.
6. Replace internal HTTP clients with constructor-injected in-process interfaces only after both modules are
   resident in the monolith. Remove the route/client configuration in the same migration step.
7. Keep RabbitMQ only for an asynchronous boundary that still needs durability. Prefer application events for
   in-process notifications after the outbox guarantee is preserved.
8. Run the module test suite, then use `detect_changes()` and the project reviewer/QA agents before commit.

## Migration order

1. Auth, JWT/CSRF and unified servlet security.
2. Events and their database schema.
3. Ticket reservation, approval and QR check-in.
4. Notification delivery and outbox integration.
5. Analytics/admin endpoints, then remove old service modules and gateway.

## Non-negotiable invariants

- Reservation capacity is consumed only at organizer approval.
- Organizer data access is always scoped to the JWT club ID.
- Check-in is signed and single-use.
- Browser authentication remains an HttpOnly JWT cookie with CSRF protection.
- The compact runtime must be one Spring Boot JVM; do not call `localhost` HTTP to imitate a monolith.
