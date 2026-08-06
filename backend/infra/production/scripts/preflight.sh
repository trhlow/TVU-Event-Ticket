#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$script_dir/common.sh"
# shellcheck source=frontend-config.sh
source "$script_dir/frontend-config.sh"

require_command docker
require_command git
require_command curl
require_command openssl
# Not `require_command python3`: on some hosts python3 resolves to a shim that exits non-zero when
# actually invoked, and frontend-config.sh depends on it to tell a real config from an empty one.
# Ask it to run something, and check WHAT CAME BACK -- the same shim in its other mood swallows its
# input and exits 0, which an exit-status probe accepts. PYTHON_BIN wins, as everywhere else here.
PYTHON="${PYTHON_BIN:-python3}"
[[ "$("$PYTHON" -c 'import json, hashlib, sys; print("PYBIN-OK")' 2>/dev/null)" == "PYBIN-OK" ]]   || die "$PYTHON must be installed and runnable: the release verifier and the frontend config
fingerprint both depend on it, and a deploy that cannot compute the fingerprint cannot tell
whether the frontend image was built for this environment"
[[ -f "$env_file" ]] || die "Missing production environment file: $env_file"
docker info >/dev/null 2>&1 || die "Docker daemon is unavailable to the deploy user"
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is unavailable"

required_keys=(
  APP_DOMAIN
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD POSTGRES_APP_USER POSTGRES_APP_PASSWORD
  REDIS_PASSWORD RABBITMQ_DEFAULT_USER RABBITMQ_DEFAULT_PASS
  JWT_ISSUER_URI JWT_KEY_ID JWT_PRIVATE_KEY_PEM JWT_PUBLIC_KEY_PEM
  CSRF_SIGNING_SECRET QR_SIGNING_SECRET OTP_PEPPER BOOTSTRAP_ADMIN_EMAIL
  MICROSOFT_CLIENT_ID MICROSOFT_TENANT_ID
  SPRING_MAIL_HOST SPRING_MAIL_PORT SPRING_MAIL_USERNAME SPRING_MAIL_PASSWORD
  MAIL_FROM_ADDRESS
)
for key in "${required_keys[@]}"; do
  require_env_value "$key"
done

domain="$(env_value APP_DOMAIN)"
[[ "$domain" =~ ^[A-Za-z0-9.-]+$ && "$domain" == *.* ]] \
  || die "APP_DOMAIN must be a hostname without https:// or a path"
[[ "$(env_value JWT_ISSUER_URI)" == "https://$domain" ]] \
  || die "JWT_ISSUER_URI must exactly equal https://APP_DOMAIN"

# The whole point of H11 is that the application is not the owner. Identical names or passwords
# would leave it running as the owner while looking like it is not.
[[ "$(env_value POSTGRES_USER)" != "$(env_value POSTGRES_APP_USER)" ]]   || die "POSTGRES_APP_USER must differ from POSTGRES_USER; the application must not own the schema"
[[ "$(env_value POSTGRES_PASSWORD)" != "$(env_value POSTGRES_APP_PASSWORD)" ]]   || die "POSTGRES_APP_PASSWORD must differ from POSTGRES_PASSWORD"

for key in POSTGRES_PASSWORD POSTGRES_APP_PASSWORD REDIS_PASSWORD RABBITMQ_DEFAULT_PASS CSRF_SIGNING_SECRET QR_SIGNING_SECRET OTP_PEPPER; do
  value="$(env_value "$key")"
  [[ ${#value} -ge 32 ]] || die "$key must contain at least 32 characters"
done

# A six-digit code has only a million possibilities, so a weak pepper is reversed offline from a
# Redis dump in moments. It must also be its own secret: reusing another one means a single leak
# compromises both.
otp_pepper="$(env_value OTP_PEPPER)"
for other in CSRF_SIGNING_SECRET QR_SIGNING_SECRET JWT_PRIVATE_KEY_PEM SPRING_MAIL_PASSWORD; do
  [[ "$otp_pepper" != "$(env_value "$other")" ]] || die "OTP_PEPPER must not reuse $other"
done

# Every address here becomes a live SUPER_ADMIN after a clean-slate reset, so an example value
# silently creates an account nobody owns. Two addresses minimum: sign-in is passwordless, and one
# unreachable mailbox would lock every administrator out permanently.
bootstrap_emails="$(env_value BOOTSTRAP_ADMIN_EMAIL)"
IFS=',' read -r -a bootstrap_list <<< "$bootstrap_emails"
[[ ${#bootstrap_list[@]} -ge 2 ]]   || die "BOOTSTRAP_ADMIN_EMAIL must list at least two mailboxes, comma-separated"
for candidate in "${bootstrap_list[@]}"; do
  candidate="$(echo "$candidate" | tr -d '[:space:]')"
  [[ "$candidate" == *@*.* ]] || die "BOOTSTRAP_ADMIN_EMAIL contains an invalid address: $candidate"
  case "${candidate,,}" in
    *@example.com|*@example.org|*@example.net|*@vidu.com|*@test.com|admin@*|sadminevt@*)
      die "BOOTSTRAP_ADMIN_EMAIL contains a placeholder or demo address: $candidate"
      ;;
  esac
done

permissions="$(stat -c '%a' "$env_file" 2>/dev/null || true)"
[[ "$permissions" == "600" ]] || die "$env_file must have mode 600 (current: ${permissions:-unknown})"

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT
private_key_file="$temporary_dir/private.pem"
public_key_file="$temporary_dir/public.pem"
derived_public_key_file="$temporary_dir/derived-public.pem"
printf '%s' "${JWT_PRIVATE_KEY_PEM_VALUE:-$(env_value JWT_PRIVATE_KEY_PEM)}" \
  | sed 's/\\n/\
/g' >"$private_key_file"
printf '%s' "${JWT_PUBLIC_KEY_PEM_VALUE:-$(env_value JWT_PUBLIC_KEY_PEM)}" \
  | sed 's/\\n/\
/g' >"$public_key_file"
openssl pkey -in "$private_key_file" -check -noout >/dev/null 2>&1 \
  || die "JWT_PRIVATE_KEY_PEM is not a valid PKCS#8 private key"
openssl pkey -pubin -in "$public_key_file" -pubout -out "$derived_public_key_file" >/dev/null 2>&1 \
  || die "JWT_PUBLIC_KEY_PEM is not a valid public key"
openssl pkey -in "$private_key_file" -pubout -out "$private_key_file.public" >/dev/null 2>&1
cmp -s "$private_key_file.public" "$derived_public_key_file" \
  || die "JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM do not form one key pair"

ENV_FILE="$env_file" docker compose --env-file "$env_file" -f "$compose_file" config --quiet

# Two representations of one fact, checked against each other. The frontend bakes these values in
# at build time and the backend reads them at runtime, so they cannot be collapsed into a single
# variable -- but they can be required to agree. When they disagree the symptom is a user who signs
# in with Microsoft successfully and is then rejected by the API, which points at neither file.
repository_root="$(cd -- "$deployment_dir/../../.." && pwd)"
frontend_config="$(frontend_config_json "$repository_root")"   || die "Could not read frontend/.env.production; the frontend build configuration is unverifiable"
read_frontend_value() {
  printf '%s' "$frontend_config" | "$PYTHON" -c "import json,sys; print(json.load(sys.stdin)['$1'])"
}
expected_client_id="$(read_frontend_value VITE_MICROSOFT_CLIENT_ID)"
expected_tenant_id="$(read_frontend_value VITE_MICROSOFT_TENANT_ID)"
expected_redirect="$(read_frontend_value VITE_MICROSOFT_REDIRECT_URI)"

[[ "$(env_value MICROSOFT_CLIENT_ID)" == "$expected_client_id" ]]   || die "MICROSOFT_CLIENT_ID in $env_file does not match VITE_MICROSOFT_CLIENT_ID in
frontend/.env.production. The backend would reject the audience of every token the frontend obtains"
[[ "$(env_value MICROSOFT_TENANT_ID)" == "$expected_tenant_id" ]]   || die "MICROSOFT_TENANT_ID in $env_file does not match VITE_MICROSOFT_TENANT_ID in
frontend/.env.production. The backend would reject the tid claim of every token the frontend obtains"
[[ "$expected_redirect" == "https://$domain" ]]   || die "APP_DOMAIN is $domain, but the frontend bundle was built for $expected_redirect.
Entra compares the redirect URI byte for byte; sign-in would fail with AADSTS50011"

available_kib="$(awk '/MemAvailable:/ { print $2 }' /proc/meminfo 2>/dev/null || true)"
if [[ -n "$available_kib" && "$available_kib" -lt 1572864 ]]; then
  echo "WARNING: less than 1.5 GiB RAM is currently available; the first image build may fail." >&2
fi
available_disk_kib="$(df -Pk "$deployment_dir" | awk 'NR == 2 { print $4 }')"
if [[ "$available_disk_kib" -lt 10485760 ]]; then
  echo "WARNING: less than 10 GiB disk is available; builds, volumes, and backups may fill the host." >&2
fi

echo "Preflight passed for https://$domain"
