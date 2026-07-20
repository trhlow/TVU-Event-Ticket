# Deployment — TVU Event & Ticket

The deployable runtime is a single Spring Boot modular monolith. Its production
definition is at `backend/infra/production/compose.yaml`; do not deploy the old
individual service compose files.

## Topology

```text
Internet -> Caddy (80/443, automatic TLS)
             -> frontend (Vite static files)
             -> /api -> monolith
                            -> PostgreSQL
                            -> Redis
                            -> RabbitMQ
                            -> SMTP provider
```

Only Caddy belongs to the public Docker network. PostgreSQL, Redis, RabbitMQ
and the monolith have no host-published ports and remain on an internal network.

## Runtime configuration

- Activate `SPRING_PROFILES_ACTIVE=prod,monolith`.
- `monolith/src/main/resources/application-prod.yml` has no fallback for
  production credentials or signing material.
- The production compose stack uses PostgreSQL 18, Redis with a password and
  AOF persistence, RabbitMQ with a dedicated user, Docker log rotation and
  `restart: unless-stopped`.
- Keep the monolith JVM bounded on a 4 GB host:
  `-XX:+UseSerialGC -Xss512k -Xms128m -Xmx768m`.
- Build the frontend with `VITE_API_BASE_URL=/api`; it shares the browser origin
  with the backend, so production cookies use `Secure` and `SameSite=Lax`.

## Secrets

Copy `infra/production/.env.example` to `infra/production/.env`, set mode 600
and never commit it. Generate independent random values for database, Redis,
RabbitMQ, CSRF and QR signing. Store stable RSA JWT keys in the supplied PEM
variables; regenerating them invalidates active sessions.

Use a transactional SMTP provider after verifying SPF, DKIM and DMARC. Mailpit
is development-only and must never be deployed.

## Operations

- Bring up the stack with
  `docker compose --env-file .env up -d --build --wait` from
  `infra/production`.
- Monitor `https://<domain>/actuator/health`; `/actuator/info` and all other
  management endpoints are deliberately not reverse-proxied publicly.
- Schedule `scripts/backup-postgres.sh` daily. It creates and validates a
  custom-format PostgreSQL dump. Configure `BACKUP_REMOTE` with rclone to keep
  an off-host copy; retain 7–14 days and test restores regularly.
- `scripts/restore-postgres.sh` requires `--confirm` because it replaces the
  live database.

## CI/CD

CI treats `monolith` as a first-class module: a change to any imported feature
library triggers its reactor test/build and builds the deployable monolith
image. `.github/workflows/deploy-production.yml` is manual-only and protected
by the GitHub `production` environment. Configure `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_PRIVATE_KEY` and `DEPLOY_PATH` there before use.
