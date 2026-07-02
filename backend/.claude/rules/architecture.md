---
description: Kiến trúc & bất biến (invariants) của backend — always-load qua @import trong CLAUDE.md
---

# Architecture — TVU Event & Ticket backend

The Maven multi-module reactor is **scaffolded and compiles** (`mvn clean install` passes): 5 services, layer-based
packages, Flyway, dev/prod profiles. Business logic is being filled in per the plan. The proposal
[../../decuongTVUEventTicket.md](../../decuongTVUEventTicket.md) is the authoritative spec (Vietnamese).

## Working scope — backend/ only (IMPORTANT)

The user only works on the backend. **Keep all Claude Code tooling — skills, agents, commands, hooks, settings,
MCP indexes (e.g. GitNexus) — confined to this `backend/` directory.** Do not touch `.claude/`, `CLAUDE.md`, or
similar tooling at the repo root or in `frontend/` (the teammate's workspace) unless explicitly asked. The only
root-level exception is `.github/workflows/*.yml` (GitHub Actions only reads workflows from the repo root).
Point tools that default to the git root back at `backend/` (e.g. GitNexus `--skip-git`).

## Services & data ownership

| Service | Port | Owns |
|---|---|---|
| `api-gateway` | 8080 | CORS, JWT auth, RBAC, rate limiting, routing (no DB) |
| `auth-service` | 8084 | identity, users, **clubs**, RBAC, audit log; issues internal JWT (RS256) + JWKS |
| `event-service` | 8081 | events (`club_id` stored as a value, not a cross-service FK) |
| `ticket-service` | 8082 | reservations, tickets, check-in, outbox; Redis counter |
| `notification-service` | — | consumes RabbitMQ, generates signed QR, sends email (no business table) |

Each service uses **layer-based** packages under `vn.edu.tvu.<svc>`
(`controller/service/repository/domain/dto/mapper/config/security/exception`) with `@SpringBootApplication` in
the root package. Schema is **Flyway**-managed (`db/migration/`, immutable versions; Hibernate
`ddl-auto: validate`). Config: `application.yml` (common, default `dev`) + `application-{dev,prod}.yml`. Three
logical Postgres DBs: `tvu_auth`, `tvu_event`, `tvu_ticket`. Monorepo rationale (§6.1): one repo so an API
change and its frontend consumer land in the same PR.

## Tech stack

- **API Gateway**: Spring Cloud Gateway — single entry point for CORS, JWT, RBAC, rate limiting.
- **Services**: Java 21 Spring Boot. Loosely coupled, communicate asynchronously via the broker.
- **Atomic counter / lock**: Redis (ticket-remaining counter, rate-limit counter).
- **Async messaging**: RabbitMQ (CloudAMQP), Topic Exchange + Dead Letter Queue.
- **Transactional DB**: PostgreSQL (Neon).
- **Analytics warehouse**: Oracle ADW (stretch).
- **Auth**: Microsoft Identity Platform (MSAL, **multi-tenant — any Microsoft account**, not `@tvu.edu.vn`; see
  invariant #3) → auth-service issues an internal RS256 JWT (JWKS-validated). Pluggable provider (`DevStub` dev/test,
  `Microsoft` prod).
- **Frontend** (teammate): React, TypeScript, Recharts, Cloudflare Pages, PWA (browser-camera QR scan).
- **Packaging/CI**: Docker, GitHub Actions. Runs on Oracle Cloud Always Free (Ampere A1 / ARM).

## Critical design decisions (the invariants that make this project work)

These are the non-obvious rules the proposal commits to. Preserve them; they are the point of the whole project.

1. **Reservation is atomic and happens at APPROVAL time, not at submit time.** A student clicking "register"
   only creates a `PENDING` row and **deducts no ticket**. When an organizer approves, the system does the
   atomic `Redis DECR` on the event's remaining-ticket counter (Lua script if needed); a negative result →
   "sold out", the registration stays pending. Only on success does it go `APPROVED`, publish to RabbitMQ, and
   issue the ticket. Registration lifecycle: `PENDING → APPROVED | REJECTED`. (Proposal §6.3, §6.11)

2. **Overbooking defense is layered.** Redis DECR is the primary atomic guard; a JPA optimistic lock
   (`@Version`) on the ticket write in PostgreSQL is the second layer in case Redis fails. Fallback if Redis is
   dropped for time reasons: `SELECT ... FOR UPDATE`.

3. **Anti-fake-registration relies on identity, not IP.** Every registration is tied to an authenticated
   login (no anonymous/manual entry). Dedup via a DB `UNIQUE(event_id, student_id)` constraint
   (max 1 ticket/event/account) plus an idempotency key per request. **IP rate limiting at the gateway is only
   for spam/bot protection — never for identity or "block re-registration"** (shared campus Wi-Fi/NAT would
   false-positive). Do not add IP-based blocking as an identity mechanism.

   **Revised for multi-tenant login (§6.8 deviation):** any Microsoft account can register, so mitigations are
   (a) partial unique index `UNIQUE(mssv) WHERE mssv IS NOT NULL`; (b) mandatory `profileComplete` before
   `POST /api/reservations`; (c) `mssv_status [UNVERIFIED|VERIFIED]` for later manual verification (auto MSSV
   verification isn't possible without the school tenant — note this limitation in the report).

4. **RBAC + per-club multi-tenancy.** Three roles: `SINH_VIEN` (student), `ORGANIZER` (bound to a `club_id`),
   `SUPER_ADMIN` (school admin). An organizer's queries are always scoped by the `club_id` embedded in their
   JWT; the gateway and services enforce role + `club_id` on every request so one club cannot see another's
   data. Each organizer gets an individual account under a shared club (for audit-log traceability), not one
   shared login. School admin provisions/locks/deletes club accounts. (§6.11)

5. **QR safety.** QR payload is never raw data — it is HMAC-SHA256-signed (or a short-lived JWT) containing
   `ticket_id`, `event_id`, expiry. Check-in is a single-use atomic update: `SET status = CHECKED_IN WHERE
   status = 'VALID'` so a screenshotted ticket can't be scanned twice. (§6.6)

6. **Frontend/backend DTOs are generated, never hand-written.** Backend exposes OpenAPI via `springdoc-openapi`;
   frontend generates TS types with `openapi-typescript` (or `orval`) in CI. Do not hand-define shared types. (§6.7)

7. **CORS + JWT are centralized at the gateway**, not per-controller. Uses `allowCredentials: true` with
   explicit `allowedOrigins` (never `*`), JWT carried in an HTTP-only cookie. (§6.2)

8. **Resource-constrained by design.** Services must run on minimum published free-tier resources, so JVM flags
   are mandatory when running Spring Boot containers: `-XX:+UseSerialGC`, `-Xss256k` (or 512k),
   `-XX:MaxRAMPercentage=70.0`, plus `spring.main.lazy-initialization=true` and `server.tomcat.threads.max=20`.
   Do not store blobs/images in Postgres (Neon storage cap) — store metadata only. CloudAMQP free tier limits
   (~1M msg/month, ~20 connections, ~100 queues) require consumers fast enough to avoid backlog. (§6.5, §7)

## MVP cut lines (if timeline slips)

Per §9, the fallback order is: merge Notification-Service into Ticket-Service; trim Dashboard/ADW analytics.
Always preserve the core flow: **register → QR → check-in**.
