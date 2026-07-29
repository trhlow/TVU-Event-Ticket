#!/usr/bin/env bash
# Tests for require-green-run.sh.
#
# The cases that matter are the ones where the gate could say yes without having checked: an API
# error mistaken for "no runs", an older green run hiding a newer red one, a conclusion that is not
# success but is not failure either. Each has a test, and each was verified to fail when the
# corresponding guard is removed.
#
# `gh` is stubbed by putting a fake earlier on PATH.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
subject="$script_dir/require-green-run.sh"
SHA=0123456789abcdef0123456789abcdef01234567

passed=0
failed=0
workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT
mkdir -p "$workspace/bin"

# Every stub records the full argv it was called with. Without that the tests pin only the script's
# reaction to an answer, never the question it asked -- and the question is most of the gate.
# Dropping head_sha, branch, event or --paginate leaves it asking about the wrong set of runs while
# every reaction test stays green.
CALLS=""

# write_gh <runs-output> <run-output> [runs-exit] [run-exit]
write_gh() {
  CALLS="$workspace/gh-calls"
  : >"$CALLS"
  cat >"$workspace/bin/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"$CALLS"
if [[ "\$*" == *"/runs?"* ]]; then
  printf '%s' '$1'
  [[ -n '$1' ]] && echo
  exit ${3:-0}
fi
printf '%s\n' '$2'
exit ${4:-0}
EOF
  chmod +x "$workspace/bin/gh"
}

assert_called_with() {
  local name="$1" needle="$2"
  if grep -qF -- "$needle" "$CALLS"; then
    echo "ok    $name"
    ((passed++))
  else
    echo "FAIL  $name: no gh call contained '$needle'"
    echo "      calls: $(tr '\n' '|' <"$CALLS")"
    ((failed++))
  fi
}

check() {
  local name="$1" want="$2" output status
  output="$(PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" ci.yml 2>&1)"
  status=$?
  if [[ "$want" == pass && $status -eq 0 ]] || [[ "$want" == fail && $status -ne 0 ]]; then
    echo "ok    $name"
    ((passed++))
  else
    echo "FAIL  $name: wanted $want, exit=$status"
    echo "      output: $output"
    ((failed++))
  fi
}

echo "== a green run for this SHA"
write_gh '7 111' 'completed success'
check "latest run completed successfully" pass

echo
echo "== the ways a gate can wrongly say yes"
write_gh '' 'completed success'
check "no run for the SHA is unverified, not fine" fail

write_gh '7 111' 'completed failure'
check "failed run" fail

write_gh '7 111' 'completed cancelled'
check "cancelled is not success" fail

write_gh '7 111' 'completed neutral'
check "neutral is not success" fail

write_gh '7 111' 'in_progress '
check "still running is not success" fail

# The ordering guard: an older green run must not hide a newer red one. Run 9 is the newest and
# failed; run 7 is older and passed. Sorting by run_number and re-reading only the newest is what
# makes this fail.
cat >"$workspace/bin/gh" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"/runs?"* ]]; then
  printf '7 111\n9 222\n'
  exit 0
fi
if [[ "\$*" == *"/runs/222"* ]]; then
  echo 'completed failure'
else
  echo 'completed success'
fi
exit 0
EOF
chmod +x "$workspace/bin/gh"
check "an older green run does not hide a newer red one" fail

echo
echo "== API problems are not verdicts"
write_gh 'gh: connection reset' '' 1 0
check "listing runs fails" fail

write_gh '7 111' 'gh: 502 Bad Gateway' 0 1
check "reading the run fails" fail

write_gh '7 not-a-number' 'completed success'
check "unparseable run id" fail

echo
echo "== the query itself, not only the reaction to its answer"
write_gh '7 111' 'completed success'
PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" ci.yml >/dev/null 2>&1
assert_called_with "asks about this exact SHA" "head_sha=$SHA"
assert_called_with "restricted to main" "branch=main"
assert_called_with "restricted to push events" "event=push"
assert_called_with "paginates" "--paginate"
assert_called_with "asks about the repository given" "repos/owner/name/actions/workflows/ci.yml/runs"
assert_called_with "re-reads the specific run" "repos/owner/name/actions/runs/111"

echo
echo "== every named workflow is checked, not only the first"
write_gh '7 111' 'completed success'
PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" ci.yml codeql.yml >/dev/null 2>&1
assert_called_with "asks about the first workflow" "workflows/ci.yml/runs"
assert_called_with "asks about the second workflow" "workflows/codeql.yml/runs"

# CI green, CodeQL red. A loop that stopped at the first success would pass this.
cat >"$workspace/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"workflows/ci.yml"* ]]; then printf '7 111\n'; exit 0; fi
if [[ "$*" == *"workflows/codeql.yml"* ]]; then printf '7 222\n'; exit 0; fi
if [[ "$*" == *"/runs/222"* ]]; then echo 'completed failure'; exit 0; fi
echo 'completed success'
EOF
chmod +x "$workspace/bin/gh"
output="$(PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" ci.yml codeql.yml 2>&1)"; status=$?
if [[ $status -ne 0 && "$output" == *codeql* ]]; then
  echo "ok    a red second workflow fails the gate"
  ((passed++))
else
  echo "FAIL  red second workflow: exit=$status output=$output"
  ((failed++))
fi

# CI green, CodeQL unreachable. An API error on the second workflow must not be covered by the
# first workflow's success.
cat >"$workspace/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"workflows/ci.yml"* ]]; then printf '7 111\n'; exit 0; fi
if [[ "$*" == *"workflows/codeql.yml"* ]]; then echo 'gh: 503'; exit 1; fi
echo 'completed success'
EOF
chmod +x "$workspace/bin/gh"
output="$(PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" ci.yml codeql.yml 2>&1)"; status=$?
if [[ $status -ne 0 ]]; then
  echo "ok    an unreachable second workflow fails the gate"
  ((passed++))
else
  echo "FAIL  unreachable second workflow: exit=$status"
  ((failed++))
fi

echo
echo "== argument handling"
output="$(PATH="$workspace/bin:$PATH" bash "$subject" owner/name deadbeef ci.yml 2>&1)"; status=$?
if [[ $status -ne 0 && "$output" == *"40-character"* ]]; then
  echo "ok    short SHA rejected"
  ((passed++))
else
  echo "FAIL  short SHA: exit=$status output=$output"
  ((failed++))
fi

output="$(PATH="$workspace/bin:$PATH" bash "$subject" owner/name "$SHA" 2>&1)"; status=$?
if [[ $status -ne 0 ]]; then
  echo "ok    no workflow named"
  ((passed++))
else
  echo "FAIL  no workflow named: exit=$status"
  ((failed++))
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
