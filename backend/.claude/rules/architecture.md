---
description: Architecture and invariants for the modular-monolith backend
---

# Architecture — TVU Event & Ticket backend

The backend is one deployable Spring Boot application in `backend/monolith`.
The Maven reactor contains only the root aggregator and this module.  Do not
add a gateway or independently deployable service unless the architecture is
explicitly reconsidered.

## Working scope

Keep backend tooling under `backend/`. The only root-level exception is
`.github/workflows/*.yml`, because GitHub Actions reads workflows there.

## Feature boundaries

One process and one PostgreSQL database do not mean one unstructured package.
Features remain isolated under `vn.edu.tvu`:

| Feature | Package | Responsibilities |
|---|---|---|
| Identity | `auth` | users, clubs, RBAC, internal JWT/JWKS, audit log |
| Events | `event` | events and organizer ownership checks |
| Ticketing | `ticket` | reservations, tickets, check-in, Redis counter, transactional outbox |
| Notifications | `notification` | consumes internal RabbitMQ events, generates signed QR, sends email |

`MonolithApplication` is the only `@SpringBootApplication`. Each feature has a
`*FeatureConfiguration` that scans only its own package. Feature APIs use DTOs;
repositories and entities are private implementation details. Use explicit
service interfaces or domain events for cross-feature collaboration rather than
reaching into another feature's repository.

Schema is Flyway-managed in the monolith's `db/migration/` directory. Migration
versions are immutable and Hibernate uses `ddl-auto: validate`. Runtime config
is `application.yml` plus profile overlays. Local development uses PostgreSQL,
Redis, RabbitMQ and Mailpit from `infra/docker-compose.monolith.yml`; production
uses the single application container behind Caddy.

## Critical invariants

1. **Approval, not submission, reserves inventory.** Registration creates a
   `PENDING` row without consuming a ticket. Approval performs the atomic Redis
   decrement; a negative result keeps it pending. Successful approval writes the
   ticket and outbox event atomically. Lifecycle: `PENDING → APPROVED | REJECTED`.
2. **Overbooking has two guards.** Redis is the fast atomic counter; PostgreSQL
   optimistic locking is the database fallback/second line of defence.
3. **Identity is not an IP address.** Enforce one registration per event/account
   with a DB constraint and idempotency key. Rate limiting only mitigates abuse.
4. **RBAC is scoped by club.** Organizer queries must use the club identifier
   from the authenticated principal; never trust a client-supplied club id.
5. **QR tickets are signed and single use.** Check-in is one atomic transition
   from `VALID` to `CHECKED_IN`.
6. **The OpenAPI contract is the frontend contract.** Generate frontend types;
   do not hand-maintain duplicate shared DTOs.
7. **Security sits at the application edge.** Use explicit CORS origins,
   HTTP-only JWT cookies where applicable, and production rate limits. Caddy is
   the only public reverse proxy in production.
8. **Keep the runtime small.** Do not store blobs in PostgreSQL. Keep queues and
   connection counts modest; the application, Redis and RabbitMQ are supporting
   components of one deployment, not separate business services.
