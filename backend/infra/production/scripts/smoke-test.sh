#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$script_dir/common.sh"

require_command curl
[[ -f "$env_file" ]] || die "Missing production environment file: $env_file"

domain="$(env_value APP_DOMAIN)"
base_url="${SMOKE_BASE_URL:-https://$domain}"
curl_options=(
  --fail
  --silent
  --show-error
  --location
  --retry 12
  --retry-connrefused
  --retry-delay 5
  --connect-timeout 10
  --max-time 30
)
if [[ "${SMOKE_INSECURE:-0}" == "1" ]]; then
  curl_options+=(--insecure)
fi
if [[ -n "${SMOKE_RESOLVE:-}" ]]; then
  curl_options+=(--resolve "$SMOKE_RESOLVE")
fi

running_services="$(compose ps --status running --services)"
expected_services=(caddy frontend monolith postgres redis rabbitmq)
for service in "${expected_services[@]}"; do
  grep -qx "$service" <<<"$running_services" || die "Service is not running: $service"
done

health="$(curl "${curl_options[@]}" "$base_url/actuator/health")"
grep -q '"status":"UP"' <<<"$health" || die "Public health endpoint did not report UP"

jwks="$(curl "${curl_options[@]}" "$base_url/.well-known/jwks.json")"
grep -q '"keys"' <<<"$jwks" || die "JWKS endpoint did not return a key set"
grep -q '"kty":"RSA"' <<<"$jwks" || die "JWKS endpoint did not return an RSA key"

discovery="$(curl "${curl_options[@]}" "$base_url/.well-known/openid-configuration")"
grep -Fq "\"issuer\":\"https://$domain\"" <<<"$discovery" \
  || die "OIDC discovery issuer does not match APP_DOMAIN"

homepage_file="$(mktemp)"
trap 'rm -f -- "$homepage_file"' EXIT
curl "${curl_options[@]}" --output "$homepage_file" "$base_url/"
[[ -s "$homepage_file" ]] || die "Frontend returned an empty response"

echo "Smoke test passed: frontend, health, OIDC discovery, and JWKS are reachable at $base_url"
