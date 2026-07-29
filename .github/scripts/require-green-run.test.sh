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

# write_gh <runs-output> <run-output> [runs-exit] [run-exit]
write_gh() {
  cat >"$workspace/bin/gh" <<EOF
#!/usr/bin/env bash
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
