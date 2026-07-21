# Session: merge the UI branch, close the EPIC UI dashboard API contract (TU.3, TU.4, TU.5)

**Date:** 2026-07-17
**Starting commit:** `ea6dcc9` (tip of `hlow` at session start)
**Ending commit:** `f0c7147`

## Summary

Merged `origin/feature/login-ui` into `hlow` (a clean fast-forward — the UI branch already contained all of
EPIC 5 and EPIC 6), then closed EPIC UI.

Checking EPIC UI's scope against the code rather than against the progress table turned up a third gap nobody
had recorded: `BACKEND_STATUS_FOR_FRONTEND.md` listed the attendee JSON API as available, and an endpoint did
exist, but `TU.4`'s acceptance criteria (`status`, `keyword`, `page`, `size`, `sort`) were entirely
unimplemented — the endpoint returned a bare, unfiltered list and the frontend compensated by filtering
client-side, which is the exact load TU.4 exists to prevent. So the epic closed three gaps, not two.

Delivered via `brainstorming` → `writing-plans` → `subagent-driven-development`, run **sequentially** on
purpose: EPIC 6's parallel dispatch on a shared working directory had interleaved two agents' commits, and
sequential execution avoided that entirely this time. Five tasks, each with a fresh implementer and a two-stage
review, then a whole-branch review on the most capable model. Final verdict: ready to merge, no
Critical/Important outstanding.

## Changes (git-verified)

- `3513ac4`, `277c189` feat(ticket-service): paginated, filterable attendee query and endpoint (TU.4). Converted
  `findAttendees` from a native query to JPQL because Spring Data JPA does not support dynamic `Sort` on native
  queries. `Ticket` has no JPA association to `Reservation`, so the query needed an explicit
  `join Reservation r on r.id = t.reservationId` — the plan's original comma cross-join failed, since Spring
  Data's sort aliasing only recognizes explicit join aliases. Introduced the project's first pagination
  pattern: a `PageResponse<T>` record plus a `PageableFactory` enforcing a hard size cap of 100 and a sort
  whitelist, both returning 400 on violation.
- `9e449d7` fix(ticket-service): return 400, not 500, for an invalid `TicketStatus` query param — the new enum
  binding hit `GlobalExceptionHandler`'s catch-all `Exception` handler, reporting a malformed client parameter
  as a server error.
- `5de35f5` feat(ticket-service): TU.3 event operations dashboard. `remaining` delegates to
  `TicketingService.availability()` rather than recomputing it, since that method's seed-if-missing and
  negative-counter fallback is subtle and a copy would drift. Added the matching `SecurityConfig` rule so the
  path does not fall through to `anyRequest().authenticated()`.
- `48359e8`, `393c2d0` feat/test(auth-service): TU.5 paginated audit log. Uses a LEFT JOIN onto `users` so
  entries with a system or deleted actor still return with `actorEmail = null`. The time-window predicates use
  `a.createdAt >= coalesce(:from, a.createdAt)` instead of `(:from is null or ...)` — the latter fails on real
  Postgres, which cannot infer an `Instant` parameter's type when the same named parameter also appears in a
  typed comparison. Safe here because `created_at` is NOT NULL at both the DB and entity level.
- `f1547c1` fix(frontend): consume the paginated attendee contract and move search server-side.
- `6975692` test: assert both new paths appear in the generated OpenAPI specs, which the frontend generates its
  types from.
- `7cbcb8b` fix(auth-service): return 400 for malformed audit-log query params — auth-service never received
  the type-mismatch handler ticket-service got one commit earlier, so `?actorId=not-a-uuid` returned 500.
- `f0c7147` fix(frontend): surface the searchable attendee fields, show the total, debounce search.

## Decisions & rationale

- **`PageResponse<T>` rather than Spring Data's `Page<T>` on the wire.** Spring warns `Page`'s JSON is unstable
  across versions, and the frontend generates its types from the OpenAPI spec, so an unstable shape becomes a
  broken build later. `Pageable`/`Page` stay at the repository layer; the mapping happens at the controller
  boundary.
- **`PageResponse` and `PageableFactory` are duplicated verbatim in both services, deliberately** — no service
  imports another's code. The drift risk this trades away materialized within the same epic: auth-service
  missed the 400-on-type-mismatch fix its sibling received one commit earlier. The duplication stands, but it
  needs a drift guard.
- **CSV honours the same filters but is never paginated.** An export truncated to one page of 20 is useless,
  and "export what I'm looking at" is what a filtered table implies.
- **Sequential subagent execution, no parallel dispatch.** Slower, but it removed EPIC 6's commit-interleaving
  failure mode outright.
- **Kept `@Testcontainers(disabledWithoutDocker = true)` out of scope** despite it being a live hazard (below).

## What this session got wrong, and how it surfaced

- **The whole-branch review caught a Critical that all five per-task reviews missed, and the plan itself had
  caused it.** TU.4 moved search server-side, where `keyword` matches student email or MSSV only — but
  `mapAttendeeTicket` dropped both fields, the table displayed neither, and the search placeholder still read
  "Vé, student ID...". An organizer following the UI's own instructions got an empty table for an attendee who
  was present: worse than the client-side filter it replaced. Fixed by displaying MSSV and email and correcting
  the placeholder. The lesson generalises: when moving a filter from client to server, verify the fields the
  server can match are the fields the UI displays and advertises.
- **Three separate sources of false green appeared in one epic.** A non-`clean` `mvn test` let stale bytecode
  hide a test class broken by a signature change. `@Testcontainers(disabledWithoutDocker = true)` — inherited
  from the UI branch, and present on five classes including both services' `AbstractPostgresIntegrationTest` —
  skipped tests silently twice when Docker was not running. And a subagent's "tests pass" claim is not evidence
  until verified independently. Every later command used `clean`, and `Skipped: 0` became a required check.
- **The harness's default `Co-Authored-By: Claude` trailer contradicts `backend/.claude/rules/workflow.md`,**
  which forbids all AI attribution. One commit landed with it and was amended out; all ten were then re-scanned.

## Open items / follow-ups

- `@Testcontainers(disabledWithoutDocker = true)` still silently skips five test classes, including the
  overbooking concurrency test that is the core correctness guard for EPIC 4. Not introduced by this epic and
  explicitly scoped out of it, but it produced two false greens here. Fix is a CI-only
  `-Dtestcontainers.required=true`, or dropping the flag and letting CI fail loudly.
- The duplicated `PageResponse`/`PageableFactory` pairs have no drift guard. A CI check diffing the two copies
  would have caught the auth-service 500 before review did.
- `keyword` is not escaped for SQL `%`/`_` before being wrapped in `%...%`. Not an injection (it is a bound
  parameter) and not a scope bypass, but `%` matches everything within the organizer's own club.
- `eventDashboard` reads the inventory row and then calls `availability()`, which reads it again: two round
  trips per request. Accepted cost of not duplicating the seed/fallback logic.
- `MAX_PAGE_SIZE = 100` is not expressed in the OpenAPI schema, so the frontend hardcodes `size=100` instead of
  deriving it.
- The pagination pattern should be documented in `CLAUDE.md` so the next paginated endpoint does not reinvent
  it.
- EPIC 7 (JVM tuning, Docker, CI, monitoring, k6) and EPIC 8 (README/deployment docs, GitNexus re-index) remain
  unstarted.
- `origin/feature/login-ui` is now fully merged into `hlow` and can be deleted once `hlow` reaches `main`.
