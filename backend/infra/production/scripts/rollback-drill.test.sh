#!/usr/bin/env bash
# A rehearsal for rollback.sh, which had never been run either.
#
# Everything worth testing in that script is a refusal, and a refusal is only worth anything if it
# fires while the working tree is still where the operator left it. The script itself carries the
# scar: an earlier version copied a hand-written list of four tooling files, missed the one
# preflight.sh sources, and died on "No such file or directory" -- AFTER the checkout had moved the
# tree, leaving old code checked out, new images running, and an error that read like broken tooling
# rather than "your tree has moved". So the assertions here are mostly about WHERE a failure leaves
# HEAD, not merely that it failed.
#
# git is real: a temp repo with a real origin, real commits, real migration files. docker,
# preflight.sh, deploy.sh and backup-postgres.sh are stubs -- this drill is about rollback.sh's own
# decisions, and it runs in the lint job with no daemon and no production host.
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

command -v git >/dev/null 2>&1 || { echo "NOTE  git is unavailable; this drill proves nothing." >&2; exit 1; }

workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT

migration_dir="backend/monolith/src/main/resources/db/migration"

# A deployment tree with a real two-release history: an "old" commit carrying 2 migrations and a
# "new" one carrying 3. Rolling back from new to old is therefore the case the migration guard is
# supposed to refuse when all 3 have been applied, and to allow when only 2 have.
new_case() {
  local name="$1"
  local root="$workspace/$name"
  mkdir -p "$root/deployment/scripts" "$root/repo" "$root/bin"

  cp "$here/rollback.sh" "$root/deployment/scripts/"
  cp "$here/common.sh" "$root/deployment/scripts/"
  printf 'services: {}\n' >"$root/deployment/compose.yaml"
  printf 'POSTGRES_USER=drill_owner\nPOSTGRES_DB=drill_db\n' >"$root/deployment/.env"
  mkdir -p "$root/deployment/.state"

  # Stubs for everything rollback.sh delegates to. Each records that it ran, so the assertions can
  # tell "deploy was never reached" from "deploy ran and failed".
  cat >"$root/deployment/scripts/backup-postgres.sh" <<STUB
#!/usr/bin/env bash
printf 'backup\n' >>"$root/ran.log"
exit "\${DRILL_BACKUP_EXIT:-0}"
STUB
  cat >"$root/deployment/scripts/preflight.sh" <<STUB
#!/usr/bin/env bash
printf 'preflight\n' >>"$root/ran.log"
exit "\${DRILL_PREFLIGHT_EXIT:-0}"
STUB
  cat >"$root/deployment/scripts/deploy.sh" <<STUB
#!/usr/bin/env bash
printf 'deploy\n' >>"$root/ran.log"
exit "\${DRILL_DEPLOY_EXIT:-0}"
STUB
  chmod +x "$root/deployment/scripts/backup-postgres.sh" \
           "$root/deployment/scripts/preflight.sh" \
           "$root/deployment/scripts/deploy.sh"

  cat >"$root/bin/docker" <<STUB
#!/usr/bin/env bash
printf 'docker %s\n' "\$*" >>"$root/ran.log"
cat >/dev/null 2>/dev/null
# The only thing rollback.sh asks docker for is the count of applied migrations.
printf '%s\n' "\${DRILL_APPLIED_MIGRATIONS:-2}"
exit 0
STUB
  chmod +x "$root/bin/docker"

  (
    set -e
    cd "$root/repo"
    git init -q -b main .
    git config user.email drill@example.invalid
    git config user.name Drill
    mkdir -p "$migration_dir"
    printf 'select 1;\n' >"$migration_dir/V1__a.sql"
    printf 'select 1;\n' >"$migration_dir/V2__b.sql"
    printf 'old\n' >app.txt
    git add -A && git commit -qm "old release"
    git branch oldrelease
    printf 'select 1;\n' >"$migration_dir/V3__c.sql"
    printf 'new\n' >app.txt
    git add -A && git commit -qm "new release"
    # rollback.sh fetches from origin; a local bare clone is a real remote for this purpose.
    git clone -q --bare . "$root/origin.git"
    git remote add origin "$root/origin.git"
  ) >/dev/null 2>&1 || { echo "could not build the fixture repo" >&2; exit 1; }

  CASE_ROOT="$root"
}

run_rollback() {
  local root="$CASE_ROOT"
  : >"$root/ran.log"
  HEAD_BEFORE="$(git -C "$root/repo" rev-parse HEAD)"
  (
    export PATH="$root/bin:$PATH"
    export DEPLOYMENT_DIR_OVERRIDE="$root/deployment"
    export REPOSITORY_DIR_OVERRIDE="$root/repo"
    bash "$root/deployment/scripts/rollback.sh" "$@" \
      >"$root/stdout.log" 2>"$root/stderr.log" </dev/null
  )
  local status=$?
  HEAD_AFTER="$(git -C "$root/repo" rev-parse HEAD)"
  RAN_LOG="$root/ran.log"
  ERR_LOG="$root/stderr.log"
  return $status
}

tree_did_not_move() { [[ "$HEAD_BEFORE" == "$HEAD_AFTER" ]]; }

# ---------------------------------------------------------------------------

new_case no-confirm
run_rollback
status=$?
if [[ $status -eq 2 ]] && tree_did_not_move; then
  report "running it with no --confirm prints usage and changes nothing" ok
else
  report "running it with no --confirm prints usage and changes nothing" fail \
    "exit $status, HEAD $HEAD_BEFORE -> $HEAD_AFTER"
fi

new_case unsafe-ref
run_rollback --confirm 'oldrelease;rm -rf /'
status=$?
if [[ $status -ne 0 ]] && tree_did_not_move && ! grep -q '^deploy$' "$RAN_LOG"; then
  report "a ref containing shell metacharacters is refused" ok
else
  report "a ref containing shell metacharacters is refused" fail "exit $status"
fi

new_case no-previous-ref
run_rollback --confirm
status=$?
if [[ $status -ne 0 ]] && tree_did_not_move; then
  report "with no recorded previous release and no argument, it refuses" ok
else
  report "with no recorded previous release and no argument, it refuses" fail "exit $status"
fi

new_case dirty-tree
printf 'uncommitted\n' >"$CASE_ROOT/repo/app.txt"
run_rollback --confirm oldrelease
status=$?
if [[ $status -ne 0 ]] && ! grep -q '^deploy$' "$RAN_LOG"; then
  report "a production checkout with modified tracked files is refused" ok
else
  report "a production checkout with modified tracked files is refused" fail \
    "exit $status; a rollback would have discarded an operator's in-flight edit"
fi

# The guard that matters most in a real incident. Three migrations applied, a target that ships
# two: rolling the code back does not reverse a migration, and Flyway would refuse to start.
new_case migration-guard
DRILL_APPLIED_MIGRATIONS=3 run_rollback --confirm oldrelease
status=$?
if [[ $status -ne 0 ]] && tree_did_not_move && ! grep -q '^deploy$' "$RAN_LOG"; then
  report "rolling back past an applied migration is refused with the tree still intact" ok
else
  report "rolling back past an applied migration is refused with the tree still intact" fail \
    "exit $status, HEAD $HEAD_BEFORE -> $HEAD_AFTER; the operator would meet this at migrate.sh instead, after the checkout"
fi

# ...and it must not be so eager that it blocks a legitimate rollback.
new_case migration-guard-allows
DRILL_APPLIED_MIGRATIONS=2 run_rollback --confirm oldrelease
status=$?
if [[ $status -eq 0 ]]; then
  report "a rollback to a commit containing every applied migration is allowed" ok
else
  report "a rollback to a commit containing every applied migration is allowed" fail \
    "exit $status: $(tr -d '\r' <"$ERR_LOG" | tail -2 | tr '\n' ' ')"
fi

new_case happy-path
DRILL_APPLIED_MIGRATIONS=2 run_rollback --confirm oldrelease
status=$?
expected="$(git -C "$CASE_ROOT/repo" rev-parse oldrelease)"
if [[ $status -eq 0 && "$HEAD_AFTER" == "$expected" ]]; then
  report "a successful rollback leaves the tree on the target commit" ok
else
  report "a successful rollback leaves the tree on the target commit" fail \
    "exit $status, HEAD is $HEAD_AFTER, expected $expected"
fi

grep -q backup "$RAN_LOG" \
  && report "a verified backup is taken before the rollback proceeds" ok \
  || report "a verified backup is taken before the rollback proceeds" fail \
       "no backup ran, so the rollback has nothing to fall back to"

# preflight before the checkout, not after: a rollback that fails its own preconditions must fail
# with the tree still where it was.
pre_line="$(grep -n preflight "$RAN_LOG" | head -1 | cut -d: -f1)"
dep_line="$(grep -n '^deploy$' "$RAN_LOG" | head -1 | cut -d: -f1)"
if [[ -n "$pre_line" && -n "$dep_line" && "$pre_line" -lt "$dep_line" ]]; then
  report "preflight runs before deploy" ok
else
  report "preflight runs before deploy" fail "preflight at ${pre_line:-none}, deploy at ${dep_line:-none}"
fi

new_case preflight-fails
DRILL_APPLIED_MIGRATIONS=2 DRILL_PREFLIGHT_EXIT=1 run_rollback --confirm oldrelease
status=$?
if [[ $status -ne 0 ]] && tree_did_not_move && ! grep -q '^deploy$' "$RAN_LOG"; then
  report "a failing preflight stops the rollback before the tree is moved" ok
else
  report "a failing preflight stops the rollback before the tree is moved" fail \
    "exit $status, HEAD $HEAD_BEFORE -> $HEAD_AFTER"
fi

# The recovery path. deploy.sh fails after the checkout has already moved the tree; the ERR trap is
# the only thing that puts the operator back where they started.
new_case deploy-fails
DRILL_APPLIED_MIGRATIONS=2 DRILL_DEPLOY_EXIT=1 run_rollback --confirm oldrelease
status=$?
if [[ $status -ne 0 ]] && tree_did_not_move; then
  report "a failing deploy returns the working tree to the release it started on" ok
else
  report "a failing deploy returns the working tree to the release it started on" fail \
    "exit $status, HEAD $HEAD_BEFORE -> $HEAD_AFTER; the operator is left on a tree they did not choose"
fi

echo ""
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
