#!/usr/bin/env bash
# Runs Flyway as the schema owner, then re-applies the runtime account's grants.
#
# A one-shot step before the application starts, not something the application does to itself. The
# app container holds only the runtime credentials and has spring.flyway.enabled=false, so it
# cannot alter the schema even if it is compromised.
#
# Idempotent: running it when there is nothing to migrate simply re-applies the grants.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# env_value lives here. This file used to read the .env with `source` and needed nothing from
# common.sh; when that changed, the source line did not come with it and the migration died on
# "env_value: command not found" -- after the datastores were already up. The assignments below
# override common.sh's with the same values and are kept so this script still reads standalone.
# shellcheck source=common.sh
source "$script_dir/common.sh"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"

[[ -f "$env_file" ]] || {
  echo "Missing production environment file: $env_file" >&2
  exit 1
}

# Read, not sourced. A .env is a data file that docker compose parses; it is not a shell script, and
# treating it as one only works while every value happens to look like a shell word. It does not:
# MAIL_FROM_NAME=TVU Events makes bash run `Events`, exit 127, and with `set -e` the migration dies
# before it starts -- and the flattened JWT PEMs contain spaces too. Measured against a freshly
# generated .env, not imagined. common.sh's env_value reads the file the way compose does.
POSTGRES_DB="$(env_value POSTGRES_DB)"
POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"
POSTGRES_APP_USER="$(env_value POSTGRES_APP_USER)"
POSTGRES_APP_PASSWORD="$(env_value POSTGRES_APP_PASSWORD)"

: "${POSTGRES_DB:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}"
: "${POSTGRES_APP_USER:?}" "${POSTGRES_APP_PASSWORD:?}"

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

echo "== Ensuring the runtime role exists =="
# Created here rather than in an init script so it also exists after a restore into a fresh volume.
compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v app="$POSTGRES_APP_USER" -v pw="$POSTGRES_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app', :'pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app', :'pw') \gexec
SQL

echo "== Running migrations as the schema owner =="
# The application image carries Flyway and the migration files; running it with a one-off command
# keeps a single source of migrations rather than a second copy in a migration image.
# The owner password is passed by NAME, not by value: `-e KEY=value` puts the schema owner's
# credential in docker compose's argv, where any local user can read it out of /proc/*/cmdline or
# `ps aux` for as long as the migration runs. `-e KEY` with no `=` tells compose to forward the
# value from its own environment instead, so it never appears on a command line.
export SPRING_DATASOURCE_USERNAME="$POSTGRES_USER"
export SPRING_DATASOURCE_PASSWORD="$POSTGRES_PASSWORD"
compose run --rm --no-deps \
  -e SPRING_FLYWAY_ENABLED=true \
  -e SPRING_DATASOURCE_USERNAME \
  -e SPRING_DATASOURCE_PASSWORD \
  -e SPRING_MAIN_WEB_APPLICATION_TYPE=none \
  -e SPRING_PROFILES_ACTIVE=prod,monolith \
  monolith \
  java -cp app.jar -Dspring.flyway.enabled=true \
    org.springframework.boot.loader.launch.JarLauncher --spring.main.web-application-type=none

echo "== Re-applying runtime grants =="
# After every migration, not once at install time: a migration that adds a table would otherwise
# leave the runtime account unable to read it, and the site would break on that deploy.
compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v db="$POSTGRES_DB" -v owner="$POSTGRES_USER" -v app="$POSTGRES_APP_USER" \
  < "$script_dir/grant-runtime-user.sql"

echo "== Verifying the runtime account is not an owner =="
# Proof rather than assumption: if this ever passes, the split has silently stopped working.
if compose exec -T postgres psql -U "$POSTGRES_APP_USER" -d "$POSTGRES_DB" -qtAX \
     -c 'CREATE TABLE _h11_should_fail (id int)' >/dev/null 2>&1; then
  compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c 'DROP TABLE IF EXISTS _h11_should_fail' >/dev/null
  echo "FAIL: $POSTGRES_APP_USER can CREATE TABLE; it must not be able to" >&2
  exit 1
fi
echo "ok: $POSTGRES_APP_USER cannot create tables"
