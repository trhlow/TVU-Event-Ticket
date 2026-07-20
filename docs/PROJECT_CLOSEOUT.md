# Project close-out

**Status:** EPIC 0–8 implementation and documentation close-out completed on branch `hlow` on 2026-07-17.

## Delivered scope

- Five-service Java 25 backend: gateway, auth, event, ticket and notification services.
- Cookie-based JWT/CSRF authentication, club-scoped RBAC, event lifecycle and reservation approval.
- Capacity-safe ticket issuance, signed single-use QR check-in, RabbitMQ outbox delivery and email through
  notification-service.
- Organizer and SUPER_ADMIN analytics, paginated/filterable attendee export and audit-log API.
- Containerized local stack with health-gated startup, CI module builds with skipped-test protection, and a
  documented k6 approval-capacity load test.
- React/Vite frontend with production configuration guards and CI lint/test/build checks.

## Verification record

EPIC 7's measured load run used 500 concurrent organizer approvals against an event capacity of 100. It
issued exactly 100 tickets, left `remaining` at 0, returned 400 clean sold-out responses, and recorded no
unexpected status. Full figures and methodology are in
[backend/load-test/RESULTS.md](../backend/load-test/RESULTS.md).

For a normal local verification run:

```bash
cd backend
mvn clean verify

cd ../frontend
npm run lint
npm run test
npm run build
```

Testcontainers-backed backend tests are valid only when their output reports `Skipped: 0`. The CI workflow
enforces this for changed backend services.

## Remaining follow-ups

- The first registration for a brand-new event has a documented non-atomic inventory creation race; see the
  EPIC 7 session record for details.
- Gateway rate limiting is per authenticated principal, so a real bulk-approval feature needs an operational
  design that accounts for the organizer's 10-request/second bucket.
- Organizer credential provisioning (password or invitation), stricter production bootstrap safeguards, CSV
  formula neutralization and non-root container execution remain security hardening work; see
  [BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md).
- The frontend still has a few pending/demo administration pages despite the corresponding analytics/audit
  APIs now being available; this is an integration task rather than a missing backend capability.

## Operational references

- [Root guide](../README.md)
- [Backend guide](../backend/README.md)
- [Deployment guide](../backend/.claude/docs/deployment.md)
- [Frontend/backend API status](../backend/docs/BACKEND_STATUS_FOR_FRONTEND.md)
