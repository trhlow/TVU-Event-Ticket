#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
repository_root="$(cd -- "$deployment_dir/../../.." && pwd)"
env_file="$deployment_dir/.env"

# shellcheck source=frontend-config.sh
source "$script_dir/frontend-config.sh"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/generate-env.sh DOMAIN ADMIN_EMAILS

Example:
  bash scripts/generate-env.sh events.example.com chair@tvu.edu.vn,vice@tvu.edu.vn

ADMIN_EMAILS is a comma-separated list of at least two real mailboxes. Sign-in is
passwordless, so one unreachable mailbox with one address configured locks every
super admin out of the system.

The Microsoft application and directory ids are no longer arguments. They come
from frontend/.env.production, which is tracked in Git and is what the frontend
bundle is built from. Typing them here as well meant two sources for one fact,
and a typo produced a backend that rejected every token the frontend obtained,
with nothing to compare against. DOMAIN must match the redirect URI in that file.

The script generates service passwords, signing secrets, and a stable RSA key
pair. It never overwrites an existing .env. You must add the SMTP credential
afterward, then run scripts/preflight.sh.
EOF
}

[[ $# -eq 2 ]] || {
  usage >&2
  exit 2
}

domain="$1"
admin_email="$2"

# Example domains must never reach BOOTSTRAP_ADMIN_EMAIL. After a clean-slate reset the runner
# creates a SUPER_ADMIN for every address listed, so one example value left in place silently
# recreates a ghost administrator account nobody owns.
IFS=',' read -r -a bootstrap_emails <<< "$admin_email"
[[ ${#bootstrap_emails[@]} -ge 2 ]] || {
  echo "ADMIN_EMAILS must list at least two real mailboxes, comma-separated" >&2
  exit 2
}
for candidate in "${bootstrap_emails[@]}"; do
  candidate="$(echo "$candidate" | tr -d '[:space:]')"
  [[ "$candidate" == *@*.* ]] || {
    echo "Not an email address: $candidate" >&2
    exit 2
  }
  case "${candidate,,}" in
    *@example.com|*@example.org|*@example.net|*@vidu.com|*@test.com|admin@*)
      echo "Refusing placeholder bootstrap address: $candidate" >&2
      echo "Use real mailboxes you can actually read — this creates live super admin accounts." >&2
      exit 2
      ;;
  esac
done

[[ "$domain" =~ ^[A-Za-z0-9.-]+$ && "$domain" == *.* ]] \
  || { echo "DOMAIN must be a hostname without https:// or a path" >&2; exit 2; }
[[ "$admin_email" == *@*.* && "$admin_email" != *[[:space:]]* ]] \
  || { echo "ADMIN_EMAIL is not a plausible email address" >&2; exit 2; }
# One source of truth, read rather than retyped. frontend-config.sh validates the file first --
# GUID shape, no placeholders, https redirect -- so a bad value fails here rather than at the first
# sign-in attempt.
frontend_config="$(frontend_config_json "$repository_root")" || {
  echo "Could not read the frontend production config. Refusing to generate a .env that would" >&2
  echo "disagree with the bundle; fix frontend/.env.production first." >&2
  exit 2
}
read_frontend_value() {
  printf '%s' "$frontend_config" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"
}
microsoft_client_id="$(read_frontend_value VITE_MICROSOFT_CLIENT_ID)"
microsoft_tenant_id="$(read_frontend_value VITE_MICROSOFT_TENANT_ID)"
frontend_redirect="$(read_frontend_value VITE_MICROSOFT_REDIRECT_URI)"

# The domain argument and the redirect the bundle was built with must describe the same site. Entra
# compares the redirect byte for byte, so a mismatch becomes AADSTS50011 at sign-in -- after
# deployment, in front of users, with nothing in the logs pointing back here.
[[ "$frontend_redirect" == "https://$domain" ]] || {
  echo "DOMAIN is $domain, but frontend/.env.production was built for $frontend_redirect." >&2
  echo "These must match exactly; Entra compares the redirect URI byte for byte." >&2
  exit 2
}
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
# Two accounts, deliberately. POSTGRES_USER owns the schema and is used only by scripts/migrate.sh;
# POSTGRES_APP_USER is what the application runs as and can only read and write rows. Keeping the
# owner password out of the application container is the point — otherwise the split is decoration.
POSTGRES_USER=tvu_owner
POSTGRES_PASSWORD=$(random_secret)
POSTGRES_APP_USER=tvu_app
POSTGRES_APP_PASSWORD=$(random_secret)

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
# Secret of its own: mixed into the HMAC of every one-time code so a Redis dump cannot hand over a
# live admin code. Rotating it invalidates codes currently in flight, which is expected — users
# simply request a new one.
OTP_PEPPER=$(openssl rand -base64 32)

# Standby SMTP (H14). Fill these in and REHEARSE the switch before cutover: admin sign-in is a
# code sent by email and nothing else, so if the primary provider goes down and there is no tested
# second one, nobody can administer the system — the break-glass SQL cannot help, because the
# replacement admin also needs a code delivered by mail.
# Note SPF/DKIM are per provider: the standby needs its own authorised sender address.
#SMTP_STANDBY_HOST=
#SMTP_STANDBY_PORT=587
#SMTP_STANDBY_USERNAME=
#SMTP_STANDBY_PASSWORD=
#MAIL_FROM_ADDRESS_STANDBY=
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
