# EPIC 7 design - cross-cutting: resource config, CI, monitoring, load test

**Date:** 2026-07-17
**Status:** design approved, pending implementation plan
**Branch:** `hlow`

## Why this exists, and what is already done

Checking the code rather than the progress table: most of EPIC 7 already landed incidentally during earlier
epics. `backend/Dockerfile` is already multi-stage, parameterised by `MODULE`, based on the multi-arch
`eclipse-temurin:25-jre` (so it runs on Ampere A1), and already carries `-XX:+UseSerialGC` and
`-XX:MaxRAMPercentage=70.0` (T7.2). `backend/infra/docker-compose.app.yml` already runs the five services
against local deps, separate from the dependency-only `docker-compose.yml` (T7.3). `.github/workflows/ci.yml`
already builds a path-filtered module matrix on JDK 25 (T7.4, partly). All five services already expose
`/actuator/health` (T7.5, partly).

What is genuinely missing is T7.6, plus gaps in T7.1/T7.4/T7.5 — and two hazards found while surveying:

- **`docker-compose.app.yml` has no healthchecks at all.** `depends_on` without `condition: service_healthy`
  waits only for the container to *start*, not to be *ready*. This is the exact race that made
  notification-service crash on boot in EPIC 5. That symptom was fixed by removing an eager RabbitMQ connect,
  but the underlying race still applies to every service.
- **CI never runs for this work.** `ci.yml` triggers on push to `main` and PRs targeting `main`. All of EPIC 5,
  6 and UI were developed on `hlow` and have therefore never been through CI once; every green was a manual
  local run.

## T7.1 - resource-constrained configuration

`server.tomcat.threads.max: 20` goes into each service's `application.yml`.

`spring.main.lazy-initialization` **stays where it is — an `ENV` in the Dockerfile — and is deliberately NOT
added to `application.yml`.** This departs from the master plan's literal wording (invariant #8), for a
specific reason: `application.yml` applies to tests too, and lazy initialization defers bean wiring failures
from startup to first use. A misconfigured bean would then let the test suite pass while the real application
breaks. This project has already been bitten three times in two days by tests that were green for a reason
unrelated to the code being correct; adding a fourth mechanism is not worth the consistency. The invariant's
actual goal — a small memory footprint at runtime — is fully met by the Dockerfile `ENV`, which applies to
every environment where the constraint matters.

Change `-Xss256k` to `-Xss512k` in the Dockerfile. The master plan specifies 512k; 256k is aggressive for
Hibernate and Spring proxy call stacks and risks a `StackOverflowError` under deep call chains. This is a
correction toward the plan, not a deviation from it.

## T7.4 - CI

Three additions to `.github/workflows/ci.yml`:

1. **Run on `hlow`.** Add `hlow` to the `push` branch list. Without it the branch where all work happens gets
   no CI at all.
2. **Build the Docker image for each changed module** — build only, no registry push. That satisfies T7.2's
   acceptance criterion ("build image OK") and proves the Dockerfile still works, without needing registry
   credentials or a tag/versioning decision the project has no deployment target for yet.
3. **Fail the build if any test was skipped.** Parse the surefire XML reports and fail on `skipped > 0`.

On (3): `@Testcontainers(disabledWithoutDocker = true)` sits on five test classes, including both services'
`AbstractPostgresIntegrationTest` and `ApprovalConcurrencyIntegrationTest` — the overbooking guard that is the
single most important correctness test in the system. Without Docker these **skip silently instead of
failing**, which already produced two false greens during EPIC UI. There is no Testcontainers flag that forces
the opposite behaviour, so the check has to be external.

The annotation is **kept**, not removed. Removing it would make the build fail outright for a teammate without
Docker. Keeping it plus a CI guard gets what actually matters: CI can never silently skip, while local
developers keep a working build.

## T7.5 - monitoring, and fixing the compose race

Add healthchecks to `docker-compose.app.yml`:

- `postgres` → `pg_isready`
- `redis` → `redis-cli ping`
- `rabbitmq` → `rabbitmq-diagnostics -q ping`
- each of the five services → its own `/actuator/health`

and convert every `depends_on` to the `condition: service_healthy` long form. This is the real fix for the
boot-order race, not merely an observability improvement.

Spring Boot already auto-configures the db/redis/rabbit health indicators wherever the corresponding starter is
on the classpath, so `/actuator/health` already reflects dependencies — no per-indicator wiring is needed.

Document the UptimeRobot ping target and container log rotation in `deployment.md`.

## T7.6 - k6 load test

Lives in `backend/load-test/`. Runs locally against the `docker-compose.app.yml` stack via a one-command runner
script, executing k6 through the `grafana/k6` image so nothing has to be installed. It is **not** wired into
CI: a CI runner's p95 would be meaningless, and standing up five services per PR is slow and flaky for no gain.

**Scenario.** The overbooking risk does not live in registration — it lives in *approval*, where a Redis `DECR`
is paired with a database transaction. So the test hammers approval, not registration.

Seed (via the dev profile's DevStub login, which accepts arbitrary credentials): one club, one organizer, one
event with **capacity 100**, its ticket inventory, and **500 students who each register**, producing 500
`PENDING` reservations. k6 then fires approvals for all 500 **concurrently**.

**Assertions — all four must hold:**

1. Tickets issued is **exactly 100**, never more.
2. `remaining` is **0**, and never negative.
3. Every non-approved request is a clean sold-out rejection (**409**), not a 5xx.
4. **approved + rejected == 500.** This one matters most: counting tickets alone is not enough, because a
   request failing silently would make an overbooked run look correct. The totals must reconcile.

p95 and error rate are recorded in the report. Verification reads `/api/ticketing/events/{id}/availability` and
`/api/ticketing/stats` after the run.

Output: a committed report under `backend/load-test/` with the measured figures, per the master plan's
acceptance criterion.

## Out of scope

- No registry push, no tagging/versioning scheme, no deployment target.
- No k6 in CI.
- Removing `@Testcontainers(disabledWithoutDocker = true)` itself — the CI guard addresses the risk without
  breaking a Docker-less local build.
- No change to the EPIC 4 approval logic. This epic **measures** it; if the load test finds overbooking, that
  is a finding to report, not something to silently patch here.
