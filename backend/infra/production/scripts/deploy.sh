#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$script_dir/common.sh"

bash "$script_dir/preflight.sh"
release_ref="$(current_release_ref)"
previous_ref="${PREVIOUS_REF:-}"
if [[ -z "$previous_ref" && -f "$state_dir/current-ref" ]]; then
  previous_ref="$(<"$state_dir/current-ref")"
fi

mkdir -p "$state_dir"
if [[ -n "$previous_ref" && "$previous_ref" != "$release_ref" ]]; then
  printf '%s\n' "$previous_ref" >"$state_dir/previous-ref"
fi

echo "Building release $release_ref"
compose build --pull

if [[ "${SKIP_DEPLOY_BACKUP:-0}" != "1" ]] \
  && compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "Creating a verified pre-deploy PostgreSQL backup"
  bash "$deployment_dir/scripts/backup-postgres.sh"
fi

if ! compose up -d --wait --remove-orphans; then
  compose ps >&2 || true
  compose logs --tail 200 monolith caddy frontend >&2 || true
  die "Deployment failed. The database was not rolled back automatically."
fi

if ! bash "$script_dir/smoke-test.sh"; then
  compose ps >&2 || true
  compose logs --tail 200 monolith caddy frontend >&2 || true
  die "Deployment started but the public smoke test failed. Inspect logs before rollback."
fi

printf '%s\n' "$release_ref" >"$state_dir/current-ref"
date -u +%Y-%m-%dT%H:%M:%SZ >"$state_dir/deployed-at"
echo "Production deployment completed for $release_ref"
