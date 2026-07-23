#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
  echo "Usage: $0 --confirm /absolute/path/to/tvu_app_YYYYMMDDTHHMMSSZ.dump" >&2
  echo "This replaces the current production database. Test restores on a separate host first." >&2
  exit 2
fi

backup_file="$2"
if [[ ! -f "$backup_file" ]]; then
  echo "Backup file does not exist: $backup_file" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"

docker run --rm -i postgres:18.4-alpine pg_restore --list - < "$backup_file" > /dev/null
docker compose --env-file "$env_file" -f "$compose_file" stop monolith
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < "$backup_file"

# PostgreSQL is now rewound to the backup, but Redis and RabbitMQ keep their own persistent volumes and
# still hold state from after the backup: ticket counters and dedup markers in Redis, and queued
# reservation.approved messages in RabbitMQ that reference tickets no longer in the database. Left in
# place they would let the counter drift, resend emails/QRs, or suppress notifications that should fire.
# Reconcile the volatile stores to match the restored database before the app comes back up.
#   - Redis is safe to wipe: TicketCounterService re-seeds each counter lazily from the inventory row on
#     first access, and dedup markers are best-effort.
#   - RabbitMQ queues are purged so no stale message replays.
# Queue names mirror tvu.notification.rabbit.* in application.yml.
docker compose --env-file "$env_file" -f "$compose_file" exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli FLUSHALL'
docker compose --env-file "$env_file" -f "$compose_file" exec -T rabbitmq \
  rabbitmqctl purge_queue notification.reservation-approved
docker compose --env-file "$env_file" -f "$compose_file" exec -T rabbitmq \
  rabbitmqctl purge_queue notification.reservation-approved.dlq

# Purging the queue drops any message that the broker had already accepted but the consumer had not yet
# processed. Those rows are SENT in the restored outbox, and the relay only ever re-claims NEW/PROCESSING,
# so their email/QR would be lost forever. This is a ticketing system, so choose at-least-once: rewind the
# SENT rows to NEW and let the relay re-publish them. The Redis dedup markers were just flushed, so a
# notification delivered before the backup may be re-sent; that duplicate is preferable to a silently
# missing ticket email, and per-delivery idempotency still suppresses redelivery storms during replay.
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
UPDATE outbox_messages
   SET status = 'NEW', sent_at = NULL, next_attempt_at = NULL,
       locked_at = NULL, locked_by = NULL, locked_until = NULL
 WHERE status = 'SENT';
SQL

docker compose --env-file "$env_file" -f "$compose_file" up -d monolith --wait

echo "Restore completed. Redis flushed, RabbitMQ queues purged, SENT outbox rows requeued for at-least-once replay."
echo "Verify login, registration, email and check-in before reopening traffic."
