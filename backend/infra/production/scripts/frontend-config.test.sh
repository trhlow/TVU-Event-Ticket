#!/usr/bin/env bash
# Tests for frontend-config.sh.
#
# The fingerprint is what a deploy uses to refuse an image built for a different configuration, so
# the failure that matters is not "wrong hash" but "returned success without checking". The first
# version of the script did exactly that: no python3, empty output, hash of the empty string,
# exit 0 -- and a config missing a required key produced the same value. Most of the cases below
# exist to keep that shape from coming back.
#
# Run: bash frontend-config.test.sh
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
subject="$script_dir/frontend-config.sh"

passed=0
failed=0
workspace="$(mktemp -d)"
trap 'rm -rf -- "$workspace"' EXIT

VALID_CONFIG='VITE_APP_ENV=production
VITE_AUTH_PROVIDER=microsoft
VITE_API_BASE_URL=/api
VITE_MICROSOFT_CLIENT_ID=11111111-2222-3333-4444-555555555555
VITE_MICROSOFT_TENANT_ID=66666666-7777-8888-9999-000000000000
VITE_MICROSOFT_REDIRECT_URI=https://evts.id.vn'

write_config() {
  mkdir -p "$workspace/frontend"
  printf '%s\n' "$1" >"$workspace/frontend/.env.production"
}

# expect_failure <name> <config> [substring the message must contain]
expect_failure() {
  local name="$1" config="$2" expected="${3:-}" output status
  write_config "$config"
  output="$(bash "$subject" "$workspace" 2>&1)"
  status=$?

  if [[ $status -eq 0 ]]; then
    echo "FAIL  $name: exited 0; a check that cannot fail is the bug this suite exists for"
    echo "      output: $output"
    ((failed++))
    return
  fi
  if [[ -n "$expected" && "$output" != *"$expected"* ]]; then
    echo "FAIL  $name: failed as required but the message does not mention '$expected'"
    echo "      output: $output"
    ((failed++))
    return
  fi
  # A rejected config must not print a fingerprint at all: a plausible-looking hash next to an
  # error is how a caller reading stdout ends up trusting it.
  if [[ "$output" == *"fingerprint:"* ]]; then
    echo "FAIL  $name: printed a fingerprint while rejecting the config"
    ((failed++))
    return
  fi
  echo "ok    $name"
  ((passed++))
}

expect_success() {
  local name="$1" config="$2" output status
  write_config "$config"
  output="$(bash "$subject" "$workspace" 2>&1)"
  status=$?

  if [[ $status -ne 0 ]]; then
    echo "FAIL  $name: exited $status"
    echo "      output: $output"
    ((failed++))
    return
  fi
  echo "ok    $name"
  ((passed++))
}

echo "== accepts a valid production configuration"
# Called directly, never inside $( ). Command substitution runs this in a subshell, where the
# counters increment a copy: a failing case would be swallowed and the suite would still report
# failed=0. That is the same fail-open shape the subject of these tests had.
expect_success "valid config" "$VALID_CONFIG"

echo
echo "== the canonical form is exactly what a second implementation would have to reproduce"
write_config "$VALID_CONFIG"
canonical="$(bash -c "source '$subject'; frontend_config_json '$workspace'")"
expected_canonical='{"VITE_API_BASE_URL":"/api","VITE_APP_ENV":"production","VITE_AUTH_PROVIDER":"microsoft","VITE_MICROSOFT_CLIENT_ID":"11111111-2222-3333-4444-555555555555","VITE_MICROSOFT_REDIRECT_URI":"https://evts.id.vn","VITE_MICROSOFT_TENANT_ID":"66666666-7777-8888-9999-000000000000"}'
if [[ "$canonical" == "$expected_canonical" ]]; then
  echo "ok    canonical JSON: sorted keys, no spaces, no trailing newline"
  ((passed++))
else
  echo "FAIL  canonical JSON differs"
  echo "      want: $expected_canonical"
  echo "      got:  $canonical"
  ((failed++))
fi

echo
echo "== reordering the file must not change the fingerprint; changing a value must"
first="$(bash -c "source '$subject'; frontend_config_fingerprint '$workspace'")"
write_config "$(printf '%s\n' "$VALID_CONFIG" | sort)"
reordered="$(bash -c "source '$subject'; frontend_config_fingerprint '$workspace'")"
if [[ "$first" == "$reordered" ]]; then
  echo "ok    fingerprint is order-independent"
  ((passed++))
else
  echo "FAIL  fingerprint changed when only the line order changed"
  ((failed++))
fi
write_config "${VALID_CONFIG/https:\/\/evts.id.vn/https://staging.evts.id.vn}"
other="$(bash -c "source '$subject'; frontend_config_fingerprint '$workspace'")"
if [[ "$first" != "$other" ]]; then
  echo "ok    a different redirect URI is a different fingerprint"
  ((passed++))
else
  echo "FAIL  two different configurations fingerprint the same -- the check cannot discriminate"
  ((failed++))
fi

echo
echo "== rejects configurations it cannot vouch for"
expect_failure "missing required key" \
  "$(printf '%s\n' "$VALID_CONFIG" | grep -v VITE_MICROSOFT_TENANT_ID)" "missing or blank"
expect_failure "blank value" \
  "${VALID_CONFIG/VITE_MICROSOFT_CLIENT_ID=11111111-2222-3333-4444-555555555555/VITE_MICROSOFT_CLIENT_ID=}" \
  "missing or blank"
expect_failure "duplicate key" \
  "$VALID_CONFIG"$'\n''VITE_API_BASE_URL=/other' "duplicate key"
expect_failure "quoted value" \
  "${VALID_CONFIG/VITE_API_BASE_URL=\/api/VITE_API_BASE_URL=\"/api\"}" "quoted"
expect_failure "interpolated value" \
  "${VALID_CONFIG/https:\/\/evts.id.vn/https://\$DOMAIN}" "interpolation"
expect_failure "placeholder value" \
  "${VALID_CONFIG/11111111-2222-3333-4444-555555555555/REPLACE_WITH_CLIENT_ID}" "placeholder"
expect_failure "line that is not KEY=value" \
  "$VALID_CONFIG"$'\n''this is not a setting' "not KEY=value"
expect_failure "client id that is not a GUID" \
  "${VALID_CONFIG/11111111-2222-3333-4444-555555555555/not-a-guid}" "not a GUID"
expect_failure "http redirect in production" \
  "${VALID_CONFIG/https:\/\/evts.id.vn/http://evts.id.vn}" "must be https"
expect_failure "demo flag reintroduced" \
  "$VALID_CONFIG"$'\n''VITE_USE_DEMO_DATA=true' "must not appear"
expect_failure "legacy mock fallback flag reintroduced" \
  "$VALID_CONFIG"$'\n''VITE_ENABLE_MOCK_FALLBACK=false' "must not appear"

# Non-empty was the whole check for these three until a review pointed out that a development
# configuration passes it: provider devstub, app env development, an API pointed at localhost all
# fingerprint cleanly and stably, and a stable fingerprint over the wrong configuration is worse
# than none -- it looks like verification.
expect_failure "development app env" \
  "${VALID_CONFIG/VITE_APP_ENV=production/VITE_APP_ENV=development}" "must be exactly"
expect_failure "devstub auth provider" \
  "${VALID_CONFIG/VITE_AUTH_PROVIDER=microsoft/VITE_AUTH_PROVIDER=devstub}" "must be exactly"
expect_failure "api base url pointed elsewhere" \
  "${VALID_CONFIG//VITE_API_BASE_URL=\/api/VITE_API_BASE_URL=http:\/\/localhost:8080\/api}" \
  "must be exactly"
expect_failure "key Vite would ignore" \
  "$VALID_CONFIG"$'\n''NOT_A_VITE_KEY=x' "not a VITE_ variable"

echo
echo "== missing file"
rm -f "$workspace/frontend/.env.production"
output="$(bash "$subject" "$workspace" 2>&1)"; status=$?
if [[ $status -ne 0 && "$output" == *"not found"* ]]; then
  echo "ok    missing .env.production"
  ((passed++))
else
  echo "FAIL  missing .env.production: status=$status output=$output"
  ((failed++))
fi

echo
echo "== python3 unusable"
# The original failure, reproduced: a PATH where python3 resolves and then refuses to run. The
# script must refuse too, rather than hash whatever the empty output hashes to.
write_config "$VALID_CONFIG"
mkdir -p "$workspace/fakebin"
printf '#!/bin/sh\nexit 9\n' >"$workspace/fakebin/python3"
chmod +x "$workspace/fakebin/python3"
output="$(PATH="$workspace/fakebin:$PATH" bash "$subject" "$workspace" 2>&1)"; status=$?
if [[ $status -ne 0 && "$output" != *e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855* ]]; then
  echo "ok    unusable python3 fails instead of hashing nothing"
  ((passed++))
else
  echo "FAIL  unusable python3: status=$status output=$output"
  ((failed++))
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
