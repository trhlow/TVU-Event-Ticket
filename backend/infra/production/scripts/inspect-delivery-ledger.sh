#!/usr/bin/env bash
# Read-only inspection of the notification delivery ledger on the production host.
#
#   bash scripts/inspect-delivery-ledger.sh
#
# Exit 0  nothing needs a human.
# Exit 3  something does -- an UNKNOWN delivery, a claim the reconciler never picked up, or an
#         approved student holding a ticket whose email never went out. Distinct from 1 so a cron
#         job can tell "found something" from "could not run".
#
# OPERATIONS.md sets the duty: within an hour on an event day, daily otherwise. It gave the operator
# a query and left them to run it by hand; nobody ever had. This is that duty as one command, with
# an exit status something can alert on.
#
# Nothing here writes. Resolving a row is a decision a person makes against the provider's logs, and
# a script that guessed would be a script that silently decides a student never gets their ticket.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$script_dir/common.sh"

report_sql="$script_dir/delivery-ledger-report.sql"
[[ -f "$report_sql" ]] || die "Missing $report_sql"

[[ -f "$env_file" ]] || die "Missing production environment file: $env_file"
POSTGRES_DB="$(env_value POSTGRES_DB)"
POSTGRES_USER="$(env_value POSTGRES_USER)"
: "${POSTGRES_DB:?POSTGRES_DB is missing from $env_file}"
: "${POSTGRES_USER:?POSTGRES_USER is missing from $env_file}"

# -v ON_ERROR_STOP=1 so a query that cannot run is a failure rather than a section that silently
# prints nothing -- an empty section and a broken one look identical, and one of them means "all
# clear".
output="$(compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <"$report_sql")" || {
  echo "The report could not be run against $POSTGRES_DB." >&2
  echo "Nothing was inspected -- do NOT read this as 'no problems found'." >&2
  exit 1
}

printf '%s\n' "$output"

needs_attention="$(printf '%s' "$output" | tr -d '\r' | sed -n 's/^NEEDS_ATTENTION=\([0-9]\{1,\}\)$/\1/p' | tail -1)"
if [[ -z "$needs_attention" ]]; then
  echo "" >&2
  echo "The report ran but printed no NEEDS_ATTENTION line, so its verdict is unknown." >&2
  echo "Treating that as a failure: a check that cannot state its result has not checked anything." >&2
  exit 1
fi

echo ""
if [[ "$needs_attention" -eq 0 ]]; then
  echo "Nothing needs a human: no UNKNOWN deliveries, no expired claims, and every approved"
  echo "ticket issued since the ledger began has a DELIVERED email behind it."
  exit 0
fi

echo "$needs_attention row(s) need a person, in sections 1, 2 and 4 above." >&2
echo "Section 4 is the urgent one: those students have a ticket and no QR code, and there is no" >&2
echo "second way to send it -- no endpoint returns the payload and check-in has no manual path." >&2
exit 3
