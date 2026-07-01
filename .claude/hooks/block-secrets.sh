#!/usr/bin/env bash
# PreToolUse hook for Bash commands.
# Blocks (exit 2) if a command looks like it would commit a secret file or embed a
# literal secret value. Env-var *references* (${DB_PASSWORD}, $JWT_SECRET) are allowed —
# only literal assignments with a real value are flagged.
#
# Input: PreToolUse JSON on stdin, e.g. {"tool_name":"Bash","tool_input":{"command":"..."}}
# Output: on block, reason -> stderr, exit 2. Otherwise exit 0.

set -euo pipefail

payload="$(cat)"

# Extract the command string. Prefer python (present on this machine) for robust JSON parsing;
# fall back to a crude sed if python is unavailable.
extract_cmd() {
  if command -v python >/dev/null 2>&1; then
    printf '%s' "$payload" | python -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
print((d.get("tool_input") or {}).get("command","") or "")'
  else
    printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p'
  fi
}

cmd="$(extract_cmd)"
[ -z "$cmd" ] && exit 0

block() {
  echo "BLOCKED by block-secrets hook: $1" >&2
  echo "If this is a false positive, use env-var references (\${NAME}) or adjust .claude/hooks/block-secrets.sh." >&2
  exit 2
}

# 1) Staging/committing sensitive files.
if printf '%s' "$cmd" | grep -Eiq '\bgit[[:space:]]+(add|commit)\b'; then
  if printf '%s' "$cmd" | grep -Eiq '(^|[[:space:]/])(\.env(\.[a-z]+)?|application-prod\.ya?ml|application-local\.ya?ml|\.credentials([._-][a-z]+)?|id_rsa)([[:space:]]|$)|\.(pem|key|p12|pfx|jks|keystore)\b'; then
    block "attempt to git add/commit a secret-bearing file (.env / application-prod.yml / *.pem / *.key / keystore / credentials)"
  fi
fi

# 2) Literal secret assignments with a real value.
#    Matches NAME=value where NAME is a secret-ish key and value is NOT an env reference/empty.
#    Allowed (not matched): FOO=${BAR}, FOO=$BAR, FOO=, FOO="".
if printf '%s' "$cmd" | grep -Eiq '(PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|QR_SIGNING_SECRET|JWT[_A-Z]*)[[:space:]]*=[[:space:]]*("?[^$"'"'"'[:space:]][^"'"'"'[:space:]]{5,})'; then
  block "literal secret assignment detected (e.g. SECRET=... / PASSWORD=...). Use environment variables instead."
fi

# 3) Common cloud key formats appearing inline.
if printf '%s' "$cmd" | grep -Eq 'AKIA[0-9A-Z]{16}|-----BEGIN[[:space:]](RSA|OPENSSH|EC|PGP)[[:space:]]?PRIVATE KEY-----'; then
  block "hard-coded cloud/private key material detected"
fi

exit 0
