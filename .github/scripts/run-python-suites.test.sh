#!/usr/bin/env bash
# Tests the runner, not the suites it runs.
#
# The runner is the thing standing between "22 test files exist" and "22 test files are evidence",
# so the ways it can lie matter more than the ways it can crash: reporting green over a suite that
# ran nothing, over a directory where the glob matched nothing, or over a shard split that quietly
# drops a file. Each of those is checked here against a fake tree, so no real suite -- and no
# Docker -- is involved.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
subject="$here/run-python-suites.sh"
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

[[ -f "$subject" ]] || { echo "FAIL  cannot find $subject"; exit 1; }

workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT

# A tree holding a copy of the runner and whatever fake suites the case needs. The copy is what
# makes `here` resolve to the fake tree instead of the repository.
new_tree() {
  local dir="$workspace/$1"
  mkdir -p "$dir/nodocker" "$dir/collector-fixtures"
  cp "$subject" "$dir/run-python-suites.sh"
  # The runner refuses to start without the tiny fixture, so every tree gets one. Its contents are
  # never read here -- no fake suite opens it -- only its existence is.
  : > "$dir/collector-fixtures/tiny-test-image.tar"
  # A `docker` that reports no containers, shadowing the real one on PATH. The runner's leak check
  # asks the whole machine what is running, so without this the cases below fail whenever anything
  # else on the developer's box has a registry:2 up -- which is exactly what happened on the first
  # run of this file: a real suite was running in another terminal and its container was blamed on
  # a fake suite here. Stubbed rather than skipped, so the leak check still executes.
  cat > "$dir/nodocker/docker" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  chmod +x "$dir/nodocker/docker"
  echo "$dir"
}
run_tree() {
  local dir="$1"; shift
  ( cd "$dir" && PATH="$dir/nodocker:$PATH" env "$@" bash "$dir/run-python-suites.sh" 2>&1 )
}

make_suite() {  # dir, name, exit code, summary line
  cat > "$1/$2.test.py" <<PY
import sys
print("ok    something was asserted")
print("$4")
sys.exit($3)
PY
}

# 1. The happy path, and the count in the message.
tree="$(new_tree happy)"
make_suite "$tree" alpha 0 "passed=3 failed=0"
make_suite "$tree" beta  0 "passed=1 failed=0"
out="$(run_tree "$tree")"; status=$?
if (( status == 0 )) && grep -q "All 2 suite(s) passed" <<<"$out"; then
  report "two passing suites are reported as two passing suites" ok
else
  report "two passing suites are reported as two passing suites" fail "exit=$status out=$out"
fi

# 2. A failing suite fails the run, and is named.
tree="$(new_tree failing)"
make_suite "$tree" alpha 0 "passed=2 failed=0"
make_suite "$tree" broken 1 "passed=1 failed=1"
out="$(run_tree "$tree")"; status=$?
if (( status != 0 )) && grep -q "broken.test.py" <<<"$out"; then
  report "a suite that exits non-zero fails the run and is named" ok
else
  report "a suite that exits non-zero fails the run and is named" fail "exit=$status out=$out"
fi

# 3. THE one that matters: exit 0 having asserted nothing. This is what a suite looks like after
#    someone comments its body out, and it is indistinguishable from success by exit code alone.
tree="$(new_tree zero)"
make_suite "$tree" hollow 0 "passed=0 failed=0"
out="$(run_tree "$tree")"; status=$?
if (( status != 0 )) && grep -q "zero assertions" <<<"$out"; then
  report "a suite that exits 0 having run zero assertions is refused" ok
else
  report "a suite that exits 0 having run zero assertions is refused" fail "exit=$status out=$out"
fi

# 4. Exit 0 without ever reaching its own summary -- a suite that died past its last print, or one
#    that never adopted the convention. Not a pass either.
tree="$(new_tree nosummary)"
cat > "$tree/quiet.test.py" <<'PY'
print("ok    looks fine")
PY
out="$(run_tree "$tree")"; status=$?
if (( status != 0 )) && grep -q "without printing a passed=" <<<"$out"; then
  report "a suite that never prints its summary is refused" ok
else
  report "a suite that never prints its summary is refused" fail "exit=$status out=$out"
fi

# 5. An empty tree must fail. A glob that matches nothing is the failure a hand-maintained list
#    cannot have and a discovered one can, so it is the one discovery has to answer for.
tree="$(new_tree empty)"
out="$(run_tree "$tree")"; status=$?
if (( status != 0 )) && grep -q "No \*.test.py matched" <<<"$out"; then
  report "an empty directory fails instead of passing on nothing" ok
else
  report "an empty directory fails instead of passing on nothing" fail "exit=$status out=$out"
fi

# 6. Sharding must partition: every suite in exactly one shard, none twice, none dropped. A split
#    that silently loses a file gives every shard a green tick and tests less than before.
tree="$(new_tree shards)"
for n in a b c d e; do make_suite "$tree" "$n" 0 "passed=1 failed=0"; done
seen=""
shard_status=0
for s in 0 1 2; do
  out="$(run_tree "$tree" PYTHON_SUITE_SHARD="$s" PYTHON_SUITE_SHARDS=3)" || shard_status=1
  seen+="$(grep -oE '=== [a-e]\.test\.py ===' <<<"$out" | grep -oE '[a-e]\.test\.py')"$'\n'
done
unique_count="$(grep -c . <<<"$(sort -u <<<"$seen" | grep .)")"
total_count="$(grep -c . <<<"$(grep . <<<"$seen")")"
if (( shard_status == 0 )) && [[ "$unique_count" == 5 && "$total_count" == 5 ]]; then
  report "three shards cover all five suites exactly once" ok
else
  report "three shards cover all five suites exactly once" fail \
    "status=$shard_status unique=$unique_count total=$total_count"
fi

# 7. A suite needing the monolith fixture is excluded when it is absent -- and the run says so and
#    counts only what ran. "All 2 suites passed" over a run that executed one is the misleading
#    green this whole job exists to remove, so the count is asserted, not just the notice.
tree="$(new_tree monolith_absent)"
make_suite "$tree" plain 0 "passed=1 failed=0"
cat > "$tree/heavy.test.py" <<'PY'
# references collector-fixtures/monolith-test-image.tar
import sys
print("passed=1 failed=0")
sys.exit(0)
PY
out="$(run_tree "$tree")"; status=$?
if (( status == 0 )) \
   && grep -q "heavy.test.py" <<<"$out" \
   && grep -q "NOT RUN" <<<"$out" \
   && grep -q "All 1 suite(s) passed" <<<"$out"; then
  report "a monolith-fixture suite is excluded by name, and the total counts only what ran" ok
else
  report "a monolith-fixture suite is excluded by name, and the total counts only what ran" fail \
    "exit=$status out=$out"
fi

# 8. ...and runs when the fixture is there, so the exclusion is about the fixture and not about the
#    suite's name.
tree="$(new_tree monolith_present)"
: > "$tree/collector-fixtures/monolith-test-image.tar"
cat > "$tree/heavy.test.py" <<'PY'
# references collector-fixtures/monolith-test-image.tar
import sys
print("passed=1 failed=0")
sys.exit(0)
PY
out="$(run_tree "$tree")"; status=$?
if (( status == 0 )) && grep -q "All 1 suite(s) passed" <<<"$out" && ! grep -q "NOT RUN" <<<"$out"; then
  report "the same suite runs once the monolith fixture exists" ok
else
  report "the same suite runs once the monolith fixture exists" fail "exit=$status out=$out"
fi

# 9. A missing tiny fixture is a broken environment, not something to work around by excluding the
#    suites that need it -- that would turn an environment fault into a quiet reduction in coverage.
tree="$(new_tree no_tiny)"
rm -f "$tree/collector-fixtures/tiny-test-image.tar"
make_suite "$tree" plain 0 "passed=1 failed=0"
out="$(run_tree "$tree")"; status=$?
if (( status != 0 )) && grep -q "tiny-test-image.tar" <<<"$out"; then
  report "a missing tiny fixture stops the run instead of shrinking it" ok
else
  report "a missing tiny fixture stops the run instead of shrinking it" fail "exit=$status out=$out"
fi

# 10. The leak check must only see containers that appeared while the suite ran. A stubbed docker
#     reports the same pre-existing container before and after, standing in for someone else's
#     registry on the same machine: the run must stay green and the container must not be touched.
#     The first version of this runner force-removed every registry:2 it found, killed a real suite
#     running in another terminal, and produced two "connection refused" failures that read as
#     flaky tests.
tree="$(new_tree preexisting_container)"
make_suite "$tree" plain 0 "passed=1 failed=0"
cat > "$tree/nodocker/docker" <<'STUB'
#!/usr/bin/env bash
# Someone else's registry, up before this run and still up after.
if [[ "${1:-}" == "ps" ]]; then echo "beefbeefbeef"; exit 0; fi
# Any rm reaching here is the bug this case exists for.
if [[ "${1:-}" == "rm" ]]; then echo "REMOVED-SOMETHING" >&2; exit 0; fi
exit 0
STUB
chmod +x "$tree/nodocker/docker"
out="$(run_tree "$tree" 2>&1)"; status=$?
if (( status == 0 )) && ! grep -q "left a registry:2" <<<"$out" && ! grep -q "REMOVED-SOMETHING" <<<"$out"; then
  report "a container that was already running is neither blamed nor removed" ok
else
  report "a container that was already running is neither blamed nor removed" fail \
    "exit=$status out=$out"
fi

# 11. ...and one that genuinely appears during the suite is still caught, or the check above would
#     have been bought by disabling the check.
tree="$(new_tree real_leak)"
make_suite "$tree" leaky 0 "passed=1 failed=0"
cat > "$tree/nodocker/docker" <<'STUB'
#!/usr/bin/env bash
marker="$(dirname "$0")/.seen"
if [[ "${1:-}" == "ps" ]]; then
  if [[ -f "$marker" ]]; then echo "cafecafecafe"; else : > "$marker"; fi
  exit 0
fi
exit 0
STUB
chmod +x "$tree/nodocker/docker"
out="$(run_tree "$tree" 2>&1)"; status=$?
if (( status != 0 )) && grep -q "left a registry:2 container running: cafecafecafe" <<<"$out"; then
  report "a container that appeared during the suite is caught and attributed to it" ok
else
  report "a container that appeared during the suite is caught and attributed to it" fail \
    "exit=$status out=$out"
fi

# 12. More shards than suites is a misconfiguration, not an idle runner reporting success.
tree="$(new_tree oversharded)"
make_suite "$tree" only 0 "passed=1 failed=0"
out="$(run_tree "$tree" PYTHON_SUITE_SHARD=3 PYTHON_SUITE_SHARDS=8)"; status=$?
if (( status != 0 )) && grep -q "selected no suites" <<<"$out"; then
  report "a shard with nothing to do fails instead of reporting success" ok
else
  report "a shard with nothing to do fails instead of reporting success" fail "exit=$status out=$out"
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
