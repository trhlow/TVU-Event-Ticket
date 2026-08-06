#!/usr/bin/env bash
# H14: switch the deployment to the standby SMTP provider.
#
# Why this exists. Admin sign-in is a code sent by email and nothing else. The "restore a locked-out
# super admin" SQL in OPERATIONS.md ends with "request a code for that address", so it repairs a
# wrong account — it does nothing at all when the provider itself is down, because the replacement
# admin also cannot receive a code. A second provider, configured and tested in advance, is the only
# thing that recovers from that.
#
# Prerequisites in .env (generate-env.sh leaves them commented out; fill them in and rehearse):
#   SMTP_STANDBY_HOST, SMTP_STANDBY_PORT, SMTP_STANDBY_USERNAME, SMTP_STANDBY_PASSWORD
#   MAIL_FROM_ADDRESS_STANDBY   (a sender the standby provider is authorised to use — SPF/DKIM
#                                for the primary provider will NOT cover the standby)
#
# Usage:
#   bash scripts/failover-smtp.sh            # switch to standby
#   bash scripts/failover-smtp.sh --restore  # switch back to primary
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="$deployment_dir/.env"
compose_file="$deployment_dir/compose.yaml"

[[ -f "$env_file" ]] || { echo "Missing $env_file" >&2; exit 1; }

restore=0
[[ "${1:-}" == "--restore" ]] && restore=1

# Read, not sourced -- see the note in migrate.sh. A value with a space in it makes bash try to run
# a word from the .env, and this script is the one that runs during a mail outage, when a failure to
# start is worst. env_value reads the file the way docker compose does.
SMTP_STANDBY_HOST="$(env_value SMTP_STANDBY_HOST)"
SMTP_STANDBY_PORT="$(env_value SMTP_STANDBY_PORT)"
SMTP_STANDBY_USERNAME="$(env_value SMTP_STANDBY_USERNAME)"
SMTP_STANDBY_PASSWORD="$(env_value SMTP_STANDBY_PASSWORD)"
MAIL_FROM_ADDRESS_STANDBY="$(env_value MAIL_FROM_ADDRESS_STANDBY)"
SMTP_PRIMARY_HOST="$(env_value SMTP_PRIMARY_HOST)"
SMTP_PRIMARY_PORT="$(env_value SMTP_PRIMARY_PORT)"
SMTP_PRIMARY_USERNAME="$(env_value SMTP_PRIMARY_USERNAME)"
SMTP_PRIMARY_PASSWORD="$(env_value SMTP_PRIMARY_PASSWORD)"
MAIL_FROM_ADDRESS_PRIMARY="$(env_value MAIL_FROM_ADDRESS_PRIMARY)"

if [[ $restore -eq 0 ]]; then
  : "${SMTP_STANDBY_HOST:?SMTP_STANDBY_HOST is not set — there is no standby to fail over to}"
  : "${SMTP_STANDBY_USERNAME:?}" "${SMTP_STANDBY_PASSWORD:?}" "${MAIL_FROM_ADDRESS_STANDBY:?}"
  echo "Switching to standby SMTP: $SMTP_STANDBY_HOST"
  new_host="$SMTP_STANDBY_HOST"; new_port="${SMTP_STANDBY_PORT:-587}"
  new_user="$SMTP_STANDBY_USERNAME"; new_pass="$SMTP_STANDBY_PASSWORD"
  new_from="$MAIL_FROM_ADDRESS_STANDBY"
else
  : "${SMTP_PRIMARY_HOST:?SMTP_PRIMARY_HOST is not set — nothing recorded to restore to}"
  echo "Switching back to primary SMTP: $SMTP_PRIMARY_HOST"
  new_host="$SMTP_PRIMARY_HOST"; new_port="${SMTP_PRIMARY_PORT:-587}"
  new_user="$SMTP_PRIMARY_USERNAME"; new_pass="$SMTP_PRIMARY_PASSWORD"
  new_from="$MAIL_FROM_ADDRESS_PRIMARY"
fi

# Remember where we came from, once, so --restore has something to go back to.
grep -q '^SMTP_PRIMARY_HOST=' "$env_file" || cat >> "$env_file" <<EOF

# Recorded by failover-smtp.sh so the switch can be undone.
SMTP_PRIMARY_HOST=$SPRING_MAIL_HOST
SMTP_PRIMARY_PORT=${SPRING_MAIL_PORT:-587}
SMTP_PRIMARY_USERNAME=$SPRING_MAIL_USERNAME
SMTP_PRIMARY_PASSWORD=$SPRING_MAIL_PASSWORD
MAIL_FROM_ADDRESS_PRIMARY=$MAIL_FROM_ADDRESS
EOF

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$env_file"; then
    # Value written via a temporary file rather than sed -i with the value inline, so a password
    # containing / or & cannot corrupt the file.
    "${PYTHON_BIN:-python3}" - "$env_file" "$key" "$value" <<'PY'
import sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path, encoding='utf-8').read().split('\n')
lines = [f'{key}={value}' if line.startswith(key + '=') else line for line in lines]
open(path, 'w', encoding='utf-8').write('\n'.join(lines))
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

set_env SPRING_MAIL_HOST "$new_host"
set_env SPRING_MAIL_PORT "$new_port"
set_env SPRING_MAIL_USERNAME "$new_user"
set_env SPRING_MAIL_PASSWORD "$new_pass"
set_env MAIL_FROM_ADDRESS "$new_from"

echo "Recreating the application so it picks up the new mail configuration"
docker compose --env-file "$env_file" -f "$compose_file" up -d --no-deps --force-recreate monolith

echo
echo "Now PROVE it works — a switch that was never tested is not a recovery plan:"
echo "  1. curl -fsS https://\${APP_DOMAIN}/actuator/health   # mail must report UP"
echo "  2. Request an admin code and confirm the mail actually arrives."
echo "  3. Sign in with it."
echo
echo "If mail still fails, the problem is not the provider — check DNS, egress from the VPS,"
echo "and whether the standby sender address is authorised (SPF/DKIM are per provider)."
