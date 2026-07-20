# Concurrent approval capacity race

This manual test validates the modular monolith's no-overbooking invariant. It
creates an event with capacity 100, submits 500 pending registrations, approves
all 500 concurrently and requires exactly 100 approved tickets with zero
remaining capacity and no unexpected response status.

## Run

```bash
cd backend/load-test
./run.sh
```

The script starts the one-JVM application and its local dependencies, seeds the
fixture through the public API, runs k6 against `http://localhost:8080`, then
compares the API availability result with the k6 status counters. It exits
non-zero on any mismatch.

Environment variables:

- `CAPACITY` — default `100`
- `STUDENTS` — default `500`
- `BASE_URL` — default `http://localhost:8080`
- `TICKET_SERVICE_URL` — k6 target, default `http://host.docker.internal:8080`

The load test is intentionally manual: it needs Docker and its latency figures
are not stable enough for CI. Run it after changing approval, inventory or
Redis-counter logic.
