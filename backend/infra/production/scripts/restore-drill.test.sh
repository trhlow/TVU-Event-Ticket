#!/usr/bin/env bash
# A rehearsal for restore-postgres-into-new-stack.sh, which had never been run.
#
# That script is the only way to rewind production data, and every one of its guards existed on
# faith: nothing in this repository had ever executed a single line of it. The first thing this
# drill found is the reason it exists. The grant step is the one psql invocation not wrapped in a
# single-quoted `sh -c`, so $POSTGRES_USER/$POSTGRES_DB/$POSTGRES_APP_USER are expanded by the
# HOST shell -- and the script never defined them. Under `set -u` it aborted on
# "POSTGRES_USER: unbound variable", *after* dropdb and pg_restore had already run. Database
# replaced, runtime account ungranted, Redis unflushed, three queues unpurged, monolith stopped.
# The half-restored state the script's own header warns about, reached on the happy path.
#
# Reading the line does not reveal it: it is a copy of migrate.sh:90, which works only because
# migrate.sh reads the .env into the host shell first. Only running it does.
#
# docker is a stub, so this runs in the lint job with no daemon. That is a real limit and it is
# named here rather than glossed: this drill proves the ORDER and the ARGUMENTS -- what runs, with
# which values, and crucially what does NOT run before the preconditions pass. It does not prove
# that pg_restore can read a real dump. The subject is a copy of the real file, never a rewrite.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
passed=0
failed=0

report() {
  if [[ "$2" == "ok" ]]; then
    passed=$((passed + 1))
    echo "ok    $1"
  else
    failed=$((failed + 1))
    echo "FAIL  $1: $3"
  fi
}

# The subject parses `docker compose config` with a real interpreter and fails closed when it
# cannot. Probed by what comes back rather than by exit status, because the Windows `python3` is a
# store stub that exits 0 having run nothing -- the same reason .github/scripts/python-bin.sh
# exists.
drill_python=""
for candidate in "${PYTHON_BIN:-}" python3 python; do
  [[ -n "$candidate" ]] || continue
  command -v "$candidate" >/dev/null 2>&1 || continue
  if [[ "$(printf 'import sys\nsys.stdout.write("OK")\n' | "$candidate" - 2>/dev/null)" == "OK" ]]; then
    drill_python="$candidate"
    break
  fi
done
if [[ -z "$drill_python" ]]; then
  echo "NOTE  no working Python 3 on PATH, so every case below is SKIPPED." >&2
  echo "NOTE  This drill then proves nothing. Install one, or set PYTHON_BIN." >&2
  exit 1
fi

workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT

# Distinctive values: an assertion that matches "postgres" would also match the image name and the
# service name, and would pass whether or not the .env was ever read.
DB_NAME="drill_db"
DB_OWNER="drill_owner"
DB_APP="drill_app"

# One fake deployment tree per case, holding a copy of the real scripts. Copied rather than
# reimplemented, so a future edit to the real file is what this drill sees.
new_deployment() {
  local root="$1"
  mkdir -p "$root/scripts"
  cp "$here/restore-postgres-into-new-stack.sh" "$root/scripts/"
  cp "$here/common.sh" "$root/scripts/"
  cp "$here/grant-runtime-user.sql" "$root/scripts/"
  printf 'services: {}\n' >"$root/compose.yaml"
  cat >"$root/.env" <<EOF
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_OWNER
POSTGRES_PASSWORD=drill_owner_password
POSTGRES_APP_USER=$DB_APP
POSTGRES_APP_PASSWORD=drill_app_password
REDIS_PASSWORD=drill_redis_password
EOF
}

# Emulates only what the subject asks of docker, and records every invocation so the assertions can
# ask what ran and in what order.
install_docker_stub() {
  local bindir="$1"
  mkdir -p "$bindir"
  cat >"$bindir/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$DRILL_LOG"
# Every invocation the subject gives stdin to is a redirect it wrote itself; the subject runs with
# stdin on /dev/null, so draining unconditionally cannot block.
cat >/dev/null 2>/dev/null
case "$*" in
  *"config --format json"*)
    [[ "${DRILL_CONFIG_FAILS:-0}" == "1" ]] && exit 1
    # Pretty-printed with a space after the colon, exactly as compose emits it. The guard this
    # feeds once used a pattern that assumed no space, matched nothing, and stood between an
    # operator and dropdb while doing nothing at all.
    printf '{\n  "name": "%s",\n  "services": {}\n}\n' "$DRILL_PROJECT_NAME"
    ;;
  *BACKUP_WATERMARK*)
    # The SENT requeue. Must be matched before the window probe below: it carries both variables.
    ;;
  *REQUEUE_WINDOW*)
    printf '%s\n' "${DRILL_WINDOW_POSITIVE:-t}"
    ;;
esac
exit 0
STUB
  chmod +x "$bindir/docker"
}

# Runs the subject in an isolated tree. Echoes its exit status; the log is left at $DRILL_LOG.
run_restore() {
  local name="$1"
  shift
  local root="$workspace/$name"
  new_deployment "$root"
  install_docker_stub "$root/bin"

  local stamp="20260818T101500Z"
  local dump="$root/tvu_app_${stamp}.dump"
  printf 'PGDMP fake dump body\n' >"$dump"
  printf 'BACKUP_STARTED_AT=%s\n' "$stamp" >"${dump}.meta"
  sha256sum "$dump" | awk '{print $1}' >"${dump}.sha256"

  DRILL_LOG="$root/docker.log"
  : >"$DRILL_LOG"

  # "$@" is the per-case mutation, applied to the tree just built.
  local mutate="${1:-}"
  [[ -z "$mutate" ]] || "$mutate" "$root" "$dump"

  (
    export PATH="$root/bin:$PATH"
    export DRILL_LOG
    export DRILL_PROJECT_NAME="${DRILL_PROJECT_NAME:-tvu-event-ticket-drill}"
    export DRILL_CONFIG_FAILS="${DRILL_CONFIG_FAILS:-0}"
    export DRILL_WINDOW_POSITIVE="${DRILL_WINDOW_POSITIVE:-t}"
    export PYTHON_BIN="$drill_python"
    export ENV_FILE="$root/.env"
    cd "$root" || exit 99
    bash "$root/scripts/restore-postgres-into-new-stack.sh" --confirm "$dump" \
      >"$root/stdout.log" 2>"$root/stderr.log" </dev/null
  )
  local status=$?
  LAST_LOG="$root/docker.log"
  LAST_ERR="$root/stderr.log"
  return $status
}

# ---------------------------------------------------------------------------
# The case this drill was written for.
# ---------------------------------------------------------------------------

run_restore happy-path
happy_status=$?
happy_log="$LAST_LOG"

if [[ $happy_status -eq 0 ]]; then
  report "a restore into a disposable stack runs to completion" ok
else
  report "a restore into a disposable stack runs to completion" fail \
    "exited $happy_status: $(tr -d '\r' <"$LAST_ERR" | tail -3 | tr '\n' ' ')"
fi

# The regression itself. Not "a grant ran" but "the grant ran carrying the values from the .env":
# an unbound variable and a silently-empty one are different bugs with the same symptom, and only
# naming the values distinguishes them.
if grep -q -- "psql -U $DB_OWNER -d $DB_NAME .*-v db=$DB_NAME -v owner=$DB_OWNER -v app=$DB_APP" "$happy_log"; then
  report "the runtime grants are applied with the identities from the .env" ok
else
  report "the runtime grants are applied with the identities from the .env" fail \
    "no grant psql carrying $DB_OWNER/$DB_NAME/$DB_APP reached docker; the restore stopped before it"
fi

# Reconciling the volatile stores is not optional: skipping any one of them leaves the restored
# database contradicted by Redis counters or by messages still sitting in a queue.
grep -q "FLUSHALL" "$happy_log" \
  && report "Redis is flushed so the ticket counters re-seed from the restored rows" ok \
  || report "Redis is flushed so the ticket counters re-seed from the restored rows" fail "no FLUSHALL"

purges="$(grep -c "purge_queue" "$happy_log")"
if [[ "$purges" == "3" ]]; then
  report "all three notification queues are purged, retry and dlq included" ok
else
  report "all three notification queues are purged, retry and dlq included" fail \
    "purge_queue ran $purges time(s), expected 3; a surviving retry queue re-mails tickets that no longer exist"
fi

grep -q "BACKUP_WATERMARK" "$happy_log" \
  && report "the SENT outbox rows near the backup moment are requeued" ok \
  || report "the SENT outbox rows near the backup moment are requeued" fail \
       "no requeue ran, so mail the broker had accepted but not delivered is lost"

grep -q "up -d monolith" "$happy_log" \
  && report "the application is brought back up at the end" ok \
  || report "the application is brought back up at the end" fail \
       "monolith was stopped and never started; the site stays down"

# Order, not just presence. Every one of these must land on the correct side of the drop.
drop_line="$(grep -n "dropdb" "$happy_log" | head -1 | cut -d: -f1)"
grant_line="$(grep -n "\-v app=$DB_APP" "$happy_log" | head -1 | cut -d: -f1)"
if [[ -n "$drop_line" && -n "$grant_line" && "$grant_line" -gt "$drop_line" ]]; then
  report "the grants are re-applied after the restore, not before it" ok
else
  report "the grants are re-applied after the restore, not before it" fail \
    "dropdb at line ${drop_line:-none}, grant at line ${grant_line:-none}"
fi

# ---------------------------------------------------------------------------
# Every refusal must happen while the old database is still there. A guard that
# fires after dropdb is not a guard.
# ---------------------------------------------------------------------------

refuses_before_dropping() {
  local label="$1" status="$2" log="$3"
  if [[ "$status" -eq 0 ]]; then
    report "$label" fail "the script exited 0 and went ahead"
  elif grep -q "dropdb" "$log"; then
    report "$label" fail "it refused, but only AFTER dropdb had already run"
  else
    report "$label" ok
  fi
}

DRILL_PROJECT_NAME="tvu-event-ticket" run_restore live-stack
refuses_before_dropping "restoring into the live production stack is refused" $? "$LAST_LOG"

DRILL_CONFIG_FAILS=1 run_restore unknown-stack
refuses_before_dropping "an undeterminable project name is refused, not assumed safe" $? "$LAST_LOG"

DRILL_PROJECT_NAME="tvu-event-ticket" ALLOW_IN_PLACE_RESTORE=1 run_restore in-place-override
if [[ $? -eq 0 ]]; then
  report "ALLOW_IN_PLACE_RESTORE=1 is still an available escape hatch" ok
else
  report "ALLOW_IN_PLACE_RESTORE=1 is still an available escape hatch" fail \
    "the documented override no longer works: $(tr -d '\r' <"$LAST_ERR" | tail -2 | tr '\n' ' ')"
fi

corrupt_the_dump() { printf 'tampered\n' >>"$2"; }
run_restore checksum-mismatch corrupt_the_dump
refuses_before_dropping "a dump that does not match its .sha256 is refused" $? "$LAST_LOG"

# The watermark comes from the .meta sidecar or, failing that, from the dump's filename, so this
# case needs a dump with neither -- built inline rather than mutated, since run_restore's fixture is
# named tvu_app_<stamp>.dump by construction.
(
  root="$workspace/watermark"
  new_deployment "$root"
  install_docker_stub "$root/bin"
  dump="$root/backup-without-a-timestamp.dump"
  printf 'PGDMP fake dump body\n' >"$dump"
  sha256sum "$dump" | awk '{print $1}' >"${dump}.sha256"
  export PATH="$root/bin:$PATH" DRILL_LOG="$root/docker.log" \
    DRILL_PROJECT_NAME="tvu-drill" DRILL_CONFIG_FAILS=0 DRILL_WINDOW_POSITIVE=t \
    PYTHON_BIN="$drill_python" ENV_FILE="$root/.env"
  : >"$DRILL_LOG"
  cd "$root" || exit 99
  bash "$root/scripts/restore-postgres-into-new-stack.sh" --confirm "$dump" >/dev/null 2>&1 </dev/null
  status=$?
  [[ $status -ne 0 ]] && ! grep -q dropdb "$DRILL_LOG"
)
[[ $? -eq 0 ]] \
  && report "a dump whose backup moment cannot be established is refused" ok \
  || report "a dump whose backup moment cannot be established is refused" fail \
       "it proceeded, so the requeue window would be anchored to nothing"

DRILL_WINDOW_POSITIVE=f run_restore zero-window
refuses_before_dropping "a non-positive RESTORE_REQUEUE_WINDOW is refused" $? "$LAST_LOG"

drop_app_user_from_env() { grep -v '^POSTGRES_APP_USER=' "$1/.env" >"$1/.env.tmp" && mv "$1/.env.tmp" "$1/.env"; }
run_restore missing-app-user drop_app_user_from_env
refuses_before_dropping "a .env with no POSTGRES_APP_USER is refused before anything is dropped" $? "$LAST_LOG"

echo ""
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
