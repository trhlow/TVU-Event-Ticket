# EPIC 7 load test: the concurrent-approval capacity race

## What this proves

Approving a reservation is supposed to pair a Redis `DECR` (fast inventory check) with a database
transaction (the actual `Reservation` state change) so that the two never disagree under concurrency.
If that pairing is wrong, the system can issue more tickets than an event's capacity allows -- the worst
bug this project could ship, because it means real students show up to an event that oversold seats.

This test seeds one event with capacity 100 and 500 PENDING reservations, then fires all 500 organizer
**approvals** at once and checks the aftermath: exactly 100 tickets issued, `remaining` at 0 and never
negative, every non-approved request rejected cleanly with `409` (never a `5xx`), and
`approved + rejected == 500` so no request silently vanishes.

### Why approval, not registration, is the path under test

Registration (`POST /api/reservations`) deliberately does **not** enforce capacity -- that's what makes
500 PENDING reservations possible against a 100-seat event in the first place, and it's a known, filed,
separate finding (`TicketReservationService.submit()` has its own non-atomic inventory find-or-create
race, unrelated to this test). Capacity is enforced at **approval** time
(`PATCH /api/reservations/{id}/approve`), which is where the Redis `DECR` + DB transaction pairing lives.
Firing 500 concurrent approvals is the only way to actually exercise that pairing under contention; firing
500 concurrent registrations would just be racing the already-known, already-filed bug instead.

## How to run it

Prerequisites: Docker Desktop running, Node 22+, the repo checked out.

```bash
cd backend/load-test
./run.sh
```

One command does everything:

1. Brings up the full stack (`docker compose -f ../infra/docker-compose.app.yml up -d --build --wait`) --
   returns only once every service reports healthy.
2. Seeds the fixture (`node seed.mjs`): creates a club, an organizer, an event with capacity 100, and 500
   PENDING reservations under 500 distinct students, through the public API only. Writes `.seed.json`.
3. Runs the k6 scenario (`approval-capacity.js`) inside `grafana/k6` via `docker run`, hitting
   ticket-service **directly** on `host.docker.internal:8082` -- not through the gateway. See "About the
   gateway's rate limiter" below for why.
4. Reconciles the result from two independent sources: the ticket-service's own `/availability` endpoint
   (`approvedCount`, `remaining`) and k6's own per-status counters, and prints a verdict.
5. Exits non-zero if either reconciliation fails.

Tear down afterwards:

```bash
cd ../infra && docker compose -f docker-compose.app.yml down -v
```

## Changing the numbers

Environment variables, read by `seed.mjs` (and `run.sh` passes `BASE_URL` through):

- `CAPACITY` -- event capacity (default 100)
- `STUDENTS` -- number of reservations to seed (default 500)
- `BASE_URL` -- gateway base URL as seen from the host (default `http://localhost:8080`)

`approval-capacity.js` reads `TICKET_SERVICE_URL` (default `http://host.docker.internal:8082`) if you need
to point it somewhere other than the default compose network layout.

## Reading the verdict

`run.sh` prints two independent checks and fails (non-zero exit) if either one does:

- **Database verdict**: `approvedCount == CAPACITY`, `remaining == 0`, `remaining` never negative.
- **k6 counter reconciliation**: `approvals_succeeded + approvals_sold_out + approvals_rate_limited +
  approvals_unexpected_status == STUDENTS`, and `approvals_unexpected_status == 0` (any 5xx or other
  unrecognized status is an automatic failure -- see `RESULTS.md` for what "rate_limited" means and why
  it's a legitimate, separate bucket rather than an error).

If `approvedCount` is not exactly `CAPACITY`, or the counters don't reconcile, or any status other than
200/409/429 appears, that is a genuine system finding, not a harness bug -- see `RESULTS.md` for the
actual measured result of the last real run.

## About the gateway's rate limiter (and why the approval hammer bypasses the gateway)

Every `/api/reservations/**` call through the gateway is rate-limited (`replenishRate: 10`,
`burstCapacity: 20`, `api-gateway/src/main/resources/application.yml`), keyed **per authenticated
principal** (`GatewaySecurityConfig#clientKeyResolver`). Since every approval in this run authenticates as
the same organizer, all 500 requests would share ONE token bucket through the gateway regardless of k6's
VU count.

A first version of this scenario paced itself under that limit (`constant-arrival-rate` at 8 iters/sec,
comfortably under the 10/sec refill) to avoid drowning in `429`s. It worked, in the sense that
`approved + rejected == 500` reconciled cleanly -- but at that rate, with ~12ms responses, requests
essentially never overlapped in time. It proved capacity *accounting* is correct; it did **not** prove
the Redis `DECR` + DB-transaction pairing survives real concurrency, which is the one thing this epic
exists to demonstrate. See `RESULTS.md` for both runs' numbers side by side -- the difference in p95
latency and wall-clock time between the paced run and the concurrent run is the evidence that only one of
them was actually testing contention.

So the scenario is split by design:

- **Seeding** (`seed.mjs`) still goes through the gateway at `http://localhost:8080` -- it exercises the
  real registration path end-to-end, and the gateway's rate limiter is legitimate anti-abuse protection
  for that path, not something to route around.
- **The approval hammer** (`approval-capacity.js`) talks to ticket-service **directly** on
  `host.docker.internal:8082` (published directly by `docker-compose.app.yml`), with genuine
  `shared-iterations` concurrency (50 VUs, 500 iterations, no artificial pacing). The rate limiter lives
  in the gateway; the race being tested lives in ticket-service. They are separable, and bypassing the
  gateway here is a documented, deliberate scope choice -- not disabling a safety mechanism, since the
  gateway's rate limiting is never in the path this test cares about.

Two things change because of that:

- **Auth**: ticket-service is an OAuth2 resource server that reads a standard `Authorization: Bearer`
  header. The gateway is what turns the browser's `TVU_AUTH` cookie into that bearer token, so the script
  parses the JWT back out of `seed.organizer.cookie` (the raw cookie value *is* the JWT) and sends
  `Authorization: Bearer <jwt>` directly.
- **CSRF**: enforced by a gateway global filter, not by ticket-service, so `X-XSRF-TOKEN` is simply
  dropped -- there's nothing on the other end to check it.

`429`s are not expected on this path (the rate limiter is gateway-only), but the script still counts them
in their own `approvals_rate_limited` bucket rather than folding them into `approvals_sold_out` or
`approvals_unexpected_status`, in case something upstream still throttles.

## Why this is not in CI

This scenario is deliberately **not** wired into CI:

- A CI runner's hardware is arbitrary and often shared/throttled, so p95 latency measured there is
  meaningless -- it would neither catch regressions reliably nor be reproducible run to run.
- Standing up five services (gateway, auth, event, ticket, notification) plus Postgres/Redis/RabbitMQ per
  PR, just to run a several-minutes-long load test, is slow for no proportional gain: the property this
  test proves (no overbooking under concurrent approval) is about the approval code path's correctness,
  not something that regresses on every unrelated PR.

Run it manually before/after touching anything in the approval path
(`TicketReservationService`, `RedisTicketCounterService`, `TicketCounterService`) or the gateway's rate
limiting/routing config.
