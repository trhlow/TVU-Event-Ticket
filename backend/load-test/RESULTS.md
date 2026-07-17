# EPIC 7 load test results: concurrent approval capacity race

**Date:** 2026-07-17

**Hardware:** Windows 11 Home Single Language (build 26200), Intel Core i5-12500H (12 cores / 16 logical
processors), 16 GB RAM. Docker Desktop, WSL2 backend. All five services + Postgres/Redis/RabbitMQ/Mailpit
running as local containers via `docker-compose.app.yml`; k6 run via `docker run grafana/k6`.

**Scenario:** one event, capacity 100, seeded with 500 PENDING reservations through the gateway
(`node seed.mjs`), then 500 organizer approvals (`PATCH /api/reservations/{id}/approve`) fired at it.

Two runs are reported below because the first one, while internally consistent, did not actually test
concurrency -- see "Why two runs" at the end.

## Run 2 (final): genuine concurrency, direct to ticket-service:8082

50 VUs, `shared-iterations` executor, 500 iterations, `Authorization: Bearer <organizer JWT>` straight to
ticket-service (bypasses the gateway's per-principal rate limiter -- see `README.md`).

**Database verdict** (`GET /api/ticketing/events/{id}/availability`):

```
before: {"eventId":"0282a7b4-b094-4a50-8853-48fd488b7bab","totalCapacity":100,"approvedCount":0,"remaining":100}
after:  {"eventId":"0282a7b4-b094-4a50-8853-48fd488b7bab","totalCapacity":100,"approvedCount":100,"remaining":0}

PASS: exactly 100 tickets issued, remaining 0, no overbooking.
```

**Counter reconciliation** (k6 counters vs. the 500 requests fired):

```
approved=100 soldOut=400 rateLimited=0 unexpected=0 total=500
```

`100 (approved) + 400 (409 sold-out) + 0 (rate-limited) + 0 (unexpected/5xx) = 500`. Every request is
accounted for; nothing vanished.

**k6 summary:**

```
checks_total.......: 500     258.43626/s
checks_succeeded...: 100.00% 500 out of 500
checks_failed......: 0.00%   0 out of 500

✓ approval resolved cleanly (200 or 409, never 5xx)

approvals_sold_out.............: 400    206.749008/s
approvals_succeeded............: 100    51.687252/s
approvals_unexpected_status....: 0      0/s

http_req_duration..............: avg=186.88ms min=95.47ms  med=138.15ms max=528.52ms p(90)=364.92ms p(95)=398.21ms
  { expected_response:true }...: avg=359.45ms min=117.53ms med=366.39ms max=528.52ms p(90)=467.9ms  p(95)=497.7ms
http_req_failed................: 80.00% 400 out of 500   (409s are expected outcomes here, not failures)
http_reqs......................: 500    258.43626/s

vus............................: 50     min=50   max=50
iterations.....................: 500    258.43626/s
```

Wall-clock: 500 iterations across 50 VUs completed in **1.9 seconds**.

**Thresholds:** `approvals_unexpected_status: count==0` PASS. `http_req_duration: p(95)<2000` PASS
(actual p95 398.21ms).

**Verdict: PASS.** Exactly 100 tickets issued out of 500 concurrent approvals against a 100-seat event,
`remaining` landed at exactly 0 and was never negative, every rejection was a clean `409` (zero `5xx`,
zero unexpected statuses), and `approved + rejected == 500` reconciled exactly. Under genuine 50-VU
concurrency (500 iterations in 1.9s, ~258 req/s, p95 398ms -- a clear sign of real contention on shared
state, not a serialized queue), the Redis `DECR` + database-transaction pairing held: no overbooking.

## Run 1 (superseded): paced through the gateway

First attempt, kept here because it's honest evidence of what does and doesn't constitute "load."

50-iteration-target pacing via `constant-arrival-rate` at 8 iterations/sec through the gateway (staying
under its `replenishRate: 10/burstCapacity: 20` per-principal limit -- see `README.md`).

**Database verdict:** `approvedCount: 100`, `remaining: 0` -- also a clean PASS on the DB side.

**k6 summary:**

```
checks_succeeded...: 100.00% 500 out of 500
approvals_sold_out.............: 400    5.128291/s
approvals_succeeded............: 100    1.282073/s
approvals_unexpected_status....: 0      0/s
http_req_duration..............: avg=12.72ms min=7.98ms  med=11.6ms  max=114.33ms p(90)=16.89ms p(95)=19.54ms
```

Wall-clock: **78 seconds** for the same 500 requests (paced at ~8/sec).

**Counter reconciliation bug (harness, now fixed):** the first version of `run.sh`'s reconciliation step
read `r.metrics.<name>.values.count`, but k6's `--summary-export` JSON puts the count directly at
`r.metrics.<name>.count` (no `.values` wrapper). That misread produced `approved=0 soldOut=0
rateLimited=0 unexpected=0 total=0` and a spurious `FAIL: k6 counters total 0` even though k6's own
printed summary clearly showed 100/400/0 and the DB verdict had already passed. This was a reporting bug,
not a measurement problem -- fixed by reading `.count` directly, confirmed against Run 2's output above.

## Why two runs, and why only Run 2 counts as "the" result

The gateway rate-limits every `/api/reservations/**` call at `replenishRate: 10`/`burstCapacity: 20`,
keyed per authenticated principal. All 500 approvals in this scenario authenticate as the same organizer,
so a naive 50-VU blast through the gateway would burn the 20-token burst almost instantly and get `429`
for nearly everything else -- corrupting `approved + rejected == 500`. Run 1 avoided that by pacing itself
under the refill rate. That made the DB accounting come out right, but it also meant requests almost
never overlapped: p95 was 19.54ms and the whole run took 78 seconds for 500 requests that individually
took ~12ms -- i.e., close to fully serialized. **A serialized trickle cannot prove a concurrency-race
property**, because there is essentially no concurrency for the Redis `DECR` + DB-transaction pairing to
fail under.

Run 2 fixes this by pointing the approval hammer directly at ticket-service on port 8082 (published
directly by `docker-compose.app.yml`), bypassing the gateway's rate limiter entirely for this one path
while still seeding through the gateway normally. The jump from p95 19.54ms → 398.21ms and wall-clock
78s → 1.9s for the *same* 500 requests is the signature of genuine contention -- requests actually
queueing against shared state (Redis counter, DB row/table locks) -- which is exactly the window the
approval logic had to survive. It did: 100 issued, 0 overbooked, 0 unexpected statuses, 500/500 accounted
for.

## What surprised us

- The magnitude of the latency jump between the paced and concurrent runs (19.54ms → 398.21ms p95, a
  ~20x increase) was larger than expected for a 100-seat capacity check; it suggests the last ~100
  approvals (the ones actually contending for remaining inventory) serialize meaningfully on the shared
  counter/transaction, even though the final answer was still correct.
- The gateway's rate limiter is keyed per-principal, not per-IP or globally, which means any bulk-approve
  tooling authenticating as a single organizer account would hit this same ceiling in production, not
  just under artificial test load. That's outside this test's scope (rate limiting is not what's being
  tested here) but worth flagging as an operational note for anyone building a real bulk-approve feature
  against the gateway.
- `--summary-export`'s JSON shape (`metrics.<name>.count`, no `.values` wrapper) isn't obvious from k6's
  terminal output alone and cost one full run to get wrong before being caught by cross-checking against
  k6's own printed summary.
