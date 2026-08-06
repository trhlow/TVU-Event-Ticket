#!/usr/bin/env bash
set -euo pipefail

# RENAMED from restore-postgres.sh, because the old name described something this script does not
# safely do. It DROPS and recreates the database, then deals with Redis and RabbitMQ afterwards. If
# any of those later steps fails, the database has already been replaced while the queues and cache
# still hold the previous world's data — a half-restored system with no way back.
#
# So: run it against a SEPARATE, NEWLY BUILT stack, then move traffic to that stack once it has been
# smoke-tested. That is the blue-green procedure in docs/CLEAN_SLATE_CUTOVER_VI.md, and it is the
# only supported way to use this script.
#
# The guard below refuses the default production project name. Override only if you genuinely know
# the stack is disposable.
# Parsed, not grepped, and it FAILS CLOSED. `docker compose config --format json` pretty-prints, so
# its output is `  "name": "tvu-event-ticket",` -- with a space after the colon. The pattern this
# used to match on, '"name":"[^"]*"', matched nothing, project_name came back empty, and the
# comparison below was false every single time. A guard whose whole purpose is to stand between an
# operator and `dropdb` on the live database read as working and did nothing. Measured.
#
# python3 rather than a sharper pattern: preflight already requires an interpreter, and a parser
# cannot be defeated by whitespace. If the project name cannot be determined at all, that is a
# reason to stop, not to continue -- an unknown stack is not a safe stack.
project_name="$(docker compose --env-file "${ENV_FILE:-.env}" -f "$(dirname -- "${BASH_SOURCE[0]}")/../compose.yaml" config --format json 2>/dev/null \
  | "${PYTHON_BIN:-python3}" -c 'import json,sys; print(json.load(sys.stdin)["name"])' 2>/dev/null || true)"
if [[ -z "$project_name" ]]; then
  echo "Could not determine which compose project this would restore into." >&2
  echo "Refusing to run: a restore aimed at an unknown stack is aimed at the live one until" >&2
  echo "proven otherwise. Check that docker is running and that ENV_FILE points at a real .env." >&2
  exit 1
fi
if [[ "${ALLOW_IN_PLACE_RESTORE:-0}" != "1" && "$project_name" == "tvu-event-ticket" ]]; then
  echo "Refusing to restore into the live production stack (project: $project_name)." >&2
  echo "Build a parallel stack and restore into that, smoke test it, then switch the Caddy" >&2
  echo "upstream. See docs/CLEAN_SLATE_CUTOVER_VI.md." >&2
  echo "" >&2
  echo "The parallel stack is selected with COMPOSE_PROJECT_NAME, not with -p: this script builds" >&2
  echo "its own compose invocations and passes no -p of its own. So:" >&2
  echo "  COMPOSE_PROJECT_NAME=tvu-event-ticket-v2 bash \$0 --confirm /path/to.dump" >&2
  echo "" >&2
  echo "If this really is a disposable stack, re-run with ALLOW_IN_PLACE_RESTORE=1." >&2
  exit 1
fi


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

# How far back from the backup moment to requeue already-sent notifications (see the SENT block below).
requeue_window="${RESTORE_REQUEUE_WINDOW:-60 minutes}"

# Resolve the backup watermark -- the instant the snapshot was taken -- BEFORE touching anything. The SENT
# requeue window is anchored to this, not to max(sent_at) (which can be far older than the backup) nor to the
# restore clock (which is arbitrarily later). Prefer the sidecar written by backup-postgres.sh; fall back to
# the timestamp in the dump filename. Both use the compact UTC form YYYYMMDDTHHMMSSZ; reformat it to a value
# Postgres parses. Failing to determine the watermark here aborts before any destructive step.
meta_file="${backup_file}.meta"
backup_stamp=""
if [[ -f "$meta_file" ]]; then
  backup_stamp="$(sed -n 's/^BACKUP_STARTED_AT=//p' "$meta_file" | head -n1)"
fi
if [[ ! "$backup_stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  base="$(basename -- "$backup_file")"
  if [[ "$base" =~ tvu_app_([0-9]{8}T[0-9]{6}Z) ]]; then
    backup_stamp="${BASH_REMATCH[1]}"
  fi
fi
if [[ ! "$backup_stamp" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$ ]]; then
  echo "Cannot determine backup watermark from $meta_file or the filename; refusing to restore." >&2
  echo "Expected a '${meta_file}' with BACKUP_STARTED_AT=YYYYMMDDTHHMMSSZ or a matching dump filename." >&2
  exit 1
fi
backup_watermark="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]} ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}+00"

docker run --rm -i postgres:18.4-alpine pg_restore --list < "$backup_file" > /dev/null

# The checksum backup-postgres.sh writes had no reader anywhere in this repository until now: a
# claim of integrity that nothing ever checked. It is read HERE, before the dropdb below, because
# this is the one moment where knowing the file is intact still changes what happens next.
# --list above cannot tell a truncated dump from a whole one; it reads the header and stops.
if [[ -f "${backup_file}.sha256" ]]; then
  expected_sha="$(<"${backup_file}.sha256")"
  actual_sha="$(sha256sum "$backup_file" | awk '{print $1}')"
  [[ "$expected_sha" == "$actual_sha" ]] || {
    echo "The dump does not match the checksum written beside it." >&2
    echo "  expected $expected_sha" >&2
    echo "  actual   $actual_sha" >&2
    echo "Refusing to drop a live database and restore from a file that changed in transit." >&2
    exit 1
  }
  echo "Checksum verified against ${backup_file}.sha256"
else
  echo "WARNING: no ${backup_file}.sha256 beside this dump; its integrity cannot be checked." >&2
  echo "Backups taken before this check existed have none. Proceeding, but confirm the file size" >&2
  echo "looks right against the backup it should resemble." >&2
fi

# Validate RESTORE_REQUEUE_WINDOW while the database is still intact. Casting it inside the requeue step
# (after the drop/restore and the Redis/RabbitMQ purge) would abort mid-restore on a typo, leaving the
# system half-rewound. Fail fast instead. The window must also be strictly positive: Postgres happily casts
# '0' or a negative interval, but after the queue purge that requeues nothing, silently defeating the
# at-least-once replay this step exists for.
window_positive="$(docker compose --env-file "$env_file" -f "$compose_file" exec -T \
  -e REQUEUE_WINDOW="$requeue_window" postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtAX -v ON_ERROR_STOP=1 -v win="$REQUEUE_WINDOW"' <<'SQL'
SELECT extract(epoch FROM (:'win')::interval) > 0;
SQL
)"
if [[ "$(printf '%s' "$window_positive" | tr -d '[:space:]')" != "t" ]]; then
  echo "RESTORE_REQUEUE_WINDOW must be a positive Postgres interval (got '$requeue_window')." >&2
  echo "A zero or negative window requeues no notifications after the queue purge." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" stop monolith
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < "$backup_file"

# --no-owner --no-privileges means every restored object belongs to whoever connected (the owner,
# above) and every GRANT in the dump is discarded. With the H11 split that leaves the runtime
# account with no rights at all, and the site fails on its first query after a restore — silently,
# because the restore itself reports success. Re-applying the grants is not optional.
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1     -v db="$POSTGRES_DB" -v owner="$POSTGRES_USER" -v app="$POSTGRES_APP_USER"   < "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/grant-runtime-user.sql"

# PostgreSQL is now rewound to the backup, but Redis and RabbitMQ keep their own persistent volumes and
# still hold state from after the backup: ticket counters and dedup markers in Redis, and queued
# reservation.approved messages in RabbitMQ that reference tickets no longer in the database. Left in
# place they would let the counter drift, resend emails/QRs, or suppress notifications that should fire.
# Reconcile the volatile stores to match the restored database before the app comes back up.
#   - Redis is safe to wipe: TicketCounterService re-seeds each counter lazily from the inventory row on
#     first access, and dedup markers are best-effort.
#   - RabbitMQ queues are purged so no stale message replays. ALL THREE must be purged: the retry queue
#     holds locked deliveries whose TTL would otherwise expire them back onto the main queue after the app
#     restarts, mailing tickets that no longer exist in the restored database (the dedup markers that would
#     have suppressed them were just flushed). The controlled requeue below is the only replay we want.
# Queue names mirror tvu.notification.rabbit.* in application.yml.
docker compose --env-file "$env_file" -f "$compose_file" exec -T redis \
  sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli FLUSHALL'
docker compose --env-file "$env_file" -f "$compose_file" exec -T rabbitmq \
  rabbitmqctl purge_queue notification.reservation-approved
docker compose --env-file "$env_file" -f "$compose_file" exec -T rabbitmq \
  rabbitmqctl purge_queue notification.reservation-approved.retry
docker compose --env-file "$env_file" -f "$compose_file" exec -T rabbitmq \
  rabbitmqctl purge_queue notification.reservation-approved.dlq

# Purging the queue drops any message that the broker had already accepted but the consumer had not yet
# processed. Those rows are SENT in the restored outbox, and the relay only ever re-claims NEW/PROCESSING,
# so their email/QR would be lost forever. This is a ticketing system, so choose at-least-once and requeue
# the affected SENT rows to NEW.
#
# Only messages still in the queue at backup time are at risk, i.e. sent just before the snapshot. Requeue
# only a window near the backup moment, NOT the entire SENT history: a restore of an old database must not
# re-blast every ticket email/QR ever sent (the Redis dedup markers were just flushed, so there is nothing
# left to suppress those). The window is anchored to the backup watermark (the moment the snapshot was
# taken, resolved above), not to max(sent_at) -- which on a long-idle database can predate the backup by
# months and would drag the whole final cluster back into the window. Widen it with RESTORE_REQUEUE_WINDOW
# (a Postgres interval) if the consumer was known to be lagging when the backup was taken.
docker compose --env-file "$env_file" -f "$compose_file" exec -T \
  -e REQUEUE_WINDOW="$requeue_window" -e BACKUP_WATERMARK="$backup_watermark" postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v win="$REQUEUE_WINDOW" -v wm="$BACKUP_WATERMARK"' <<'SQL'
UPDATE outbox_messages
   SET status = 'NEW', sent_at = NULL, next_attempt_at = NULL,
       locked_at = NULL, locked_by = NULL, locked_until = NULL
 WHERE status = 'SENT'
   AND sent_at >= (:'wm')::timestamptz - (:'win')::interval;
SQL

docker compose --env-file "$env_file" -f "$compose_file" up -d monolith --wait

echo "Restore completed. Redis flushed, RabbitMQ queues purged, SENT outbox rows within the last"
echo "'$requeue_window' before the backup requeued for at-least-once replay."
echo "Verify login, registration, email and check-in before reopening traffic."
