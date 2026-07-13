# EPIC 5 implementation plan - notification-service QR, email, idempotency, and DLQ

## Objective

Complete the asynchronous delivery flow after ticket approval: consume `reservation.approved`, generate a
ticket-service-compatible signed QR image, send one HTML email with the QR, safely handle redelivery and
concurrent consumers through Redis idempotency, and route poison messages to an observable DLQ. The consumer
must use only the event snapshot in the message and must never call event-service.

## Entry criteria

- EPIC 0-4 are merged and their full Maven, frontend, and Docker gateway gates are green.
- `ticket-service` publishes durable `reservation.approved` messages through its outbox with AMQP
  `message-id = outbox.message_id`.
- `.claude/docs/contracts.md` remains the source of truth for message and QR formats.
- Work starts on a new `feat/epic5-notification-service` branch from updated `main`.
- `QR_SIGNING_SECRET` is shared by notification-service and ticket-service in every environment.

## Baseline and gaps

The module currently has Spring AMQP, Mail, ZXing, actuator, error response scaffolding, and a RabbitMQ
Testcontainers foundation. It does not yet declare broker topology, consume messages, sign or render QR codes,
compose MIME mail, deduplicate delivery, expose DLQ metrics/logging, or provide EPIC 5 tests. Docker Compose
also does not yet wire Redis, QR/mail environment, or a local SMTP sink to notification-service.

## Architecture decisions

1. Keep the wire contract explicit with a local `ReservationApprovedMessage` DTO matching
   `.claude/docs/contracts.md`; reject missing `message-id` and invalid required fields.
2. Declare durable topic exchange `tvu.events`, durable main queue, DLX, and DLQ as Spring beans. Bind the
   main queue to `reservation.approved`; failed messages are rejected without infinite requeue.
3. Preserve the verifier format already owned by ticket-service:
   `ticketId:eventId:expEpochSeconds:hex(HMAC-SHA256(unsignedPayload))`.
4. Set QR `exp` only from message `eventEndAt`. Notification-service never calls event-service.
5. Use Redis two-key idempotency from the master plan: `done:{message-id}` for 30 days and a short-lived
   `lock:{message-id}` acquired with atomic `SET NX`. Set done only after mail succeeds; release the lock on
   failure so retry cannot lose email.
6. A duplicate after successful delivery is acknowledged without sending again. A concurrent delivery that
   cannot acquire the lock is rejected/retried, not marked done.
7. Keep mail composition separate from transport so MIME content is testable without a real SMTP server.
8. Log structured DLQ context and increment a Micrometer counter without logging secrets or the QR signature.

## Work packages and gates

### WP1 - Configuration and RabbitMQ topology (T5.1)

Implementation:

- Add typed configuration properties for queues, QR signing, idempotency TTLs, and sender identity.
- Add Redis dependency and configuration; wire Redis and shared QR secret in dev/prod and Docker Compose.
- Declare `tvu.events`, notification queue, dead-letter exchange, dead-letter queue, and bindings as durable.
- Configure JSON conversion, manual/controlled acknowledgement behavior, and
  `default-requeue-rejected: false`.

Tests/acceptance:

- Application context starts with RabbitMQ and Redis Testcontainers.
- Topology names, durability, routing key, and dead-letter arguments match configuration.
- An intentionally failing delivery reaches the DLQ once and does not loop on the main queue.

Gate: review topology ownership, environment defaults, and retry semantics; commit only when real-broker tests pass.

### WP2 - Signed QR payload and image generation (T5.2)

Implementation:

- Implement `QrSigner` with HMAC-SHA256 and constant, typed UTF-8/hex encoding.
- Parse `eventEndAt` as an `Instant`; use its epoch seconds as `exp`.
- Implement ZXing PNG generation and decoding support used by tests.
- Keep secrets in properties/environment only and never log the signed payload.

Tests/acceptance:

- Signer output is accepted by the ticket-service verifier using the same test secret.
- Tampering with ticket, event, expiry, or signature is rejected by the verifier.
- Generated PNG decodes to the exact signed payload.
- `exp` equals the message `eventEndAt` snapshot exactly.

Gate: contract/security review; commit after round-trip and image tests pass.

### WP3 - MIME email composition and transport (T5.4)

Implementation:

- Build a localized HTML ticket email containing event title, start/end, location, student information, and
  an inline or attached PNG QR with a stable content ID/filename.
- Add a `TicketMailSender` boundary backed by `JavaMailSender`.
- Configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, TLS/auth flags, and sender address.

Tests/acceptance:

- MIME test proves recipient, subject, HTML body, UTF-8 content, and QR attachment/inline part are correct.
- SMTP transport failure is propagated to the consumer and is never converted to success.

Gate: content/privacy and failure-propagation review; commit after MIME tests pass.

### WP4 - Idempotent reservation-approved consumer (T5.3, T5.5)

Implementation:

- Validate AMQP `message-id` and deserialize the self-contained approval snapshot.
- Processing order: check done -> acquire lock -> sign/render QR -> compose/send mail -> set done for 30 days ->
  release lock/acknowledge.
- On any failure, do not set done; release the lock best-effort and reject so broker retry/DLQ remains possible.
- Make lock and done operations atomic through a focused Redis service; include owner tokens so one worker cannot
  release another worker's lock.

Tests/acceptance:

- Consumer integration test runs message -> QR -> MIME mail end-to-end with mocked mail transport.
- Redelivery after success sends no second email.
- Redelivery after send failure retries and can send successfully later.
- Two concurrent deliveries for one message ID produce one email.
- Different message IDs are processed independently.
- Missing message ID and malformed payload fail into DLQ.

Gate: review ordering and every crash window; commit only after Redis and broker integration tests pass repeatedly.

### WP5 - DLQ observability (T5.6)

Implementation:

- Add a dedicated DLQ listener that records message ID, routing key, failure headers, and delivery count as
  structured logs without replaying into the main queue.
- Add Micrometer counters for processed, duplicate, failed, and DLQ messages.
- Expose metrics through actuator under the existing management policy.

Tests/acceptance:

- A dead message increments the DLQ counter and emits one inspectable structured log entry.
- The DLQ listener does not block or republish to the main processing queue.

Gate: operability and sensitive-data review; commit after log/metric assertions pass.

### WP6 - Total verification and delivery (T5.7)

Required automated suite:

- QR sign/verify/image round-trip and event-end expiry.
- MIME composition and SMTP failure.
- Rabbit topology, main consumer, DLQ, and poison messages.
- Redis success deduplication, failure retry, lock ownership, TTL, and concurrent consumers.
- Configuration validation for dev/prod-required secrets.

Required commands:

```bash
mvn -B -pl notification-service -am test
mvn -B verify
npm run lint --prefix ../frontend
npm run build --prefix ../frontend
docker compose -p tvu-epic5-smoke -f infra/docker-compose.app.yml up -d --build
```

Docker smoke assertions:

1. All service, PostgreSQL 18.4, Redis, RabbitMQ, and local SMTP sink health checks pass.
2. Approving a reservation publishes one `reservation.approved` with a stable message ID.
3. Notification-service sends one email whose QR decodes and passes ticket-service check-in.
4. Republishing the same message ID does not send another email.
5. Simulated SMTP failure does not create a done key; retry succeeds after SMTP recovery.
6. A poison message lands in the DLQ and appears in logs/metrics without blocking valid messages.
7. Update `BACKEND_STATUS_FOR_FRONTEND.md` with notification availability and any UI integration contract.

Gate: no completion claim until all commands and smoke assertions pass.

## Review and commit loop

For each work package:

1. Add or update a failing acceptance test.
2. Implement the smallest package scope needed to pass.
3. Run focused tests and inspect the diff.
4. Review message contracts, idempotency crash windows, secret handling, privacy, and broker behavior.
5. If review or tests fail, fix and repeat from step 3; do not commit a failing package.
6. Commit the passing package with a conventional English commit message.
7. After WP6, push the branch and open a ready PR. CI failure blocks merge and restarts review/fix/test.
8. Merge only after CI is green and no review findings remain; verify post-merge `main` CI.

## Definition of done

EPIC 5 is complete only when T5.1-T5.7 are implemented, mail is sent exactly once per successful message ID,
failed mail remains retryable, signed QR is compatible with ticket-service, poison messages reach an observable
DLQ, full tests and Docker smoke pass, frontend status is current, the PR is merged, and post-merge CI is green.
