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
# No --pull. Base images are pinned by digest in the Dockerfiles and compose file, so there is
# nothing newer to fetch under the same reference; --pull only added a way for two builds of the
# same commit to differ. Building on the VPS at deploy time is still not reproducible-by-
# construction — the target remains build once in CI, push to a registry, deploy by digest — but
# with the digests pinned the same commit now produces the same layers.
compose build

echo "Applying database migrations as the schema owner"
# A separate one-shot step: the application container carries only the runtime credentials and
# runs with spring.flyway.enabled=false, so it cannot alter the schema itself. This also
# re-applies the runtime grants, which matters after a migration adds a table.
bash "$deployment_dir/scripts/migrate.sh"

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
