#!/usr/bin/env bash
# Runs the *.test.py suites in this directory.
#
# They existed for months and CI ran none of them. The `lint` job runs fifteen .sh suites by name;
# the only mention of a .test.py anywhere in ci.yml was a comment citing one as evidence for a
# constant. Every collector, every registry reader, the observation assembler and the publish
# orchestrator -- the code that decides what reaches production -- was covered by tests nothing
# executed. Two bugs reached production through that gap.
#
# Discovered, never listed. A hand-maintained list is how the gap reopens: the next .test.py is
# written, nobody remembers this file, and it joins the unrun ones. The discovery itself is checked
# below, because a glob that matches nothing is the failure mode a list does not have.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
shard="${PYTHON_SUITE_SHARD:-}"
shards="${PYTHON_SUITE_SHARDS:-}"

mapfile -t suites < <(find "$here" -maxdepth 1 -name '*.test.py' -print | sort)

if (( ${#suites[@]} == 0 )); then
  echo "No *.test.py matched in $here." >&2
  echo "Failing rather than passing on an empty set, which is how this job would quietly stop" >&2
  echo "checking anything -- the same guard the shellcheck step carries for the same reason." >&2
  exit 1
fi

# Sharding mirrors the `mutations` job: the suites are independent (each builds its own fixtures
# and its own throwaway containers), so splitting them across runners changes how long this takes
# and nothing about what is tested. Unset both and everything runs here, which is what a local run
# does. Within a shard they run one at a time -- several of them assert on `docker ps --filter
# ancestor=registry:2`, which is machine-wide, so two in parallel on one runner would see each
# other's containers.
selected=()
if [[ -n "$shard" && -n "$shards" ]]; then
  for i in "${!suites[@]}"; do
    if (( i % shards == shard )); then
      selected+=("${suites[$i]}")
    fi
  done
  echo "Shard $shard of $shards: ${#selected[@]} of ${#suites[@]} suite(s)"
  if (( ${#selected[@]} == 0 )); then
    echo "This shard selected no suites; there are more shards than suites." >&2
    exit 1
  fi
else
  selected=("${suites[@]}")
  echo "Running all ${#selected[@]} suite(s)"
fi

# One file decides which Python runs, and it probes the interpreter rather than trusting the name:
# on a Windows workstation `python3` is the WindowsApps stub, which exits without running the
# program it was handed. interpreter-override.test.sh scans every .sh here for a named interpreter
# and refuses one -- it caught the first version of this file on CI, which had reached for
# `${PYTHON_BIN:-python3}` directly.
# shellcheck source=python-bin.sh
source "$here/python-bin.sh"

# Two image fixtures, and they are NOT the same kind of dependency.
#
# tiny-test-image.tar is built from the Dockerfile committed beside it, in seconds, so its absence
# is a broken environment and nothing here may run without it. It is gitignored (a .tar is not
# source), which is why CI builds it rather than checks it out.
#
# monolith-test-image.tar is a `docker save` of the real application image -- 259 MB, minutes to
# produce, and it needs the jar. Suites that read it are excluded when it is absent, BY NAME AND
# OUT LOUD. That is a stated gap, not a silent skip: locally, where the fixture exists, every suite
# runs; in CI four of them do not, and this prints which four and why on every run so the gap
# cannot quietly become permanent by being invisible.
fixtures="$here/collector-fixtures"
tiny_fixture="$fixtures/tiny-test-image.tar"
monolith_fixture="$fixtures/monolith-test-image.tar"

if [[ ! -f "$tiny_fixture" ]]; then
  echo "Missing $tiny_fixture." >&2
  echo "It builds from $fixtures/Dockerfile.tiny-test-image in seconds:" >&2
  echo "  docker build -f $fixtures/Dockerfile.tiny-test-image -t tvu-collector-test:tiny $fixtures" >&2
  echo "  docker save tvu-collector-test:tiny -o $tiny_fixture" >&2
  echo "Refusing to run: without it most suites fail for a reason that has nothing to do with" >&2
  echo "the code they test, and excluding them instead would hide real failures." >&2
  exit 1
fi

runnable=()
excluded=()
for suite in "${selected[@]}"; do
  if [[ ! -f "$monolith_fixture" ]] && grep -q 'monolith-test-image\.tar' "$suite"; then
    excluded+=("$(basename "$suite")")
    continue
  fi
  runnable+=("$suite")
done

if (( ${#excluded[@]} > 0 )); then
  echo
  echo "NOT RUN -- these need monolith-test-image.tar, a docker save of the real application image,"
  echo "which is not built here:"
  printf '  %s\n' "${excluded[@]}"
  echo "Everything they cover is unverified by this run. Produce the fixture and they run."
fi

if (( ${#runnable[@]} == 0 )); then
  echo "Every selected suite was excluded; nothing ran." >&2
  exit 1
fi

failures=()
for suite in "${runnable[@]}"; do
  name="$(basename "$suite")"
  echo
  echo "=== $name ==="
  started="$SECONDS"
  # Snapshot before, so the leak check below can tell this suite's containers from anything else
  # already running on the machine.
  before=""
  if command -v docker >/dev/null 2>&1; then
    before="$(docker ps --filter ancestor=registry:2 --format '{{.ID}}' 2>/dev/null | sort)"
  fi
  output="$("$PYTHON" "$suite" 2>&1)"
  status=$?
  echo "$output"
  echo "--- $name finished in $((SECONDS - started))s (exit $status)"

  if (( status != 0 )); then
    failures+=("$name (exit $status)")
    continue
  fi

  # Exit 0 is not the whole answer. Every one of these suites ends by printing
  # `passed=N failed=M` and exiting on M -- so a run that produced no such line did not reach its
  # own summary, and a run reporting passed=0 executed no assertion at all. Both exit 0. Neither is
  # a pass, and a suite that silently stops testing is precisely the thing this job exists to stop
  # happening again.
  summary="$(grep -oE 'passed=[0-9]+ failed=[0-9]+' <<<"$output" | tail -1)"
  if [[ -z "$summary" ]]; then
    failures+=("$name (exited 0 without printing a passed=/failed= summary)")
    continue
  fi
  if [[ "$summary" == "passed=0 "* ]]; then
    failures+=("$name (exited 0 having run zero assertions: $summary)")
    continue
  fi

  # A leaked registry container is attributed to the suite that leaked it rather than left to fail
  # the next one, whose own machine-wide `docker ps` check would report someone else's mess as its
  # own.
  #
  # Only containers that appeared WHILE this suite ran count, and only those are removed. An
  # earlier version compared against nothing and force-removed every registry:2 on the machine --
  # which, on a developer box running one of these suites in another terminal, killed the registry
  # out from under it and produced a "connection refused" failure that looked like a flaky test.
  # Measured, twice, before the cause was found: the runner was the bug.
  if command -v docker >/dev/null 2>&1; then
    after="$(docker ps --filter ancestor=registry:2 --format '{{.ID}}' 2>/dev/null | sort)"
    leaked="$(comm -13 <(printf '%s\n' "$before" | sort) <(printf '%s\n' "$after") | grep . || true)"
    if [[ -n "$leaked" ]]; then
      failures+=("$name (left a registry:2 container running: $(tr '\n' ' ' <<<"$leaked"))")
      # shellcheck disable=SC2086
      docker rm -f $leaked >/dev/null 2>&1 || true
    fi
  fi
done

echo
if (( ${#failures[@]} > 0 )); then
  echo "FAILED ${#failures[@]} of ${#runnable[@]} suite(s):"
  printf '  %s\n' "${failures[@]}"
  exit 1
fi
# Counts what ran, never what was selected. "All 22 suites passed" over a run that executed 18 is
# the precise shape of the misleading green this whole job exists to remove.
echo "All ${#runnable[@]} suite(s) passed."
if (( ${#excluded[@]} > 0 )); then
  echo "(${#excluded[@]} excluded above for want of monolith-test-image.tar.)"
fi
