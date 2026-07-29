#!/usr/bin/env bash
# Canonicalises and fingerprints the production frontend build configuration.
#
# Vite bakes every VITE_* value it reads into the bundle, so a frontend image is valid for exactly
# the configuration it was built from -- a frontend digest is not portable the way the monolith's
# is. The fingerprint is how a deploy detects an image built for a different configuration before
# serving it to anyone.
#
# Not the consumer of these values: Vite is. This file is the canonicaliser and verifier, and it
# exists so that the publish workflow and the deploy scripts agree on what "the same configuration"
# means. Two implementations of one hash disagree eventually, and they disagree at deploy time
# rather than at review time.
#
# Values live in frontend/.env.production, tracked in Git, so changing one takes a pull request and
# a commit corresponds to exactly one bundle. They are public identifiers and end up readable in
# the shipped bundle either way. Never put a secret there.
#
# The first version of this script was fail-open, and the shape is worth remembering: python3 was
# unusable, the canonicaliser printed nothing, sha256sum hashed the empty string, and the function
# returned e3b0c442... with exit 0 -- the same value a config missing a required key produced. A
# deploy-time comparison built on that could never fail. Everything below either produces a hash of
# real content or exits non-zero.
set -euo pipefail

# Must be present and non-blank. Everything else beginning with VITE_ is also fingerprinted, so a
# new variable changes the hash without anyone remembering to add it to a list here.
readonly FRONTEND_CONFIG_REQUIRED=(
  VITE_API_BASE_URL
  VITE_APP_ENV
  VITE_AUTH_PROVIDER
  VITE_MICROSOFT_CLIENT_ID
  VITE_MICROSOFT_TENANT_ID
  VITE_MICROSOFT_REDIRECT_URI
)

# Demo mode was removed, not made configurable. src/lib/env.ts still reads both and refuses to start
# when either is true in production, so their presence here would be a step back towards the bundle
# that shipped seventeen fixture email addresses. Rejected outright rather than fingerprinted.
readonly FRONTEND_CONFIG_FORBIDDEN=(
  VITE_USE_DEMO_DATA
  VITE_ENABLE_MOCK_FALLBACK
)

_frontend_config_require_python() {
  # `command -v python3` is not enough on Windows developer machines: the Microsoft Store alias sits
  # on PATH, resolves, and then refuses to run. Ask it to do something and check that it did.
  if ! python3 -c 'import sys; sys.exit(0)' >/dev/null 2>&1; then
    echo "python3 is required to canonicalise the frontend config, and is not usable here." >&2
    echo "Refusing to continue: without it this script cannot tell a real config from an empty one." >&2
    return 1
  fi
}

_frontend_config_run() {
  local mode="$1" repo_root="$2"
  local env_file="$repo_root/frontend/.env.production"

  _frontend_config_require_python || return 1

  if [[ ! -f "$env_file" ]]; then
    echo "frontend/.env.production not found at $env_file" >&2
    return 1
  fi

  python3 - "$mode" "$env_file" \
    "${#FRONTEND_CONFIG_REQUIRED[@]}" "${FRONTEND_CONFIG_REQUIRED[@]}" \
    "${FRONTEND_CONFIG_FORBIDDEN[@]}" <<'PYTHON'
import hashlib
import json
import re
import sys

mode, env_path, required_count, *rest = sys.argv[1:]
required_count = int(required_count)
required = rest[:required_count]
forbidden = rest[required_count:]

GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

# Deliberately a strict KEY=value reader rather than a dotenv implementation. Quoting, escapes and
# ${...} interpolation are all rejected instead of interpreted: this reader and Vite would not
# necessarily agree on what they mean, and a fingerprint that hashes something other than what the
# build sees is worse than no fingerprint.
values = {}
for number, raw in enumerate(open(env_path, encoding="utf-8"), start=1):
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        sys.exit(f"{env_path}:{number}: not KEY=value")
    key, _, value = line.partition("=")
    key, value = key.strip(), value.strip()
    if key in values:
        # Last-wins is what most parsers do, and it is how two readers of one file end up
        # disagreeing about what it says.
        sys.exit(f"{env_path}:{number}: duplicate key {key}")
    values[key] = value

problems = []

for key in forbidden:
    if key in values:
        problems.append(f"{key} must not appear: demo mode was removed, not made configurable")

for key in required:
    value = values.get(key)
    if not value:
        problems.append(f"{key} is missing or blank")

for key, value in sorted(values.items()):
    if not key.startswith("VITE_"):
        continue
    if value and (value[0] in "\"'" or value[-1] in "\"'"):
        problems.append(f"{key} is quoted; quotes are rejected rather than stripped, because this "
                        f"reader and Vite need not agree on how to unquote")
    if "$" in value:
        problems.append(f"{key} contains '$'; interpolation is rejected rather than expanded, for "
                        f"the same reason")

for key in ("VITE_MICROSOFT_CLIENT_ID", "VITE_MICROSOFT_TENANT_ID"):
    value = values.get(key, "")
    if value and not GUID.match(value):
        problems.append(f"{key} is not a GUID: {value!r}. Use the Application (client) ID and "
                        f"Directory (tenant) ID, not an Object ID or a display name")

redirect = values.get("VITE_MICROSOFT_REDIRECT_URI", "")
if redirect and not redirect.startswith("https://"):
    problems.append(f"VITE_MICROSOFT_REDIRECT_URI must be https in production: {redirect!r}")

for key, value in values.items():
    if "REPLACE" in value.upper() or value.startswith("<"):
        problems.append(f"{key} still looks like a placeholder: {value!r}")

if problems:
    sys.exit(f"{env_path}: " + "; ".join(problems))

# Every VITE_* key, not a fixed list: Vite bakes all of them, so all of them are part of what makes
# this bundle this bundle. sort_keys and separators without spaces make the bytes stable across
# Python versions and platforms; a `|`-joined string was the first idea and is ambiguous, since a
# value containing the separator collides with a different set of values. No trailing newline.
canonical = json.dumps({k: v for k, v in values.items() if k.startswith("VITE_")},
                       sort_keys=True, separators=(",", ":"), ensure_ascii=False)

if mode == "json":
    sys.stdout.write(canonical)
elif mode == "fingerprint":
    # Hashed here rather than piped to sha256sum: a pipeline whose hash command produces nothing but
    # exits zero yields an empty fingerprint that compares equal to nothing and passes.
    sys.stdout.write(hashlib.sha256(canonical.encode("utf-8")).hexdigest())
else:
    sys.exit(f"unknown mode {mode!r}")
PYTHON
}

# Usage: frontend_config_json <repo_root>
frontend_config_json() {
  local rendered
  rendered="$(_frontend_config_run json "$1")" || return 1
  [[ -n "$rendered" ]] || {
    echo "The frontend config canonicaliser produced no output." >&2
    return 1
  }
  printf '%s' "$rendered"
}

# Usage: frontend_config_fingerprint <repo_root>
frontend_config_fingerprint() {
  local fingerprint
  fingerprint="$(_frontend_config_run fingerprint "$1")" || return 1
  # Shape-checked, not merely non-empty: this is the value a deploy compares against, so anything
  # that is not a SHA-256 hex digest must fail rather than be compared.
  if [[ ! "$fingerprint" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Fingerprint is not a SHA-256 hex digest: '${fingerprint}'" >&2
    return 1
  fi
  printf '%s' "$fingerprint"
}

# No frontend_build_args(). Production build arguments are what let one commit produce different
# bundles; the values come from the tracked file through Vite now, and leaving a helper here would
# leave the door open.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  root="${1:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
  config="$(frontend_config_json "$root")"
  fingerprint="$(frontend_config_fingerprint "$root")"
  echo "config:      $config"
  echo "fingerprint: $fingerprint"
fi
