#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="$deployment_dir/.env"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/generate-env.sh DOMAIN ADMIN_EMAIL MICROSOFT_CLIENT_ID MICROSOFT_TENANT_ID

Example:
  bash scripts/generate-env.sh events.example.com admin@example.com \
    11111111-1111-1111-1111-111111111111 \
    22222222-2222-2222-2222-222222222222

The script generates service passwords, signing secrets, and a stable RSA key
pair. It never overwrites an existing .env. You must add the SMTP credential
afterward, then run scripts/preflight.sh.
EOF
}

[[ $# -eq 4 ]] || {
  usage >&2
  exit 2
}

domain="$1"
admin_email="$2"
microsoft_client_id="$3"
microsoft_tenant_id="$4"

[[ "$domain" =~ ^[A-Za-z0-9.-]+$ && "$domain" == *.* ]] \
  || { echo "DOMAIN must be a hostname without https:// or a path" >&2; exit 2; }
[[ "$admin_email" == *@*.* && "$admin_email" != *[[:space:]]* ]] \
  || { echo "ADMIN_EMAIL is not a plausible email address" >&2; exit 2; }
[[ "$microsoft_client_id" != *[[:space:]]* && -n "$microsoft_client_id" ]] \
  || { echo "MICROSOFT_CLIENT_ID must not be blank or contain spaces" >&2; exit 2; }
[[ "$microsoft_tenant_id" != *[[:space:]]* && -n "$microsoft_tenant_id" ]] \
  || { echo "MICROSOFT_TENANT_ID must not be blank or contain spaces" >&2; exit 2; }
[[ ! -e "$env_file" ]] || {
  echo "Refusing to overwrite existing $env_file" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate production secrets" >&2
  exit 1
}

random_secret() {
  openssl rand -base64 48 | tr -d '\r\n'
}

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT
private_key="$temporary_dir/jwt-private.pem"
public_key="$temporary_dir/jwt-public.pem"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$private_key" >/dev/null 2>&1
openssl pkey -in "$private_key" -pubout -out "$public_key" >/dev/null 2>&1

flatten_pem() {
  awk 'NF { printf "%s\\n", $0 }' "$1"
}

umask 077
cat >"$env_file" <<EOF
APP_DOMAIN=$domain

POSTGRES_DB=tvu_app
POSTGRES_USER=tvu_app
POSTGRES_PASSWORD=$(random_secret)

DB_POOL_MAX_SIZE=10
DB_POOL_MIN_IDLE=2
DB_CONNECTION_TIMEOUT_MS=5000

REDIS_PASSWORD=$(random_secret)
RABBITMQ_DEFAULT_USER=tvu_app
RABBITMQ_DEFAULT_PASS=$(random_secret)

JWT_ISSUER_URI=https://$domain
JWT_TTL=15m
JWT_KEY_ID=tvu-prod-$(date -u +%Y%m%d)
CSRF_SIGNING_SECRET=$(random_secret)
QR_SIGNING_SECRET=$(random_secret)
BOOTSTRAP_ADMIN_EMAIL=$admin_email
JWT_PRIVATE_KEY_PEM=$(flatten_pem "$private_key")
JWT_PUBLIC_KEY_PEM=$(flatten_pem "$public_key")

MICROSOFT_CLIENT_ID=$microsoft_client_id
MICROSOFT_TENANT_ID=$microsoft_tenant_id
MICROSOFT_ISSUER_HOST=https://login.microsoftonline.com
MICROSOFT_JWKS_URI=https://login.microsoftonline.com/common/discovery/v2.0/keys

SPRING_MAIL_HOST=smtp.resend.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=resend
SPRING_MAIL_PASSWORD=REPLACE_WITH_SMTP_CREDENTIAL
MAIL_FROM_ADDRESS=no-reply@$domain
MAIL_FROM_NAME=TVU Events

MONOLITH_IMAGE=tvu-event-ticket-monolith:production
EOF
chmod 600 "$env_file"

echo "Created $env_file with mode 600."
echo "Next:"
echo "  1. Set SPRING_MAIL_* and MAIL_FROM_ADDRESS for the verified SMTP domain."
echo "  2. Run: bash scripts/preflight.sh"
