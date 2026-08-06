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
  VITE_MICROSOFT_CLIENT_ID
  VITE_MICROSOFT_TENANT_ID
  VITE_MICROSOFT_REDIRECT_URI
)

# Three values are not merely required, they have exactly one correct value in production. Checking
# only that they are non-empty let a development configuration -- provider devstub, app env
# development, an API pointed at localhost -- hash cleanly and be published as a production build.
# A fingerprint over a wrong configuration is stable and useless.
readonly FRONTEND_CONFIG_EXACT=(
  "VITE_APP_ENV=production"
  "VITE_AUTH_PROVIDER=microsoft"
  "VITE_API_BASE_URL=/api"
)

# Demo mode was removed, not made configurable. src/lib/env.ts still reads both and refuses to start
# when either is true in production, so their presence here would be a step back towards the bundle
# that shipped seventeen fixture email addresses. Rejected outright rather than fingerprinted.
readonly FRONTEND_CONFIG_FORBIDDEN=(
  VITE_USE_DEMO_DATA
  VITE_ENABLE_MOCK_FALLBACK
)

_frontend_config_require_python() {
  # Probe by what comes back, not by exit status, and in the shape this script actually uses -- a
  # program arriving on stdin. `command -v python3` is not enough on Windows developer machines: the
  # Microsoft Store alias sits on PATH, resolves, and then refuses to run. Neither is `exit 0`: the
  # same alias in its other mood swallows its input and succeeds, and an exit-status probe accepts
  # it. What is left then is a hash of nothing, which is the fail-open shape this whole file exists
  # to prevent -- and the only thing catching it would be a downstream length check, a guard about
  # output rather than about the interpreter.
  #
  # PYTHON_BIN wins, as everywhere else in this repository. Without it `python3` is the only name
  # this script can try, so on a developer machine it can never run at all and its own suite is
  # permanently red for a reason that has nothing to do with its subject.
  # One candidate, then a loud failure -- the same shape as .github/scripts/python-bin.sh, and
  # deliberately not a search. Falling back through a list of names means the interpreter that ran
  # is not the one anybody named, and a probe cannot then be trusted to have tested it: measured
  # here, a `python` fallback silently stepped around this suite's own broken-`python3` fixture and
  # reported success. PYTHON_BIN is the one escape hatch.
  FRONTEND_CONFIG_PYTHON="${PYTHON_BIN:-python3}"
  if [[ "$(printf '%s\n' 'import sys; sys.stdout.write("PYBIN-OK")' \
             | "$FRONTEND_CONFIG_PYTHON" - 2>/dev/null)" != "PYBIN-OK" ]]; then
    echo "$FRONTEND_CONFIG_PYTHON is required to canonicalise the frontend config, and did not" >&2
    echo "run a program arriving on stdin. Set PYTHON_BIN to a working Python 3." >&2
    echo "Refusing to continue: without it this script cannot tell a real config from an empty" >&2
    echo "one." >&2
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

  # The three expectation lists travel in the environment, not in argv, and only the mode and the
  # path stay as arguments. Two reasons, and the second was measured rather than anticipated:
  #
  #   - counts-then-items in argv means the reader and the writer have to agree on arithmetic to
  #     agree on data, and nothing checks that they still do;
  #   - on a Windows developer machine Git Bash rewrites any argument that looks like a POSIX path
  #     before handing it to a native Windows program, so the expected value `/api` arrived as
  #     `C:/Program Files/Git/api` and the script rejected the very config it had just read.
  #     Excluding everything from that rewriting is not the fix either: `$env_file` is a POSIX path
  #     that has to be rewritten, or the interpreter cannot open it. The environment is not
  #     rewritten at all, so putting the values there sidesteps the question.
  local spec
  spec="$(
    printf 'required\t%s\n' "${FRONTEND_CONFIG_REQUIRED[@]}"
    printf 'exact\t%s\n' "${FRONTEND_CONFIG_EXACT[@]}"
    printf 'forbidden\t%s\n' "${FRONTEND_CONFIG_FORBIDDEN[@]}"
  )"

  FRONTEND_CONFIG_SPEC="$spec" "$FRONTEND_CONFIG_PYTHON" - "$mode" "$env_file" <<'PYTHON'
import hashlib
import json
import os
import re
import sys

mode, env_path = sys.argv[1:3]

required, exact, forbidden = [], {}, []
for line in os.environ["FRONTEND_CONFIG_SPEC"].splitlines():
    kind, _, item = line.partition("\t")
    if kind == "required":
        required.append(item)
    elif kind == "exact":
        key, _, value = item.partition("=")
        exact[key] = value
    elif kind == "forbidden":
        forbidden.append(item)
    else:
        sys.exit(f"FRONTEND_CONFIG_SPEC carries an unknown kind {kind!r}")

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

for key, wanted in exact.items():
    value = values.get(key)
    if value != wanted:
        problems.append(f"{key} must be exactly {wanted!r} in a production build, not {value!r}")

for key in values:
    if not key.startswith("VITE_"):
        # Vite ignores it, so it never reaches the bundle and never reaches the fingerprint. Left
        # accepted, it would sit in the file looking like configuration that does something.
        problems.append(f"{key} is not a VITE_ variable; Vite would ignore it and it would not be "
                        f"part of the fingerprint")

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
