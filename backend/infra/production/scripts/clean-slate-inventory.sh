#!/usr/bin/env bash
# Records what the running stack actually holds, so the clean-slate decision rests on a
# counted inventory rather than on someone's recollection that "production is empty".
#
# C3.0 chose clean slate: the v2 stack starts from empty volumes and nothing is migrated
# across. That is irreversible for anything real that was in there, so this script must be
# run -- and its output kept -- BEFORE the old stack is stopped.
#
# Counting users/reservations/tickets is not enough. One club or one event typed in by hand
# is real data, and a message still sitting in the DLQ can send a real email after cutover.
# So: every business table, every queue including retry and dead-letter, and the Redis keys
# that carry business meaning.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"
out_dir="${INVENTORY_DIR:-$deployment_dir/inventory}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing production environment file: $env_file" >&2
  exit 1
fi

umask 077
mkdir -p "$out_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="$out_dir/clean-slate-inventory_${timestamp}.txt"

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

{
  echo "Clean-slate inventory"
  echo "taken_at_utc: $timestamp"
  echo "host: $(hostname)"
  echo "deployed_sha: $(git -C "$deployment_dir" rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo

  echo "== PostgreSQL row counts =="
  # Table names are the plural forms actually created by V1-V11; an earlier draft of the
  # checklist used singular names, which silently counts nothing.
  compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtAX' <<'SQL'
SELECT 'users',              count(*) FROM users
UNION ALL SELECT 'clubs',              count(*) FROM clubs
UNION ALL SELECT 'events',             count(*) FROM events
UNION ALL SELECT 'reservations',       count(*) FROM reservations
UNION ALL SELECT 'tickets',            count(*) FROM tickets
UNION ALL SELECT 'ticket_inventories', count(*) FROM ticket_inventories
UNION ALL SELECT 'audit_log',          count(*) FROM audit_log
UNION ALL SELECT 'outbox_messages',    count(*) FROM outbox_messages
UNION ALL SELECT 'trusted_devices',    count(*) FROM trusted_devices
ORDER BY 1;
SQL
  echo

  echo "== outbox_messages by status =="
  # A SENT row whose consumer never ran is data too: it becomes a real email after cutover.
  compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtAX' <<'SQL'
SELECT status, count(*) FROM outbox_messages GROUP BY status ORDER BY 1;
SQL
  echo

  echo "== RabbitMQ queues (every queue, including retry and DLQ) =="
  compose exec -T rabbitmq rabbitmqctl list_queues --formatter=pretty_table name messages messages_ready messages_unacknowledged
  echo

  echo "== Redis keys with business meaning =="
  # Counted by prefix rather than dumped: values include OTP codes and delivery markers.
  # Prefixes taken from the Java sources, not guessed -- a wrong prefix counts zero and
  # reads exactly like "there is no data here", which is the failure this report exists
  # to prevent. Queues are listed by rabbitmqctl instead, since their names come from
  # configuration and listing everything cannot miss one.
  compose exec -T redis sh -c '
    for pattern in "otp:*" "otp:cooldown:*" "otp:daily:*" "notification:done:*" \
                   "notification:lock:*" "ticket:remaining:*" "auth:revoked:*"; do
      printf "%s\t%s\n" "$pattern" "$(redis-cli --scan --pattern "$pattern" | wc -l)"
    done
    printf "%s\t%s\n" "TOTAL_KEYS" "$(redis-cli dbsize)"
  '
  echo

  echo "== Storage / attachments =="
  echo "N/A - the product stores no uploaded files yet"
} 2>&1 | tee "$report"

echo
echo "Inventory written to: $report"
echo "Keep this file with the cutover record. Clean slate is only justified while every"
echo "count above is either zero or agreed to be disposable test data -- write that"
echo "agreement down next to the file, with who made it and when."
