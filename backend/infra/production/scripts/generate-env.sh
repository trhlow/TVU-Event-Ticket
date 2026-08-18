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
  bash scripts/generate-env.sh events.example.com REPLACE_WITH_REAL_ADMIN_MAILBOX_1,REPLACE_WITH_REAL_ADMIN_MAILBOX_2

ADMIN_EMAILS is a comma-separated list of at least two real mailboxes. Sign-in is
passwordless, so one unreachable mailbox with one address configured locks every
super admin out of the system.

The example above is deliberately not a valid address. Every mailbox listed gets a
live SUPER_ADMIN account created for it, so an example that runs is an example that
creates administrators nobody owns -- which is the situation the clean-slate cutover
exists to end. Substitute addresses you can open and read.

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
  printf '%s' "$frontend_config" | "${PYTHON_BIN:-python3}" -c "import json,sys; print(json.load(sys.stdin)['$1'])"
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

# A PEM is many lines; a .env value is one. Every line ends with the two characters backslash and n,
# which is what .env.example documents and what preflight decodes.
#
# NO awk AND NO sed. Both process escape sequences, and they do not agree with each other or across
# implementations about what `\\n` means in a program text: on gawk it became a REAL newline, and
# the -v workaround that fixed it there did not survive the VPS's mawk. Every version of this
# function written with an external tool has been wrong on some machine, and the failure is silent
# -- the generator reports success and preflight blames the key. Bash string concatenation has no
# such ambiguity: "$line\\n" appends exactly one backslash and one n, everywhere bash runs.
flatten_pem() {
  local line out=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    out+="$line\\n"
  done < "$1"
  printf '%s' "$out"
}

# Nothing downstream can tell a mangled key from a bad one, so the check belongs here, next to the
# thing that could have mangled it.
assert_one_line() {
  local name="$1" value="$2"
  [[ "$value" != *$'\n'* ]] || {
    echo "$name spans more than one line; a .env value cannot. Refusing to write a file no" >&2
    echo "reader in this deployment can parse." >&2
    exit 1
  }
}

# One line is necessary and not sufficient: a value can be a single line and still decode to
# something openssl will not read -- which is exactly what happened when the flattener dropped the
# backslash and wrote `-----END PRIVATE KEY-----n`. So the generator decodes its own output THE WAY
# PREFLIGHT WILL, and checks the result is a key. A generator that cannot prove its output is
# readable has no business writing it.
assert_decodes_to_key() {
  local name="$1" value="$2" kind="$3" decoded="$temporary_dir/decoded.pem"
  printf '%s' "$value" \
    | sed 's/\\n/\
/g' >"$decoded"
  if [[ "$kind" == private ]]; then
    openssl pkey -in "$decoded" -check -noout >/dev/null 2>&1
  else
    openssl pkey -pubin -in "$decoded" -noout >/dev/null 2>&1
  fi || {
    echo "$name does not decode back to a usable key." >&2
    echo "The value is one line, but reversing the escaping the way preflight does yields" >&2
    echo "something openssl refuses. Refusing to write a .env that would fail two steps later" >&2
    echo "with an error blaming the key rather than this script." >&2
    exit 1
  }
}

private_key_flat="$(flatten_pem "$private_key")"
public_key_flat="$(flatten_pem "$public_key")"
assert_one_line JWT_PRIVATE_KEY_PEM "$private_key_flat"
assert_one_line JWT_PUBLIC_KEY_PEM "$public_key_flat"
assert_decodes_to_key JWT_PRIVATE_KEY_PEM "$private_key_flat" private
assert_decodes_to_key JWT_PUBLIC_KEY_PEM "$public_key_flat" public

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

# Off-site backups. Without BACKUP_REMOTE, backup-postgres.sh writes a verified dump next to
# postgres_data on this same disk: that survives a bad migration, and nothing else. Losing the
# droplet loses the database and every backup of it in one step.
#
# Left commented rather than pre-filled because it needs two things this script cannot generate:
# an rclone remote configured on the host (rclone config), and a key pair generated SOMEWHERE
# ELSE -- age-keygen on your laptop, private key kept off this machine.
#
# BACKUP_AGE_RECIPIENT is the PUBLIC key ("age1..."). The host encrypts to it and cannot decrypt
# the result, which is the point: a dump carries every student's name, email, MSSV and ticket
# history, and it is about to be handed to somebody else's storage. Setting BACKUP_REMOTE without
# this is refused rather than warned about -- an unencrypted upload cannot be taken back by
# deleting the object afterwards.
#BACKUP_REMOTE=
#BACKUP_AGE_RECIPIENT=
JWT_PRIVATE_KEY_PEM=$private_key_flat
JWT_PUBLIC_KEY_PEM=$public_key_flat

MICROSOFT_CLIENT_ID=$microsoft_client_id
MICROSOFT_TENANT_ID=$microsoft_tenant_id
MICROSOFT_ISSUER_HOST=https://login.microsoftonline.com
MICROSOFT_JWKS_URI=https://login.microsoftonline.com/common/discovery/v2.0/keys

# All three carry the placeholder, not just the password. Seeding a host and a username for one
# provider while the runbook documents another meant an operator who edited only the password left a
# host from provider A holding a credential from provider B -- and preflight passed, because only
# the password line was checked. The failure then surfaced as mail that never arrived, which for
# this system means nobody can sign in as an administrator at all.
# The documented provider is Brevo: smtp-relay.brevo.com, port 587, username is the account's login.
SPRING_MAIL_HOST=REPLACE_WITH_SMTP_HOST
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=REPLACE_WITH_SMTP_USERNAME
SPRING_MAIL_PASSWORD=REPLACE_WITH_SMTP_CREDENTIAL
MAIL_FROM_ADDRESS=no-reply@$domain
MAIL_FROM_NAME=TVU Events


# GHCR credentials for pulling verified release images (roadmap 4.1: deploy.sh no longer builds on
# this host). A classic PAT with read:packages scope, scoped to this repository only.
GHCR_USERNAME=REPLACE_WITH_A_GITHUB_USERNAME
GHCR_TOKEN=REPLACE_WITH_A_READ_PACKAGES_PAT
# Fallbacks only -- deploy.sh overrides both at runtime with the real per-commit GHCR tag.
MONOLITH_IMAGE=ghcr.io/trhlow/tvu-event-ticket/monolith:local
FRONTEND_IMAGE=ghcr.io/trhlow/tvu-event-ticket/frontend:local
EOF
chmod 600 "$env_file"

echo "Created $env_file with mode 600."
echo "Next:"
echo "  1. Set SPRING_MAIL_* and MAIL_FROM_ADDRESS for the verified SMTP domain."
echo "  2. Set GHCR_USERNAME and GHCR_TOKEN (a PAT with read:packages scope) to pull release images."
echo "  3. Run: bash scripts/preflight.sh"
