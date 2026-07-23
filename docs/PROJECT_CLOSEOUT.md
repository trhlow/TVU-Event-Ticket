# Project close-out

**Status:** EPIC 0–8 completed on branch `hlow` on 2026-07-17. Revised 2026-07-22 — the original text
described a five-service backend and listed follow-ups that have since been fixed; both are corrected
below.

## Delivered scope

- **Modular-monolith Java 25 backend** — one Spring Boot deployable with `auth`, `event`, `ticket` and
  `notification` as feature packages under `vn.edu.tvu`, composed by `MonolithApplication`. It began as
  five services behind an API gateway and was merged on 2026-07-17/20; no gateway or independently
  deployable service remains.
- Cookie-based JWT/CSRF authentication, club-scoped RBAC, event lifecycle and reservation approval.
- Capacity-safe ticket issuance, signed single-use QR check-in, RabbitMQ outbox delivery and ticket email.
- Organizer and SUPER_ADMIN analytics, paginated/filterable attendee export, audit-log API, and read-only
  per-club statistics for super-admin.
- Containerized local stack with health-gated startup, CI builds with skipped-test protection, and a
  documented k6 approval-capacity load test.
- React/Vite frontend with production configuration guards and CI lint/test/build checks.

## Verification record

EPIC 7's measured load run used 500 concurrent organizer approvals against an event capacity of 100. It
issued exactly 100 tickets, left `remaining` at 0, returned 400 clean sold-out responses, and recorded no
unexpected status. Methodology and how to re-run it are in
[backend/load-test/README.md](../backend/load-test/README.md).

For a normal local verification run:

```bash
cd backend
mvn clean verify

cd ../frontend
npm run lint
npm run test
npm run build
```

Testcontainers-backed backend tests are valid only when their output reports `Skipped: 0` — without Docker
they skip silently, so a green run proves nothing on its own. The CI workflow enforces this.

## Resolved since the original close-out

- **Non-atomic inventory creation on first registration** — fixed. When two students open a brand-new event
  simultaneously both insert, and the loser's unique-constraint violation is now absorbed and the committed
  row re-read, instead of surfacing as a conflict that blames the student.
- **CSV formula injection** — fixed. Attendee export prefixes any cell starting with `=`, `+`, `-`, `@`,
  tab or CR with an apostrophe; quoting alone does not stop a spreadsheet evaluating it.
- **Container ran as root** — fixed. The image creates and runs as uid 10001.
- **Production bootstrap safeguards** — a `@Profile("prod")` validator refuses to start on a blank or
  dev-default CSRF secret, or blank JWT keys.

## Remaining follow-ups

- **Organizer credential provisioning.** `User` still has no password or credential field; organizer
  accounts authenticate through the same identity provider as students, so presenting a matching email is
  sufficient. This is the largest open security item — see
  [BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md) item 1.
- **Rate limiting is per client address, not per principal.** `SensitiveFlowRateLimitFilter` allows 10
  `POST /api/auth/login` and 20 `POST /api/reservations` per minute per IP. Students behind the campus NAT
  share a bucket, and approvals are not rate limited at all, so a bulk-approval feature would need its own
  design.
- **The frontend still has a few pending/demo administration pages** despite the corresponding
  analytics/audit APIs being available; an integration task, not a missing backend capability.
- **An SMTP credential and a domain** must be obtained before a real deployment. Everything else in
  `backend/infra/production/.env.example` can be generated locally.

## Operational references

- [Root guide](../README.md)
- [Backend guide](../backend/README.md)
- [Deployment guide](../backend/.claude/docs/deployment.md)
- [Frontend/backend API status](../backend/docs/BACKEND_STATUS_FOR_FRONTEND.md)
