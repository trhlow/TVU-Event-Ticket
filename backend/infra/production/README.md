# Production deployment

This directory deploys the full application as one Docker Compose stack:
Caddy, frontend, monolith, PostgreSQL, Redis and RabbitMQ. Only Caddy exposes
ports 80 and 443. Every stateful service remains on the internal Docker network.

## First deployment

1. Provision an Ubuntu 24.04 ARM64/x86_64 VM with at least 2 vCPU, 4 GB RAM
   and 60 GB SSD. Install Docker Engine and the Compose plugin.
2. Clone this repository on the VM. Copy `.env.example` to `.env`, fill every
   `REPLACE_WITH...` value, and ensure only the deploy user can read it:
   `chmod 600 .env`.
3. Generate a 2048-bit RSA key pair for JWT signing. Store the PKCS#8 private
   key and X.509 public key in the corresponding `.env` values with literal
   `\\n` line separators. Do not commit either key.
4. Set Microsoft Entra's redirect URI to `https://APP_DOMAIN`, add SPF/DKIM
   records for the chosen email provider, then point the domain A/AAAA record
   at the VM IP.
5. Open only TCP 80/443 publicly. Allow SSH only from trusted IPs and only by
   key. Do not publish ports 5432, 5672, 6379 or RabbitMQ Management.
6. From this directory run:

   ```bash
   docker compose --env-file .env up -d --build --wait
   curl --fail https://APP_DOMAIN/actuator/health
   ```

The production monolith limits login attempts to 10/minute/IP and reservation
creation to 20/minute/IP. Caddy overwrites `X-Forwarded-For` with the actual
client address; do not bypass Caddy by exposing the monolith port.

## Backups and recovery

Create a daily cron job as the deployment user:

```bash
0 2 * * * /path/to/repository/backend/infra/production/scripts/backup-postgres.sh >> /var/log/tvu-backup.log 2>&1
```

The backup is a PostgreSQL custom-format dump and is checked by `pg_restore`
before it is accepted. Set `BACKUP_REMOTE` to an rclone remote so the dump is
copied off the VM. Exercise a restore on a separate machine before any real
event; the restore script requires an explicit `--confirm` because it replaces
the database.

## Deployment workflow

The GitHub Actions production workflow is manually dispatched and uses the
`production` environment. Configure these environment secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | VM hostname or IP |
| `DEPLOY_USER` | Non-root deploy user |
| `DEPLOY_SSH_PRIVATE_KEY` | Key allowed for that user |
| `DEPLOY_PATH` | Absolute path to this repository on the VM |

The deploy user must own `DEPLOY_PATH`, have Docker permission, and the clone
must already have an authenticated `origin` remote. The workflow checks out the
selected commit on the server, rebuilds the stack and waits for all healthchecks.
