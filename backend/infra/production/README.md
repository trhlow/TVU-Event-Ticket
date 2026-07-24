# Production deployment

The complete Vietnamese runbook is
[`../../docs/PRODUCTION_DEPLOYMENT_VI.md`](../../docs/PRODUCTION_DEPLOYMENT_VI.md).
This directory is the executable production definition for the whole system:
Caddy, frontend, the Spring Boot monolith, PostgreSQL, Redis, and RabbitMQ.

## Command map

Run these commands from `backend/infra/production` on an Ubuntu production host.

```bash
# One time: generate passwords, secrets, and a stable RSA key pair.
bash scripts/generate-env.sh events.example.com admin@example.com \
  MICROSOFT_CLIENT_ID MICROSOFT_TENANT_ID

# After filling SMTP values in .env:
bash scripts/preflight.sh

# Build, back up the current database when present, deploy, and smoke-test.
bash scripts/deploy.sh

# Verify the public stack again without changing it.
bash scripts/smoke-test.sh

# Roll application code back to the previously recorded release.
# Flyway/database changes are deliberately not reversed.
bash scripts/rollback.sh --confirm

# Data protection and disaster recovery.
bash scripts/backup-postgres.sh
bash scripts/restore-postgres.sh --confirm /absolute/path/to/backup.dump
```

Only Caddy exposes ports 80 and 443. PostgreSQL, Redis, RabbitMQ, and the
monolith remain on an internal Docker network. `.env`, local backups, and
release state are ignored by Git.

## GitHub production environment

The manual workflow `.github/workflows/deploy-production.yml` needs:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | Production VM hostname or IP |
| `DEPLOY_USER` | Non-root deploy user |
| `DEPLOY_SSH_PRIVATE_KEY` | SSH private key for that user |
| `DEPLOY_KNOWN_HOSTS` | Verified host-key line, never an unverified live scan |
| `DEPLOY_PATH` | Absolute repository path, for example `/srv/tvu-event-ticket` |

Protect the GitHub `production` environment with a required reviewer. Deploy an
immutable commit SHA after CI passes.
