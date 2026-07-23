# Cross-feature contracts

Single source of truth for data shared **between features**: the internal JWT, JWKS discovery, the CSRF
token, the QR payload, and the RabbitMQ message and audit schemas. Define once here; every feature
implements against this. (Also the input for GitNexus `group_sync`.)

Referenced from [CLAUDE.md](../CLAUDE.md). When a contract changes, update this file **first**, then the
implementations on both sides.

> **The five services are gone.** `auth`, `event`, `ticket` and `notification` are packages inside one
> Spring Boot deployable (`vn.edu.tvu.*`, composed by `MonolithApplication`), and the API gateway was
> deleted with it. Nothing below crosses a network boundary any more — these are contracts between
> packages, plus the two that genuinely still travel: the browser cookie pair and the one RabbitMQ
> message. Anything describing a service port or a service-to-service HTTP call is out of date; say so
> rather than implementing it.

---

## 1. Internal JWT

- **Algorithm:** RS256. Minted by `InternalJwtService` and validated by the single `SecurityConfig`
  (`vn.edu.tvu.auth.security`), which builds its `JwtDecoder` from the in-process public key — not from a
  network JWKS fetch. `RsaKeyManager` owns the key pair.
- **Transport:** HttpOnly cookie `TVU_AUTH`. `SecurityConfig`'s `BearerTokenResolver` accepts either the
  `Authorization: Bearer` header (API clients) or that cookie (browsers). There is no gateway rewriting one
  into the other.
- **TTL:** short (`JWT_TTL`, default 15m). Logout is stateless — it only clears the cookie; the token stays
  valid until `exp`. No server-side denylist in the MVP (accepted risk, mitigated by the short TTL).

### Claims

| Claim     | Type            | Present for            | Meaning                                                       |
|-----------|-----------------|------------------------|---------------------------------------------------------------|
| `sub`     | string          | all                    | userId (`users.id`)                                           |
| `email`   | string          | all                    | account email                                                 |
| `roles`   | string[]        | all                    | any of `SINH_VIEN`, `ORGANIZER`, `SUPER_ADMIN`                |
| `club_id` | string          | ORGANIZER only         | club the organizer is bound to (multi-tenant scope)           |
| `mssv`    | string          | students w/ profile    | student ID; absent until profile completed                    |
| `jti`     | string (unique) | all — **required**     | unique per token; binds the CSRF token (§3)                   |
| `exp`     | number (epoch)  | all                    | expiry                                                        |
| `iss`     | string          | all                    | must match `JWT_ISSUER_URI` exactly                           |

`roles` is a list but only ever holds one element — `UserRole` (`vn.edu.tvu.shared.domain`) is a single
value on `users.role`. `JwtGrantedAuthoritiesConverter` maps it to `ROLE_*` authorities.

### `profileComplete`

Derived, not a JWT claim: `true` when the user has an `mssv`. Students must be `profileComplete` before
`POST /api/reservations` (anti-fake-registration, invariant #3). When a student completes their profile the
JWT is **re-minted** so the new `mssv` claim is present.

---

## 2. JWKS / OIDC discovery

- `GET /.well-known/jwks.json` — RSA public key set.
- `GET /.well-known/openid-configuration` — minimal OIDC discovery document.

Both are public (`SecurityConfig` permits `/.well-known/**`). **Nothing inside the application consumes
them** — the decoder uses the in-process public key directly. They exist for external tools only; treat
them as a public API surface, not as internal plumbing.

---

## 3. CSRF token (signed double-submit)

- **Value:** `HMAC-SHA256(CSRF_SIGNING_SECRET, jti + exp)` of the current JWT.
- **Cookie:** `XSRF-TOKEN` (readable by JS, **not** HttpOnly). Header on mutating requests: `X-XSRF-TOKEN`.
- **Verified by** `CookieCsrfFilter`, registered after `BearerTokenAuthenticationFilter`: cookie == header
  **and** HMAC valid **and** `jti`/`exp` match the JWT in use. Both comparisons use
  `MessageDigest.isEqual`.
- **Only applies to cookie-authenticated requests.** A request carrying a bearer token and no `TVU_AUTH`
  cookie is not CSRF-checked — CSRF is a browser-cookie problem.
- **Exemptions:** `GET`/`HEAD`/`OPTIONS`; `POST /api/auth/login` (no JWT exists yet); and
  `POST /api/auth/logout` — the token is bound to the JWT's `exp`, so once that passes the check can never
  succeed again, and the cookie is HttpOnly, which would strand the user in a session they cannot end.
- **`CSRF_SIGNING_SECRET`:** minted and verified in the same process. Required from env in prod
  (`ProductionSecretsValidator` rejects a blank value or the dev default); dev default in
  `application-dev.yml`.

---

## 4. QR payload

- **Value:** HMAC-SHA256-signed string containing `ticket_id`, `event_id`, `exp`.
- **`exp`:** taken from `eventEndAt` in the message snapshot (§5) — never a lookup back to the event.
- **Signed by** `notification` (`QrSigner`) when issuing the ticket; **verified by** `ticket`
  (`QrPayloadVerifier`) at check-in.
- **Shared secret:** `QR_SIGNING_SECRET`, bound twice — `tvu.notification.qr.signing-secret` and
  `tvu.ticket.qr.secret`. Both must resolve to the same value or check-in rejects every ticket.
- Generated locally with ZXing — never a third-party QR API (the ticket payload must not leave the system).

---

## 5. RabbitMQ messages

- **Exchange:** topic exchange `tvu.events` (durable), declared **once** from `tvu.messaging.exchange`
  (`MessagingProperties`). Both the publisher (`ConfirmedRabbitPublisher`) and the binding
  (`NotificationRabbitConfig`) read that one property.
- **AMQP `message-id`** = `outbox.message_id` (a dedicated UUID column, **not** `outbox.id`). This is the
  consumer idempotency key.
- **`reservation.approved` is the only message on the broker.** Audit no longer goes through RabbitMQ
  (§6).

### `reservation.approved`

Published by `ticket` via the transactional outbox after an approval commits, and consumed by
`notification` to send the ticket email. Payload is self-contained (a snapshot — the consumer never calls
back):

```json
{
  "reservationId": "...",
  "ticketId": "...",
  "eventId": "...",
  "studentId": "...",
  "studentEmail": "...",
  "studentMssv": "...",
  "eventTitle": "...",
  "eventStartAt": "2026-07-02T09:00:00Z",
  "eventEndAt": "2026-07-02T11:00:00Z",
  "eventLocation": "..."
}
```

`eventEndAt` is the QR expiry. The record is `vn.edu.tvu.shared.messaging.ReservationApprovedMessage` —
one type shared by producer and consumer, so the two sides cannot drift.

This stays asynchronous on purpose even though both ends are in one process: sending mail is slow and
fails for reasons that have nothing to do with the approval, and the outbox plus the dead-letter queue is
what stops a failed send from either losing the ticket or rolling back the approval.

---

## 6. Audit events

**In-process and transactional. Not a message.** `event` and `ticket` depend on
`vn.edu.tvu.shared.audit.AuditRecorder`; `AuditLogService` (in `auth`) implements it and writes to
`audit_log` in the caller's transaction.

Signature: `recordAudit(actorId, action, targetType, targetId, detail)`. Actions in use:
`CREATED`/`UPDATED`/`STATUS_CHANGED`/`DELETED` (target type `EVENT`), and `audit.ticket.approve`,
`audit.ticket.reject`, `audit.ticket.check-in`, plus the `auth.club.*` / `auth.organizer.*` entries the
admin service writes directly.

This used to be a broker round trip: both features published `audit.*` to `tvu.events` and `auth` consumed
from a queue bound with `audit.#`. Every hop was inside one JVM. Two things were bought back by removing
it — the audit row now commits or rolls back with the change it describes (the old event-side publish was
best-effort and logged a warning on failure, so an event could commit with its audit entry silently
dropped), and the `message_id` dedup the consumer needed to survive redelivery is gone with the
redelivery. The trade: an audit write failure now fails the operation. For an audit log that is the
correct direction.

`audit_log.message_id` remains in the schema, nullable and unused by the current path.

---

## 7. Foreign keys

`V7__foreign_keys_across_features.sql` adds what the database-per-service split had made impossible:
**structural** references now hold — a ticket's `event_id`/`club_id`/`student_id`, a reservation's
`event_id`/`club_id`/`student_id`, an inventory's `event_id`/`club_id`, an event's `club_id`. No
`ON DELETE` behaviour is declared, so deleting a structurally-referenced row fails loudly rather than
cascading away ticket history.

**Actor** references are deliberately left unconstrained: `audit_log.actor_id`, `events.created_by` and
`reservations.reviewed_by`. They record *who did it*, and an audit trail must outlive the account that
caused it — the same reason `audit_log.actor_id` was never constrained. Concretely this means deleting an
organizer who once created an event or approved a reservation succeeds (leaving those actor columns
pointing at a now-absent user, exactly like a historical audit row), instead of raising a foreign-key
violation the auth module would surface as 500. The auth `GlobalExceptionHandler` still maps any
*structural* violation (e.g. deleting a student who has reservations) to a clean `409`, not a 500.

Not enforced: that a child's `club_id` matches its event's `club_id`. That needs a composite foreign key;
the service layer scopes every club-bound query instead.

---

## Shared secrets / env summary

| Name                  | Used by                                                 | Dev default location    |
|-----------------------|---------------------------------------------------------|-------------------------|
| `JWT_ISSUER_URI`      | token issuer and resource server (same process)         | `http://localhost:8080` |
| `CSRF_SIGNING_SECRET` | `CsrfTokenService` (mint) ↔ `CookieCsrfFilter` (verify) | `application-dev.yml`   |
| `QR_SIGNING_SECRET`   | `notification` (sign) ↔ `ticket` (verify)               | `application-dev.yml`   |
| `MICROSOFT_TENANT_ID` | `MicrosoftIdentityProvider` — pins the `tid` claim      | prod only               |
