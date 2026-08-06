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

# The owner credentials must not be inside the application container. compose.yaml says so in a
# comment, migrate.sh proves the runtime role cannot CREATE TABLE, and both were true while an
# `env_file:` line quietly injected POSTGRES_PASSWORD into this container anyway -- so the property
# everything else is built on was absent and nothing said a word. A claim about a container is
# checked by asking the container.
owner_leaks="$(compose exec -T monolith env 2>/dev/null | grep -cE '^(POSTGRES_PASSWORD|POSTGRES_USER)=' || true)"
[[ "$owner_leaks" == "0" ]] || die "The monolith container holds the schema owner's credentials
($owner_leaks of them). An RCE or SSRF in the application could then DROP the schema, which is the
one thing the two-account split exists to prevent. Check for an env_file: line under the monolith
service in compose.yaml."

# The API documentation must not exist in production. Asking through Caddy would only prove Caddy
# does not route it, which is the containment this check is here to stop depending on: a stray
# `ports:` line or a new `handle` block undoes routing without touching the application. So ask the
# application directly, from inside its own container, over loopback.
#
# application-prod.yml disables springdoc, and ProductionHealthConfigTest asserts the file still
# says so — but that is the shipped default, not an immutable property. Spring Boot lets
# SPRINGDOC_API_DOCS_ENABLED=true in the environment override the YAML, and nothing in the build
# would notice. This is the check that would.
#
# Same bash + /dev/tcp shape as the monolith healthcheck in compose.yaml, so no extra image and
# nothing new to pin.
# Not "expect 404". A missing path is forwarded to /error, which `anyRequest().authenticated()`
# also covers, so an unauthenticated request to a disabled endpoint answers 401, not 404. Demanding
# 404 would fail every deploy while the application was configured correctly. What must hold is
# narrower and is the actual invariant: the documentation is not served. 2xx means it is; a
# redirect is how swagger-ui hands out its index page, so that counts too.
assert_endpoint_not_served() {
  local path="$1"
  local response status
  response="$(compose exec -T monolith bash -c \
    "exec 3<>/dev/tcp/127.0.0.1/8080 \
     && printf 'GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n' >&3 \
     && head -n 1 <&3")" \
    || die "Could not reach the application on loopback while checking $path"
  status="$(awk '{print $2}' <<<"$response" | tr -d '\r')"
  [[ -n "$status" ]] || die "No HTTP status line while checking $path"
  # An allowlist, not a blocklist. 401 is what a disabled endpoint answers here (404 forwarded to
  # /error, refused there) and 404 is what it would answer if /error were ever permitted. Anything
  # else — 403, 500, a redirect — may well not be serving the documentation either, but it is not
  # evidence that the route is closed, and a deploy must not go green on the absence of proof.
  case "$status" in
    401|404) ;;
    *)
      die "Documentation absence invariant failed: $path returned HTTP $status, expected 401 or 404." \
          "If this is 2xx or a redirect the documentation is being served; check the environment for" \
          "SPRINGDOC_* or SPRING_WEB_RESOURCES_ADD_MAPPINGS overrides, which beat application-prod.yml." \
          "Any other status means the check could not prove the route is closed"
      ;;
  esac
}

assert_endpoint_not_served /v3/api-docs
assert_endpoint_not_served /swagger-ui/index.html
# Spring Boot's own /webjars/** mapping, which disabling springdoc does not touch.
assert_endpoint_not_served /webjars/swagger-ui/index.html

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

echo "Smoke test passed: frontend, health, OIDC discovery, and JWKS are reachable at $base_url;" \
     "the API documentation endpoints answer 401 or 404 on the application's own loopback"
