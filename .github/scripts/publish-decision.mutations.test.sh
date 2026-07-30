#!/usr/bin/env bash
# The runner refuses to report mutation results on a red baseline, which is right. What it did not do
# was say why: it captured the suite's stdout and stderr, counted the lines beginning with FAIL, and
# printed that count. A baseline that dies before printing any has none, so the report read
# "(0 failing)" while the reason sat in a variable that was never used. That cost two full runs in
# one afternoon -- once for a bash that could not start the suite, once for an interpreter that never
# ran the program it was handed -- and in both cases the runner had the explanation in hand.
#
# The fake here is a fake suite rather than a fake bash. Windows cannot exec a shebang script from
# Python, so a fake bash would fail to start rather than fail loudly: the runner would report a red
# baseline for a reason the test did not choose, and the test would pass without ever exercising the
# path it was written for.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

passed=0
failed=0

report() {
  if [[ -z "$2" ]]; then
    printf 'ok    %s\n' "$1"; passed=$((passed + 1))
  else
    printf 'FAIL  %s: %s\n' "$1" "$2"; failed=$((failed + 1))
  fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The runner resolves what it copies from its own directory, so a copy of it in here picks up the
# fake suite beside it and the real working tree is never involved.
scripts="$work/scripts"
mkdir -p "$scripts"
for name in publish-decision.mutations.py publish-decision.sh python-bin.sh; do
  cp "$script_dir/$name" "$scripts/$name"
done

# A suite that cannot run at all: a diagnosis on both streams, a non-zero exit, and far more output
# than belongs in a lint log. The line that matters is the last one of each stream, which is where a
# traceback puts it and where a report that keeps only the beginning would lose it.
{
  printf '#!/usr/bin/env bash\n'
  printf 'printf "stdout-first-line\\n"\n'
  printf 'i=2; while [ "$i" -lt 200 ]; do printf "stdout filler %%s\\n" "$i"; i=$((i + 1)); done\n'
  printf 'printf "stdout-cause-line\\n"\n'
  printf 'printf "stderr-first-line\\n" >&2\n'
  printf 'i=2; while [ "$i" -lt 200 ]; do printf "stderr filler %%s\\n" "$i" >&2; i=$((i + 1)); done\n'
  printf 'printf "stderr-cause-line\\n" >&2\n'
  printf 'exit 3\n'
} > "$scripts/publish-decision.test.sh"
chmod +x "$scripts/publish-decision.test.sh"

# "$BASH" rather than `bash`: on this workstation PATH resolves to WSL's, which is the failure the
# override exists for, and a test that reached for PATH would be reproducing it instead of testing.
out="$(PUBLISH_DECISION_BASH="$BASH" "$PYTHON" "$scripts/publish-decision.mutations.py" 2>&1)"
rc=$?
lines="$(printf '%s\n' "$out" | wc -l)"

problems=""
(( rc != 0 )) || problems="exited 0 on a red baseline"
report "a red baseline is still refused" "$problems"

problems=""
printf '%s' "$out" | grep -q 'red before any mutation' \
  || problems="did not say the baseline was red: ${out:0:200}"
report "the refusal still names what happened" "$problems"

problems=""
printf '%s' "$out" | grep -q 'stderr-cause-line' || problems="stderr was captured and then dropped"
report "the reason on stderr reaches the report" "$problems"

problems=""
printf '%s' "$out" | grep -q 'stdout-cause-line' || problems="stdout was captured and then dropped"
report "the reason on stdout reaches the report" "$problems"

# Bounded, and bounded from the end. Four hundred lines of filler pasted into a job log is how a
# runner teaches people to stop reading its output, and a report that silently keeps a fraction is
# how someone concludes the suite printed nothing.
problems=""
(( lines <= 80 )) || problems="printed $lines lines; "
printf '%s' "$out" | grep -q 'omitted' || problems="${problems}dropped lines without saying so; "
if printf '%s' "$out" | grep -q 'stderr-first-line'; then
  problems="${problems}pasted the flood whole; "
fi
report "the report is bounded and says what it left out" "$problems"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
