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

# The datastores come up before anything touches them. migrate.sh's first act is
# `compose exec -T postgres`, which on a machine that has never deployed is "service postgres is not
# running", exit 1, and the whole deploy dies -- after paying for a full Maven and Vite build. That
# was the first-run behaviour until this line existed, and no document mentioned starting them by
# hand. --wait means healthy, not merely created, so migrate.sh cannot race the socket.
echo "Starting datastores"
compose up -d --wait postgres redis rabbitmq

# BEFORE the migration, not after. This step used to sit below migrate.sh while printing
# "pre-deploy", so the newest backup was always post-migration -- and for the one scenario it exists
# for, "deployed, migration applied, application broken", restoring it did not undo the migration.
# There was no point in the lifetime of this deployment at which a pre-migration backup existed.
#
# Skipped when the database has no schema yet: a first deploy has nothing to lose, and dumping an
# empty database would write a file that looks like a backup of the release before it.
if [[ "${SKIP_DEPLOY_BACKUP:-0}" != "1" ]] \
  && compose exec -T postgres psql -U "$(env_value POSTGRES_USER)" -d "$(env_value POSTGRES_DB)" \
       -qtAX -c "select to_regclass('public.flyway_schema_history') is not null" 2>/dev/null \
     | grep -qx t; then
  echo "Creating a pre-migration PostgreSQL backup"
  bash "$deployment_dir/scripts/backup-postgres.sh"
else
  echo "No existing schema; skipping the pre-migration backup"
fi

echo "Applying database migrations as the schema owner"
# A separate one-shot step: the application container carries only the runtime credentials and
# runs with spring.flyway.enabled=false, so it cannot alter the schema itself. This also
# re-applies the runtime grants, which matters after a migration adds a table.
bash "$deployment_dir/scripts/migrate.sh"

if ! compose up -d --wait --remove-orphans; then
  compose ps >&2 || true
  compose logs --tail 200 monolith caddy frontend >&2 || true
  die "Deployment failed. The database was not rolled back automatically."
fi

if ! bash "$script_dir/smoke-test.sh"; then
  compose ps >&2 || true
  compose logs --tail 200 monolith caddy frontend >&2 || true
  die "Deployment started but the public smoke test failed.

The stack is up; what failed was a check made over public HTTPS. On a FIRST deploy this is almost
always Let's Encrypt: the certificate is not issued until DNS resolves to this host and ports 80 and
443 are reachable, and the smoke test waits about a minute. Check with:

  docker compose --env-file .env -f compose.yaml logs caddy | tail -50
  dig +short $(env_value APP_DOMAIN)

If Caddy has not got its certificate yet, wait for issuance and RE-RUN scripts/deploy.sh. That is
safe: nothing was recorded, .state/current-ref was not written, and the script is idempotent.

If Caddy has a certificate and the check still fails, read the application logs above before
considering rollback."
fi

printf '%s\n' "$release_ref" >"$state_dir/current-ref"
date -u +%Y-%m-%dT%H:%M:%SZ >"$state_dir/deployed-at"
echo "Production deployment completed for $release_ref"
