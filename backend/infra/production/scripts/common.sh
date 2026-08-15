#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="${DEPLOYMENT_DIR_OVERRIDE:-$(cd -- "$script_dir/.." && pwd)}"
repository_dir="${REPOSITORY_DIR_OVERRIDE:-$(cd -- "$deployment_dir/../../.." && pwd)}"
compose_file="$deployment_dir/compose.yaml"
env_file="${ENV_FILE:-$deployment_dir/.env}"
# Consumed by deploy.sh and rollback.sh after this file is sourced.
# shellcheck disable=SC2034
state_dir="$deployment_dir/.state"

compose() {
  ENV_FILE="$env_file" docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command is unavailable: $1"
}

env_value() {
  local key="$1"
  awk -v wanted="$key" '
    index($0, wanted "=") == 1 {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$env_file"
}

require_env_value() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  [[ -n "$value" ]] || die "$key is missing or empty in $env_file"
  [[ "$value" != *"REPLACE_WITH"* ]] || die "$key still contains a REPLACE_WITH placeholder"
  # A whole value wrapped in angle brackets is a placeholder someone pasted verbatim. Only
  # REPLACE_WITH was caught before, so `GHCR_TOKEN=<PAT read:packages>` passed preflight and failed
  # much later at `docker login ghcr.io` with "denied: denied" -- a message about credentials that
  # named neither the key nor the placeholder. Anchored, not a substring match: a real secret may
  # legitimately contain < or > and must not be refused.
  [[ "$value" != "<"*">" ]] \
    || die "$key is still the placeholder $value in $env_file -- replace it with a real value"
}

current_release_ref() {
  git -C "$repository_dir" rev-parse HEAD
}
