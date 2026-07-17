# Deployment — TVU Event & Ticket backend

Reference doc (read on demand). Target: **$0 free-tier cloud** (proposal §7). Infra choices change over time —
verify each provider's current free-tier limits before relying on them.

## Topology

| Concern | Service | Notes |
|---|---|---|
| Backend + API Gateway | **Oracle Cloud Always Free**, Ampere A1 (ARM) | Runs the 4 Spring Boot containers via Docker Compose. Most volatile free tier — design for the *minimum* published resources, not the max. |
| Transactional DB | **Neon** (PostgreSQL) | Scale-to-zero; storage-capped → metadata only, no blobs. `event-service` + `ticket-service` use separate logical DBs (`tvu_event`, `tvu_ticket`). |
| Message broker | **CloudAMQP** — Little Lemur | ~1M msg/month, ~20 connections, ~100 queues. Consumers must keep up or the queue backs up. |
| Atomic counter / rate-limit | **Redis** (Upstash / Redis Cloud free tier) | Ticket-remaining DECR + gateway rate-limit counters. Prod uses TLS (`REDIS_SSL: true`). |
| Analytics warehouse | **Oracle ADW** (in Always Free) | Reporting/analytics for organizers. |
| Frontend hosting | Cloudflare Pages | Out of this repo (backend-only workspace); listed for context. |
| Cost guard | Oracle Cloud **Budget Alerts** | Alert threshold at ~$1 to catch any accidental spend early. |

## Runtime: mandatory JVM flags (§6.5)

Every Spring Boot container runs with these so it fits the minimum free-tier RAM:

```
-XX:+UseSerialGC
-Xss512k
-XX:MaxRAMPercentage=70.0
```
`SPRING_MAIN_LAZY_INITIALIZATION=true` is supplied by the runtime Docker image so it constrains containers
without deferring Spring bean wiring in tests. The four servlet services set
`server.tomcat.threads.max=20`; the reactive API gateway deliberately does not carry a Tomcat setting.

## Packaging & CI/CD

- Docker + Docker Compose; GitHub Actions runs on `main` and `hlow`, path-filters changed services, verifies
  their tests, fails if a test is skipped, and builds each changed module image. Base images must be
  ARM-compatible (Ampere A1).
- Local dev dependencies come up with `docker compose -f infra/docker-compose.yml up -d`.
- The complete local stack uses `docker compose -f infra/docker-compose.app.yml up -d --build --wait`.

## Config / secrets in prod

- Activate the prod profile: `SPRING_PROFILES_ACTIVE=prod`.
- All connection strings and secrets come from **environment variables** (`application-prod.yml` has no
  fallback defaults): `*_DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_HOST/PORT/PASSWORD`,
  `RABBITMQ_*`, `MAIL_*`, `JWT_ISSUER_URI`, `QR_SIGNING_SECRET`.

## Resilience (§7.2)

Oracle Always Free ARM capacity can be revoked ("Out of host capacity"). Keep a **standby VM** (another
provider's free tier) pre-configured with the same `docker-compose.yml` for fast failover. The defensive JVM
sizing above is what lets the system stay up on minimum resources.

## Monitoring & readiness

- **Uptime ping**: the gateway's `GET /actuator/health` (port 8080) only proves the gateway itself and Redis
  are up — `api-gateway/pom.xml` pulls in `spring-boot-starter-data-redis-reactive` but no datasource and no
  `spring-boot-starter-amqp`, and Spring Cloud Gateway does not aggregate downstream services' health into
  its own. A single ping at the gateway does **not** cover Postgres, RabbitMQ, or the other four services —
  ticket-service could be down entirely while the gateway stays green. Point UptimeRobot (or equivalent) at
  each service's own `/actuator/health` instead:
  - gateway: `:8080/actuator/health` (gateway + Redis)
  - auth-service: `:8084/actuator/health` (auth + its DB + RabbitMQ)
  - event-service: `:8081/actuator/health` (event + its DB + RabbitMQ)
  - ticket-service: `:8082/actuator/health` (ticket + its DB + Redis + RabbitMQ)
  - notification-service: `:8083/actuator/health` (notification + Redis + RabbitMQ + mail)
- **Container log rotation**: Docker's default `json-file` log driver has no size cap and will grow without
  bound. Set `max-size`/`max-file` via the daemon's `log-opts` (or per-service `logging:` config) on the
  deployment host so container logs don't fill the disk.
- **Startup gating**: the compose stack's `depends_on` entries now use `condition: service_healthy` against
  real healthchecks (bash `/dev/tcp` probes of `/actuator/health` for the Spring Boot services; `pg_isready`,
  `redis-cli ping`, `rabbitmq-diagnostics ping` for the infra dependencies). Bring the stack up with
  `docker compose up --wait` — it only returns once every service is genuinely healthy, not merely started.

## MVP cut lines (§9)

If timeline slips: merge `notification-service` into `ticket-service` (one fewer container), then trim the
Dashboard/ADW analytics. Always keep the core flow deployable: **register → QR → check-in**.
