#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
  echo "Usage: $0 --confirm /absolute/path/to/tvu_app_YYYYMMDDTHHMMSSZ.dump" >&2
  echo "This replaces the current production database. Test restores on a separate host first." >&2
  exit 2
fi

backup_file="$2"
if [[ ! -f "$backup_file" ]]; then
  echo "Backup file does not exist: $backup_file" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"

docker run --rm -i postgres:18.4-alpine pg_restore --list - < "$backup_file" > /dev/null
docker compose --env-file "$env_file" -f "$compose_file" stop monolith
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < "$backup_file"
docker compose --env-file "$env_file" -f "$compose_file" up -d monolith --wait

echo "Restore completed. Verify login, registration, email and check-in before reopening traffic."
