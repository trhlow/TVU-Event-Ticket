# Session: EPIC 7 — resource config, CI hardening, compose healthchecks, and the overbooking load test

**Date:** 2026-07-17 (continues the same day's EPIC UI session, logged separately in
`2026-07-17_epic-ui-dashboard-contract.md`)
**Starting commit:** `efbf35a`
**Ending commit:** `ed32dc9`

## Summary

Closed EPIC 7. Surveying the code rather than the plan showed most of it already existed from earlier epics —
the Dockerfile was already multi-stage and ARM-compatible, `docker-compose.app.yml` already ran the five
services, CI already built a path-filtered module matrix, and all five services already exposed
`/actuator/health`. The real gaps were the k6 load test (nothing existed), the CI skip-guard, and two hazards
the survey turned up: `docker-compose.app.yml` had **no healthchecks at all**, and CI **had never run for any
of this work** because it only triggered on `main` while every epic since EPIC 5 was developed on `hlow`.

The epic's central result: **the approval path does not overbook under load.** 500 concurrent approvals from
50 VUs against a 100-seat event issue exactly 100 tickets, `remaining` lands at 0, all 400 losers get a clean
409, and the counters reconcile to exactly 500 so nothing vanished unnoticed.

Delivered via `brainstorming` → `writing-plans` → `subagent-driven-development`, sequential. Final
whole-branch review (opus) returned "With fixes" with 4 Important + 3 Minor; all were fixed and the re-review
returned ready to merge.

## Changes (git-verified)

- `803b316` chore(backend): cap tomcat threads at 20 in the four servlet services' `application.yml`, and
  correct the Dockerfile's `-Xss256k` to the plan's `-Xss512k` (256k is aggressive for Hibernate and Spring
  proxy call stacks). `api-gateway` was deliberately left alone — it is reactive (WebFlux/Netty), so a Tomcat
  key there would be dead config. `spring.main.lazy-initialization` was deliberately **not** moved into any
  YAML: it would apply to tests and defer bean-wiring failures from startup to first use, which is another
  false-green mechanism in a project that has had several. It stays a Dockerfile `ENV`, where the constraint
  actually matters.
- `06172fd`, `d4f2f6f` fix(infra): real healthchecks for postgres/redis/rabbitmq and all five services, with
  every `depends_on` gated on `service_healthy`. This is the actual fix for the boot-order race that crashed
  notification-service in EPIC 5 — that was patched at the symptom (removing an eager RabbitMQ connect) while
  the race stayed. The runtime image has no `curl` or `wget`, so the service check uses bash's `/dev/tcp`
  against `/actuator/health`; the exact YAML was verified live to mark a container healthy on `{"status":"UP"}`
  **and unhealthy on `{"status":"DOWN"}`** before being written into the plan.
- `c37c16b` ci: run on `hlow` as well as `main`, build a Docker image per changed module (build-only, no
  registry push), and fail the build when any test was skipped. The guard reads surefire XML externally
  because no Testcontainers flag inverts `disabledWithoutDocker`. The annotation was kept, not removed —
  removing it would break the local build for a teammate without Docker.
- `c0ffd8a` test(load): the fixture seed script — one event at capacity 100 plus 500 registered students,
  built through the public API only.
- `45db286`, `f1edf33` test(load): the k6 approval-race scenario, the runner, and the measured results.
- `76088cd`, `7d4bffc`, `65e88d0`, `273711c`, `ed32dc9`: the final review's fixes (below).

## The result, and what it actually proves

500 approvals, 50 VUs, `shared-iterations`, against capacity 100:

- `approvedCount: 100`, `remaining: 0` — no overbooking, no under-issue.
- `approved=100 soldOut=400 rateLimited=0 unexpected=0 total=500` — every request accounted for.
- 500 iterations in **1.9s** (~258 req/s), p95 398.21ms, zero 5xx.

**But the mechanism is not what the first draft of the report claimed.** `TicketReservationService.approve()`
takes `findLockedByEventId` — `@Lock(PESSIMISTIC_WRITE)`, i.e. `SELECT … FOR UPDATE` — **before** it touches
the Redis counter. So all 500 approvals, including the 400 sold-out losers, serialize on the inventory row
lock; there was no `DECR`/transaction race window to survive. The numbers fit that exactly: 1.9s / 500 ≈ 3.8ms
per serialized transaction, and 50 VUs × 3.8ms ≈ the observed ~400ms p95. The verdict stands — this is a real
black-box proof of the end-to-end invariant under genuinely concurrent clients — but it is not proof that the
`DECR` pairing wins a race. `RESULTS.md` was corrected to say so, and to record the capacity fact that falls
out for free: **per-event approval throughput is ceilinged at roughly 260 req/s, serialized on one row lock.**

## Decisions & rationale

- **The load test bypasses the gateway and hits ticket-service directly on 8082.** The gateway rate-limits per
  authenticated principal, and all 500 approvals are the same organizer, so they share one 10/s bucket —
  routing through it paces the run to ~8 req/s where requests never overlap. The property under test lives
  entirely in ticket-service. Seeding still goes through the gateway, exercising the real registration path.
  Documented in the script, the README and RESULTS.md rather than left implicit.
- **The load test is deliberately not in CI.** A CI runner's p95 is meaningless and standing up five services
  per PR is slow and flaky for no gain.
- **Findings in EPIC 4's logic get reported, not patched.** The plan said so up front, which is what kept a
  genuine bug (below) from being quietly worked around under the banner of "fixing the load test".

## What this session got wrong

- **The first k6 run was a false green of a new kind.** It reported a clean pass — 100/400/0, p95 19.54ms,
  500/500 checks — but it had been paced to 8 iterations/sec to dodge the rate limiter, so with ~12ms
  responses the requests essentially never overlapped: 78 seconds of wall-clock for work that takes 1.9s
  concurrently. The test **ran, and did not test what it claimed to test.** It was caught by reading the
  script, not the numbers. The generalisable check: if p95 is close to single-request latency, there is no
  load.
- **Three of the four Important findings in the final review were errors in the plan itself**, all of the
  "wrong instruction is worse than no instruction" kind:
  - `deployment.md` told operators that pinging the gateway's `/actuator/health` transitively covers db, Redis
    and RabbitMQ. It does not: `api-gateway/pom.xml` carries only `spring-boot-starter-data-redis-reactive`,
    and Spring Cloud Gateway does not aggregate downstream health. Postgres and ticket-service could be dead
    while UptimeRobot stayed green.
  - `ci.yml`'s path filters never matched `backend/Dockerfile`, so a Dockerfile-only PR ran **zero** CI —
    meaning the image-build step added to prove the Dockerfile works could not run precisely when the
    Dockerfile changed.
  - `pg_isready -U tvu` defaults to the unix socket, which the postgres entrypoint's init-time server
    (`listen_addresses=''`) already answers — so the healthcheck could go green before `init-db/` created
    `tvu_auth`, releasing auth-service against a database that did not exist. It only bites on a cold volume,
    which is why every observed run passed. Exactly the start-vs-ready class of bug T7.5 existed to eliminate.
- The plan's own seed script omitted the `Idempotency-Key` header that the plan's own API-contract section
  documented as required, so every registration 400'd until the implementer root-caused it.
- `run.sh` shipped mode `100644` despite the plan calling for `chmod +x`; `./run.sh` would have been
  `Permission denied` on a fresh clone.

## Open items / follow-ups

- **`TicketReservationService.java:110-113` — a real, unfixed product bug.** `findByEventId(...).orElseGet(()
  -> save(...))` is a non-atomic read-then-write against `ticket_inventories.event_id UNIQUE`
  (`V2__ticket_reservation_core.sql:3`). Concurrent *first* registrations for a brand-new event both insert;
  the loser gets a `DataIntegrityViolationException` surfaced as a generic 409 with a misleading message
  despite nothing being wrong with their request. This is not theoretical — the seed script had to seed
  student 0 alone to work around it. Out of EPIC 7's scope by the spec's own rule, but the fix is roughly one
  line (`ON CONFLICT DO NOTHING`, or catch and re-read) and a brand-new event's opening minute is exactly when
  it bites.
- **The gateway's rate limiter is keyed per principal**, so any real bulk-approve feature authenticating as a
  single organizer account hits the same 10/s ceiling in production, not just under test load.
- **CI has still never actually run.** It now triggers on `hlow`, but nothing has been pushed since. The first
  push is the only thing that proves T7.4; expect slow matrix jobs on a cold `~/.m2` inside the image build.
- The CI skip-guard inspects only the matrix module's own surefire reports, not upstream modules pulled in by
  `-am`. Harmless today (the five services are independent modules under a test-less parent aggregator), but
  it would silently stop covering a `common` module the day one is added.
- EPIC 8 (README, deployment docs, GitNexus re-index) remains unstarted. EPIC OPTIONAL is stretch.
- Process gap: `.superpowers/sdd/task-N-report.md` filenames collide across epics — Task 5's reviewer was
  handed EPIC UI's report and could not do the report-vs-results cross-check. Namespace them per epic.
