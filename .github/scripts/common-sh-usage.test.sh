#!/usr/bin/env bash
# Every deployment script that calls a common.sh helper must source common.sh.
#
# This exists because of a production incident, not a hypothetical. migrate.sh moved from reading
# the .env with `source` to using common.sh's env_value, and the `source common.sh` line did not
# come with the calls -- migrate.sh had never needed it, because it sets its own paths and defines
# its own compose(). deploy.sh, preflight.sh, smoke-test.sh and rollback.sh all source it already,
# which is exactly why the omission was invisible.
#
# Nothing else catches it. shellcheck treats an unknown command as a command. `bash -n` parses it.
# No test executes these scripts. It fails only when it runs for real: a production migration died
# on "env_value: command not found" AFTER the build had finished and the datastores were up, and
# because it died there it never reached the step that grants the runtime account its privileges --
# so the application came up unable to read its own tables.
#
# A file rather than an inline `run:` block in ci.yml, so it can be run on a developer machine and
# so shellcheck lints it the same way it lints everything else here.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
target_dir="$repo_root/backend/infra/production/scripts"

passed=0
failed=0

[[ -d "$target_dir" ]] || {
  echo "FAIL  $target_dir does not exist; this check cannot check anything"
  echo "passed=0 failed=1"
  exit 1
}

shopt -s nullglob
scripts=("$target_dir"/*.sh)
if [[ ${#scripts[@]} -eq 0 ]]; then
  # An empty set is how a check like this quietly stops checking. Refuse it.
  echo "FAIL  no scripts matched $target_dir/*.sh"
  echo "passed=0 failed=1"
  exit 1
fi

# The helpers common.sh defines. A script calling one of these without sourcing the file is the
# defect; common.sh itself is excluded because it is where they come from.
helpers='(env_value|require_env_value|current_release_ref)'

for script in "${scripts[@]}"; do
  name="$(basename "$script")"
  [[ "$name" != "common.sh" ]] || continue
  if grep -qE "$helpers " "$script"; then
    # Matches sourcing common.sh however the path is spelled. Naming the exact literal would mean
    # writing a dollar sign inside single quotes, which is a different fight with a different tool.
    if grep -qE 'source .*common\.sh' "$script"; then
      echo "ok    $name uses a common.sh helper and sources common.sh"
      ((passed++))
    else
      echo "FAIL  $name uses a common.sh helper without sourcing common.sh"
      ((failed++))
    fi
  fi
done

if [[ $((passed + failed)) -eq 0 ]]; then
  echo "FAIL  no script uses a common.sh helper; the pattern must have gone stale"
  echo "passed=0 failed=1"
  exit 1
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
