# Session: EPIC 5 Docker E2E fixes, EPIC 6 analytics (subagent-driven), branch cleanup

**Date:** 2026-07-15 09:21 (local; work spanned into the evening of 2026-07-14)
**Starting commit:** `6a371c0` (tip of `feat/epic5-notification-service` at session start; this log covers
only this conversation — EPIC 0-4 and the `feature/login-ui` history predate it and already have their own
PR-merge trail in git, so they are not re-narrated here)
**Ending commit:** `ea6dcc9`

## Summary

Created the `hlow` branch (from the tip of `feat/epic5-notification-service`) as the new single working branch
per updated project convention, replacing the earlier one-branch-per-epic pattern. Re-verified EPIC 5
(notification-service) against a real `docker compose` stack — not just the Testcontainers suite — and found
three bugs that made the previously-claimed "100% complete, Docker smoke passed" status false: a crash-on-boot
race with RabbitMQ, a JSON double-encoding bug in the outbox publisher that silently broke every
`reservation.approved` and `audit.ticket.*` message, and a missing retry-before-DLQ path. Fixed and
re-verified all three end-to-end (login → approve → RabbitMQ → notification-service → signed QR → email with
inline QR received in Mailpit). Then ran EPIC 6 (lightweight analytics: a per-club organizer dashboard and
three SUPER_ADMIN school-wide stats slices) through the full brainstorming → writing-plans →
subagent-driven-development flow, which surfaced and fixed two pre-existing gateway/service route-ordering
RBAC bugs before any endpoint code was written. Session ended with a final whole-branch review (ready to
merge, no Critical/Important findings) and branch cleanup (deleted the now-fully-merged
`feat/epic5-notification-service`, kept `feature/login-ui` after finding it holds ~4,300 lines of unmerged
frontend work).

## Changes (git-verified)

- `240fae8` fix: retry transient notification failures before DLQ — enabled Spring AMQP's stateless listener
  retry (5 attempts, 500ms initial backoff, x2 multiplier, 5s cap) so a one-off SMTP/lock-contention failure
  recovers in place instead of going straight to the DLQ on the first attempt.
- `78e9ecb` fix: stop notification-service crashing when RabbitMQ isn't ready yet — removed a redundant, eager
  `ApplicationRunner` + manual `RabbitAdmin` in `NotificationRabbitConfig` that force-connected synchronously at
  boot; Spring Boot's autoconfigured `RabbitAdmin` already declares `@Bean` topology lazily and resiliently
  (same pattern already used by `ticket-service`'s `TicketRabbitConfig`).
- `98ce286` fix: stop double-encoding outbox messages published to RabbitMQ — `ConfirmedRabbitPublisher` was
  calling `convertAndSend(payload_string, ...)` on an already-JSON-serialized `String`, which the
  `MessageConverter` re-serialized into a quoted JSON string a second time; every `reservation.approved` and
  `audit.ticket.*` message failed to deserialize on the consumer side as a result. Fixed by building the AMQP
  `Message` from the payload's raw UTF-8 bytes and sending via `RabbitOperations#send`, bypassing the converter.
- `d9cb3e5` docs: correct EPIC 5 status after real Docker E2E re-verification — replaced the prior (inaccurate)
  "100%/Docker smoke passed" claim in `BACKEND_STATUS_FOR_FRONTEND.md` with the three bugs found and the actual
  E2E evidence (Mailpit-verified email with inline QR).
- `59c94ec` docs: add EPIC 6 analytics design — brainstormed spec: live-query aggregation (no
  materialized/cached summary table), club-wide 30-day zero-filled registration series, `checkInRate` null on
  divide-by-zero, endpoint ownership per the existing data-ownership split, and two gateway route-ordering bugs
  found by reading `GatewaySecurityConfig` + each service's `SecurityConfig` before writing any code.
- `1400fe4` docs: add EPIC 6 implementation plan — 6 bite-sized tasks with complete code for every step, a
  parallelization guide (Task 1→2 sequential on ticket-service; Task 3/4/5 parallelizable; Task 6 last), for
  execution via `subagent-driven-development`.
- `9b42cec` fix(api-gateway): require SUPER_ADMIN for GET /api/ticketing/stats and /api/events/stats — two
  route-ordering RBAC bugs found during design review: the ORGANIZER catch-all for `/api/ticketing/**` matched
  before any SUPER_ADMIN rule (would 403 a SUPER_ADMIN), and the public GET rule for `/api/events/**` matched
  before any SUPER_ADMIN rule (would let anyone call `/api/events/stats` with no auth).
- `bc4c130`, `e798e24`, `2de6e56` — repository aggregate queries added per service: club-scoped reservation/
  ticket counts + daily registration grouping (ticket-service), user-count-by-role (auth-service),
  event-count-by-status (event-service).
- `65292d6`, `113e01f` — `AdminManagementService.stats()` and `EventService.stats()`, each zero-filling every
  enum value before overlaying real counts.
- `6712898` fix(event-service): require SUPER_ADMIN for GET /api/events/stats, not public GET — the matching
  service-level fix for the gateway bug above (`/api/events/*` single-segment wildcard was also swallowing
  `/stats`).
- `13fb906` feat(auth-service): expose GET /api/admin/stats (T6.2 slice).
- `6b8f15e` feat(ticket-service): add T6.1 club dashboard endpoint (`GET /api/ticketing/dashboard/club`) —
  `DashboardService`, `ClubDashboardResponse`, and (per the plan) `TicketRepository.countByStatus` +
  `TicketStatsResponse` added ahead of Task 2 so it would not be blocked.
- `440f44b` feat(ticket-service): add T6.2 school-wide ticket stats endpoint (`GET /api/ticketing/stats`) —
  reuses Task 1's `DashboardService.ticketStats()`/`TicketStatsResponse` without duplication.
- `ea6dcc9` test: verify EPIC 6 endpoints are exposed in each service's OpenAPI spec — extended all three
  existing `/v3/api-docs` integration tests to assert the four new paths.
- Branch cleanup (no commit): deleted `feat/epic5-notification-service` (local + `origin`) after confirming via
  `git merge-base --is-ancestor` that its single commit is fully contained in `hlow`. Left `feature/login-ui`
  (remote-only) untouched after finding `git diff main origin/feature/login-ui` shows 83 files, +4263/-1695
  lines of unmerged frontend work post-dating its already-merged PR #5 — not safe to delete.

## Decisions & rationale

- **Re-verify "complete" claims by running the actual `docker compose` stack, not just Testcontainers.** Prior
  session documentation claimed EPIC 5 was 100% done with Docker smoke passing; that claim predated a real
  end-to-end run and was false — the notification pipeline was completely non-functional (every message failed
  to deserialize). Testcontainers/unit-test green is necessary but not sufficient evidence.
- **Live aggregate queries for EPIC 6, no materialized/cached summary table.** Rejected pre-computed
  scheduled-job aggregation as unneeded complexity at this data scale (single university, low-thousands of
  rows) — matches the project's existing "nhẹ" (lightweight) framing for analytics.
- **`checkInRate` is `Double`, `null` on zero-denominator** rather than throwing or returning a misleading `0`,
  applied consistently across both the club dashboard and the school-wide ticket stats endpoint (with two
  different, intentional denominators: `checkedIn/approved` for the club view vs. `checkedIn/issued` school-wide
  — both specified in the plan, flagged in final review as a documentation nit, not a defect).
- **Work stays on a single shared branch (`hlow`), no worktree isolation, per updated project convention** —
  this traded off against a real cost during EPIC 6: four subagents committing in parallel to the same working
  directory caused two commits (from two different tasks) to briefly land merged together. The affected
  subagent detected it and split the commits apart with `git reset --soft` (verified non-destructive via `git
  diff --stat` before and after); the session controller independently re-verified via path-scoped `git log`/
  `git diff` per service directory rather than trusting the report, for every task's review package.
- **Kept `feature/login-ui` despite the user's original request to delete it** — found substantial unmerged
  frontend work in it that isn't present in `main` or `hlow`; asked before deleting rather than silently
  narrowing the scope of a destructive request.

## Open items / follow-ups

- `feature/login-ui` still needs a decision: merge its ~4,300 lines of frontend work somewhere, or explicitly
  abandon it. Not resolved this session.
- EPIC 6 final review left 5 Minor findings, none blocking: two different `checkInRate` denominators sharing
  one field name across DTOs (worth a one-line Javadoc), a few fully-qualified-type-instead-of-import style
  nits traceable to the plan's own sample code, and one tautological repository-test assertion in
  `TicketRepositoryTest.ticketRepositoryCountsAllTicketsByStatusAcrossClubs`.
- EPIC UI's `TU.3` (event operations dashboard) and `TU.5` (audit-log read endpoint) were explicitly scoped out
  of EPIC 6 during brainstorming and remain unimplemented.
- EPIC 7 (JVM tuning, Docker, CI, monitoring, k6 load test) and EPIC 8 (README/deployment docs, GitNexus
  re-index, this kind of session log) are both still unstarted, per the master plan.
- This backend directory's GitNexus index has not been re-run since these commits; per `backend/CLAUDE.md`'s
  standing note, staleness detection is disabled for this backend-scoped index and re-indexing is manual.
