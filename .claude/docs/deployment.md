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
-Xss256k            # (or 512k)
-XX:MaxRAMPercentage=70.0
```
Plus in config: `spring.main.lazy-initialization=true` and `server.tomcat.threads.max=20` (not the 200 default).

## Packaging & CI/CD

- Docker + Docker Compose; images built in GitHub Actions with path filters (build/test only the changed
  module). Base images must be ARM-compatible (Ampere A1).
- Local dev dependencies come up with `docker compose -f infra/docker-compose.yml up -d`.

## Config / secrets in prod

- Activate the prod profile: `SPRING_PROFILES_ACTIVE=prod`.
- All connection strings and secrets come from **environment variables** (`application-prod.yml` has no
  fallback defaults): `*_DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_HOST/PORT/PASSWORD`,
  `RABBITMQ_*`, `MAIL_*`, `JWT_ISSUER_URI`, `QR_SIGNING_SECRET`.

## Resilience (§7.2)

Oracle Always Free ARM capacity can be revoked ("Out of host capacity"). Keep a **standby VM** (another
provider's free tier) pre-configured with the same `docker-compose.yml` for fast failover. The defensive JVM
sizing above is what lets the system stay up on minimum resources.

## MVP cut lines (§9)

If timeline slips: merge `notification-service` into `ticket-service` (one fewer container), then trim the
Dashboard/ADW analytics. Always keep the core flow deployable: **register → QR → check-in**.
