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
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"

[[ -f "$env_file" ]] || {
  echo "Missing production environment file: $env_file" >&2
  exit 1
}

# shellcheck disable=SC1090
set -a; source "$env_file"; set +a

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
compose run --rm --no-deps \
  -e SPRING_FLYWAY_ENABLED=true \
  -e SPRING_DATASOURCE_USERNAME="$POSTGRES_USER" \
  -e SPRING_DATASOURCE_PASSWORD="$POSTGRES_PASSWORD" \
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
