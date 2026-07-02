# Cross-service contracts

Single source of truth for the data shared **between** services: the internal JWT, JWKS discovery, the CSRF
token, the QR payload, and the RabbitMQ message/audit schemas. Define once here; every service implements
against this. (Also the input for GitNexus `group_sync`.)

Referenced from [CLAUDE.md](../../CLAUDE.md). When a contract changes, update this file **first**, then the
implementations on both sides.

---

## 1. Internal JWT

- **Algorithm:** RS256. Issued **and** validated by `auth-service`, which owns the RSA key pair and exposes the
  public key via JWKS (§2). Every other service and the gateway is a resource server pointing its
  `issuer-uri` / `jwk-set-uri` at auth-service.
- **Transport:** HTTP-only cookie (not the `Authorization` header on the browser side). The gateway reads the
  cookie and re-sets `Authorization: Bearer <jwt>` when forwarding to downstream services, so downstream
  services use a standard resource-server config that reads the header. **Do not mix the two approaches.**
- **TTL:** short. Logout is stateless — it only clears the cookie; the token stays valid until `exp`. No
  server-side denylist in the MVP (accepted risk, mitigated by short TTL).

### Claims

| Claim     | Type            | Present for            | Meaning                                                        |
|-----------|-----------------|------------------------|---------------------------------------------------------------|
| `sub`     | string          | all                    | userId (auth-service `users.id`)                              |
| `email`   | string          | all                    | account email                                                 |
| `roles`   | string[]        | all                    | any of `SINH_VIEN`, `ORGANIZER`, `SUPER_ADMIN`               |
| `club_id` | string          | ORGANIZER only         | club the organizer is bound to (multi-tenant scope)          |
| `mssv`    | string          | students w/ profile    | student ID; absent until profile completed                    |
| `jti`     | string (unique) | all — **required**     | unique per token; binds the CSRF token (§3)                   |
| `exp`     | number (epoch)  | all                    | expiry                                                        |
| `iss`     | string          | all                    | must match the resource server's expected issuer exactly     |

**Issuer note:** use **one** fixed `iss` value for both internal and public traffic. If internal and public
hostnames differ, configure a separate internal `jwk-set-uri` but keep `issuer` (the value compared against
`iss`) identical everywhere, or resource servers will reject the token.

### `profileComplete`

Derived, not a JWT claim: `true` when the user has an `mssv`. Students must be `profileComplete` before
`POST /api/reservations` (anti-fake-registration, invariant #3). When a student completes their profile,
auth-service **re-mints the JWT** so the new `mssv` claim is present.

---

## 2. JWKS / OIDC discovery

- `GET /.well-known/jwks.json` — RSA public key set; resource servers validate signatures with it.
- `GET /.well-known/openid-configuration` — minimal OIDC discovery document.
- **Internal service→service calls** hit auth-service directly (`http://auth-service:8084/.well-known/...`),
  not through the gateway. A public `/.well-known/**` route also exists for external tools.

---

## 3. CSRF token (signed double-submit)

- **Value:** `HMAC-SHA256(CSRF_SIGNING_SECRET, jti + exp)` of the current JWT.
- **Cookie:** `XSRF-TOKEN` (readable by JS, **not** HttpOnly). Header on mutating requests: `X-XSRF-TOKEN`.
- **Verify (gateway):** cookie == header **and** HMAC valid **and** `jti`/`exp` match the JWT in use.
- **Exemptions:** `GET` and preflight `OPTIONS`; and `POST /api/auth/login` (no JWT/token exists yet at login).
- **`CSRF_SIGNING_SECRET`:** shared between auth-service (mints) and gateway (verifies). Prod from env; dev
  default in `application-dev.yml`.

---

## 4. QR payload

- **Value:** HMAC-SHA256-signed string containing `ticket_id`, `event_id`, `exp`.
- **`exp`:** taken from `eventEndAt` in the message snapshot (§5) — **never** a call back to event-service.
- **Signed by** notification-service when issuing the ticket; **verified by** ticket-service at check-in.
- **Shared secret:** `QR_SIGNING_SECRET` (both services). Generated locally with ZXing — never a third-party
  QR API (the vé payload must not leave the system).

---

## 5. RabbitMQ messages

- **Exchange:** Topic Exchange `tvu.events` (durable).
- **AMQP `message-id`** = `outbox.message_id` (a dedicated UUID column, **not** `outbox.id`). This is the
  consumer idempotency key.

### `reservation.approved`

Published by ticket-service via the transactional outbox after an approval commits. Payload is
self-contained (a snapshot — the consumer never calls back):

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

`eventEndAt` is the QR expiry.

### Audit events — `audit.<service>.<action>`

Routing keys like `audit.event.create`, `audit.ticket.approve`, on the same `tvu.events` exchange.
event-service and ticket-service **publish**; auth-service **consumes** (queue bound with `audit.#`) and
writes to its central `audit_log`. Every audit message carries an AMQP `message-id` (UUID) so the consumer
can dedup on redelivery.

- **event-service audit is best-effort:** published directly (no outbox); a publish failure only logs, never
  blocks the business action.
- **ticket-service audit goes through the shared outbox** (same relay as `reservation.approved`), so it is
  not lost.

Payload (both services): `{ actorId, action, targetType, targetId, detail, occurredAt }`.

---

## Shared secrets / env summary

| Name                  | Shared between                        | Dev default location        |
|-----------------------|---------------------------------------|-----------------------------|
| `JWT_ISSUER_URI`      | all resource servers ← auth-service   | `http://localhost:8084`     |
| `CSRF_SIGNING_SECRET` | auth-service ↔ gateway                | `application-dev.yml`       |
| `QR_SIGNING_SECRET`   | notification-service ↔ ticket-service | `application-dev.yml`       |
