#!/usr/bin/env bash
# Guards two failures a real first deploy hit on 2026-08-15, both of which reported themselves
# somewhere far from their cause.
#
# 1. require_env_value only rejected the literal REPLACE_WITH. A .env carrying `<github-username>`
#    passed preflight and died later at `docker login ghcr.io` with "denied: denied" -- a message
#    about credentials that said nothing about the placeholder that caused it.
# 2. deploy.sh called preflight.sh BEFORE exporting MONOLITH_IMAGE/FRONTEND_IMAGE, and preflight
#    validates the compose file, which declares those as required. The deploy died on
#    "required variable FRONTEND_IMAGE is missing a value: FRONTEND_IMAGE must be set --
#    deploy.sh sets it automatically" -- an error whose own text says it cannot happen.
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

# require_env_value calls die, which exits. Each case therefore runs in its own subshell whose exit
# status is the answer, rather than trying to trap an exit inside this one.
check_value() {
  local value="$1" tmp
  tmp="$(mktemp)"
  printf 'SOME_KEY=%s\n' "$value" >"$tmp"
  (
    ENV_FILE="$tmp" source "$here/common.sh"
    require_env_value SOME_KEY
  ) >/dev/null 2>&1
  local status=$?
  rm -f "$tmp"
  return $status
}

check_value "ghp_a_real_looking_token" \
  && report "a real value is accepted" ok \
  || report "a real value is accepted" fail "require_env_value rejected a legitimate value"

check_value "REPLACE_WITH_A_READ_PACKAGES_PAT" \
  && report "the REPLACE_WITH placeholder is still rejected" fail "it was accepted" \
  || report "the REPLACE_WITH placeholder is still rejected" ok

check_value "<github-username>" \
  && report "an angle-bracket placeholder is rejected (the one that reached docker login)" fail \
       "'<github-username>' was accepted, so the failure moves to a later step with an unrelated message" \
  || report "an angle-bracket placeholder is rejected (the one that reached docker login)" ok

check_value "<PAT read:packages>" \
  && report "an angle-bracket placeholder containing spaces is rejected" fail "it was accepted" \
  || report "an angle-bracket placeholder containing spaces is rejected" ok

# A value may legitimately contain < or > without being a placeholder -- only a whole value wrapped
# in angle brackets is one. Rejecting more than that would refuse real secrets.
check_value 'p4ss<word>ok' \
  && report "a real value that merely contains angle brackets is still accepted" ok \
  || report "a real value that merely contains angle brackets is still accepted" fail \
       "the placeholder check is too broad and would refuse legitimate secrets"

# Ordering, checked in the source rather than by running a deploy: preflight validates the compose
# file, and compose.yaml declares MONOLITH_IMAGE/FRONTEND_IMAGE with `:?`, so the exports have to
# happen first. Nothing else in this repository can catch that without a real registry and a real
# .env, which is exactly why it shipped.
deploy_sh="$here/deploy.sh"
# Comment lines are skipped deliberately: the note explaining this ordering mentions preflight.sh by
# name, and matching that instead of the invocation made this check fail against a correct file.
preflight_line="$(grep -n '^[[:space:]]*[^#[:space:]].*preflight\.sh' "$deploy_sh" | head -1 | cut -d: -f1)"
export_line="$(grep -n '^export MONOLITH_IMAGE=' "$deploy_sh" | head -1 | cut -d: -f1)"
if [[ -z "$preflight_line" || -z "$export_line" ]]; then
  report "deploy.sh exports the image references before it runs preflight" fail \
    "could not find both lines (preflight=${preflight_line:-none} export=${export_line:-none})"
elif (( export_line < preflight_line )); then
  report "deploy.sh exports the image references before it runs preflight" ok
else
  report "deploy.sh exports the image references before it runs preflight" fail \
    "export is on line $export_line but preflight runs on line $preflight_line, so preflight will \
validate a compose file whose required image variables are unset"
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
