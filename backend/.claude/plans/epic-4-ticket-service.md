# EPIC 4 implementation plan - ticket-service core

## Objective

Complete the core flow from an authenticated student reservation through organizer approval, atomic capacity
control, ticket issuance, reliable RabbitMQ delivery, QR check-in, attendee export, and correctness testing.
The implementation must preserve every invariant in `.claude/rules/architecture.md` and the cross-service
contracts in `.claude/docs/contracts.md`.

## Entry criteria

- EPIC 3 is merged and `event-service` exposes public event details with `clubId`, capacity, registration
  window, event start/end, location, and lifecycle status.
- `main` passes `mvn -B verify` on Java 25 with Docker available for Testcontainers.
- Work starts on a new `feat/ticket-core` branch from the updated `main`.
- No EPIC 4 migration is edited after it has been applied. Existing V1 and V2 remain immutable.

## Current baseline and gaps

The repository already contains an early ticket core: V2 schema, reservation submit/list/approve/reject,
ticket inventory, Redis decrement, tickets, outbox publishing, JWT resource-server security, and 12 tests.
This is useful scaffolding, not completion of EPIC 4.

Known contract gaps to fix:

- Reservations do not store the event title/start/end/location snapshot.
- Idempotency is globally scoped to `(student_id, idempotency_key)` instead of event + student + key.
- Submission trusts client `clubId` and local inventory instead of validating event-service state/window.
- Redis initializes from raw capacity and does not safely reconcile after a flush.
- Approval does not lock the reservation row, so concurrent approvals of the same reservation can double-decrement.
- Outbox has no PROCESSING lease, lock owner/expiry, last error, or `SKIP LOCKED` multi-instance claim.
- Availability, QR verification/check-in, attendee JSON/CSV, and required route coverage are missing.
- Existing tests do not prove concurrency, compensation, Redis recovery, single-use check-in, HTTP RBAC, or
  OpenAPI completeness.

## Architecture decisions

1. Keep `ticket_inventories` as the ticket-service local capacity projection and optimistic-lock fallback.
   Creation/reconciliation must be driven from event-service data; clients cannot author club/capacity snapshots.
2. Add `V3__align_epic4_contract.sql` rather than editing V2. V3 adds reservation snapshots, replaces the
   incorrect idempotency constraint, and upgrades outbox leasing/status columns.
3. `EventClient` uses Spring `RestClient` and an `EVENT_SERVICE_URI` configuration property. It calls the
   internal event-service URI, forwards the caller JWT when needed, and maps only the event contract owned by
   event-service.
4. Reservation submit never decrements capacity. Approval is the only operation allowed to reserve a slot.
5. Redis uses a Lua script that returns `-1` without decrementing when sold out. Missing counters are seeded
   with `SET NX` from `max(0, total_capacity - approved ticket count)`.
6. Reservation approval locks the PENDING row in PostgreSQL before Redis decrement. Redis compensation runs
   only if decrement succeeded and the database transaction later fails.
7. Ticket approval and all ticket audit messages use the transactional outbox. Relay workers claim rows with
   a lease and `FOR UPDATE SKIP LOCKED`; AMQP `message-id` is always `outbox.message_id`.
8. QR payload verification is local HMAC-SHA256 using `QR_SIGNING_SECRET`; check-in is a conditional atomic
   update matching ticket, event, club, and VALID status.
9. Organizer reads and mutations are always scoped by `club_id` from JWT. Client-provided club IDs are never
   accepted as authority.

## Work packages and gates

### WP1 - Schema alignment and persistence (T4.1-T4.3)

Implementation:

- Add immutable `V3__align_epic4_contract.sql`.
- Add reservation snapshot columns: `event_title`, `event_start_at`, `event_end_at`, `event_location`.
- Drop `ux_reservations_student_idempotency`; add unique `(event_id, student_id, idempotency_key)` while
  retaining unique `(event_id, student_id)`.
- Change outbox lifecycle to `NEW|PROCESSING|SENT`; add `last_error`, `locked_at`, `locked_by`,
  `locked_until`, and `sent_at`. Convert payload to JSONB if migration safety permits.
- Align entities/repositories and introduce explicit request/response mappers. Do not expose entities.

Tests/acceptance:

- Flyway V1 -> V2 -> V3 and Hibernate validation pass on PostgreSQL 18.4.
- Duplicate event/student and event/student/idempotency rows are rejected.
- Same idempotency key can be reused by the same student for a different event.
- Ticket optimistic-lock conflict is covered by `@DataJpaTest`.
- Mapper tests cover every API field and prove no entity is returned by controllers.

Gate: review migration immutability, constraints, indexes, and entity parity; commit only after WP1 tests pass.

### WP2 - EventClient and reservation submission (T4.4, T4.6)

Implementation:

- Add typed `EventClientProperties`, `EventClient`, and `EventSnapshot`.
- Validate event exists, is OPEN, current time is inside registration window, and event club is authoritative.
- Require SINH_VIEN with nonblank MSSV/profile completion.
- Store a PENDING reservation and denormalized event snapshot; never decrement Redis at submit.
- Make idempotency replay return the existing matching response; conflicting payload/key returns 409.

Tests/acceptance:

- Mock HTTP server tests valid, missing, closed, out-of-window, malformed, timeout, and 5xx event responses.
- Profile incomplete returns 409.
- Double submit creates one row and no counter operation.
- Client club spoofing cannot alter the club stored on reservation.

Gate: review service boundaries and error mapping; commit after unit and HTTP client tests pass.

### WP3 - Safe Redis capacity projection (T4.5)

Implementation:

- Replace raw `DECR` behavior with a Lua reserve script that never creates a negative counter.
- Seed missing counters with `SET NX` using DB capacity minus approved ticket count, clamped to zero.
- Reconcile before approval whenever the key is absent; expose single and batch reads through one service.
- Add Redis Testcontainers support to ticket-service tests.

Tests/acceptance:

- Concurrent reserve calls never return or store a negative count.
- K approved tickets + Redis flush + reseed produces `capacity - K`.
- Repeated seed is idempotent and cannot overwrite a live counter.

Gate: review Lua atomicity and DB/Redis recovery semantics; commit after real Redis tests pass.

### WP4 - Atomic approve/reject workflow (T4.7-T4.9)

Implementation:

- Add repository row lock/conditional transition for PENDING reservations.
- Approval sequence: lock -> scope check -> reconcile/decrement -> update inventory -> APPROVED -> issue one
  ticket -> write reservation and audit outbox rows -> commit.
- Register transaction synchronization so Redis is compensated only after a post-decrement rollback.
- Reject only PENDING; APPROVED returns 409; repeated REJECTED is idempotent.
- List pending reservations by JWT club scope; align endpoint with `GET /api/reservations?status=PENDING`
  while keeping a documented compatibility route only if frontend still uses it.

Tests/acceptance:

- N concurrent approvals with M capacity produce exactly M tickets.
- Two concurrent approvals of one reservation decrement exactly once and create one ticket.
- DB failure after Redis decrement compensates exactly once.
- Sold-out path does not compensate because no decrement occurred and reservation remains PENDING.
- Cross-club organizer cannot list, approve, or reject reservations.

Gate: this is the headline correctness review. No commit until concurrency tests pass repeatedly.

### WP5 - Durable multi-instance outbox (T4.10, T4.17)

Implementation:

- Claim NEW or expired PROCESSING rows in bounded batches with `FOR UPDATE SKIP LOCKED`.
- Set PROCESSING lease/worker ID before publish; publish using row routing key and message UUID.
- Mark SENT on confirm; on failure increment attempts, preserve error, and make row retryable.
- Recover expired leases. Ensure publish-success/crash-before-SENT reuses the same message ID.
- Create audit outbox rows for approve, reject, and check-in.
- Mark relay infrastructure eager where global Docker lazy initialization would otherwise prevent scheduling.

Tests/acceptance:

- Correct payload, routing key, persistent delivery, and AMQP message ID.
- Broker failure is retried without message loss.
- Expired PROCESSING row is reclaimed.
- Two relay instances do not claim the same row.
- Redelivery keeps one message ID so auth/notification consumers deduplicate it.

Gate: review transaction boundaries and crash windows; commit after repository and Rabbit tests pass.

### WP6 - Availability APIs (T4.11)

Implementation:

- `GET /api/ticketing/events/{eventId}/availability`.
- `GET /api/ticketing/events/availability?ids=<uuid,...>` returning a map/batch DTO.
- Seed/reconcile missing counters through WP3; never call event-service once per item in a loop.
- Add all `/api/ticketing/**` routes and RBAC rules to gateway.

Tests/acceptance:

- Single/batch values reflect approval immediately.
- Missing Redis keys recover from DB safely.
- Gateway routes all ticket prefixes to ticket-service.

Gate: API contract and N+1 review; commit after controller and gateway tests pass.

### WP7 - Signed QR check-in (T4.12)

Implementation:

- Add shared-contract-compatible `QrPayload` parser/verifier and typed signing properties.
- Reject malformed, expired, or invalid HMAC payloads.
- Atomically update VALID -> CHECKED_IN while matching ticket ID, event ID, and JWT club ID.
- Return 409 for already checked-in/invalid tickets without revealing another club's ticket details.
- Write `audit.ticket.check-in` through outbox in the same DB transaction.

Tests/acceptance:

- Valid first scan succeeds; second scan returns 409.
- Bad signature, expired QR, event mismatch, and cross-club scan fail.
- Concurrent scans produce one success only.

Gate: security and replay review; commit after atomic integration tests pass.

### WP8 - Attendees, CSV, security, and OpenAPI (T4.13-T4.15)

Implementation:

- Add `/api/ticketing/events/{id}/attendees.csv` with stable UTF-8 headers and CSV escaping.
- Add paginated JSON attendees endpoint if required by EPIC UI, sharing the same scoped query.
- Enforce endpoint-level role rules and defense-in-depth club scope.
- Complete OpenAPI operations/schemas and permit docs endpoints consistently with other services.

Tests/acceptance:

- CSV columns/content/escaping are correct and match JSON source data.
- Student, anonymous, and cross-club requests are rejected.
- `/v3/api-docs` includes every EPIC 4 endpoint and DTO.

Gate: API/security review; commit after web slice and OpenAPI integration tests pass.

### WP9 - Correctness suite and end-to-end verification (T4.16)

Required automated suite:

- PostgreSQL constraints and optimistic locking.
- Redis atomic reserve, flush/reseed, and compensation.
- Reservation state machine and idempotency.
- Same-reservation and capacity-wide concurrency.
- Outbox leasing/retry/redelivery.
- Check-in single-use/concurrency and RBAC club isolation.
- Gateway routing/security and OpenAPI contract.

Required commands:

```bash
mvn -B -pl ticket-service -am test
mvn -B verify
npm run lint --prefix ../frontend
npm run build --prefix ../frontend
docker compose -p tvu-epic4-smoke -f infra/docker-compose.app.yml up -d --build
```

Smoke flow through gateway:

1. Super Admin creates a club and organizer.
2. Organizer creates/opens an event.
3. Students complete profiles and submit more PENDING reservations than capacity.
4. Organizer approves concurrently; issued tickets equal capacity exactly.
5. Availability reaches zero and never becomes negative.
6. RabbitMQ delivers reservation and audit messages with stable message IDs.
7. Valid QR checks in once; second scan returns 409.
8. Attendee JSON/CSV and auth audit rows match issued/check-in state.

Gate: no completion claim until all commands and smoke assertions pass.

## Review and commit loop

For every work package:

1. Write or update the failing acceptance test (RED).
2. Implement only the package scope (GREEN).
3. Run focused tests and inspect the diff.
4. Review invariants, transaction boundaries, RBAC, migration safety, and API compatibility.
5. If any review/test fails, do not commit; fix and repeat from step 3.
6. Commit one passing work package with a conventional English message.
7. After all packages, run WP9 and open a PR. CI failure blocks merge and restarts the review/fix/check cycle.

## Definition of done

EPIC 4 is complete only when T4.1-T4.17 are implemented, all required correctness tests pass, the Docker
gateway smoke flow passes, frontend-facing API status is updated, CI is green, review has no unresolved
findings, and the EPIC 4 PR is merged into `main`.
