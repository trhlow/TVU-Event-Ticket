#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd -- "$script_dir/.." && pwd)"
compose_file="$deployment_dir/compose.yaml"
env_file="$deployment_dir/.env"
backup_dir="${BACKUP_DIR:-$deployment_dir/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing production environment file: $env_file" >&2
  exit 1
fi

umask 077
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/tvu_app_${timestamp}.dump"

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
docker run --rm -i postgres:18.4-alpine pg_restore --list - < "$backup_file" > /dev/null

# Retention is intentionally constrained to the deployment backup directory.
resolved_backup_dir="$(cd -- "$backup_dir" && pwd)"
resolved_default_dir="$(cd -- "$deployment_dir" && pwd)/backups"
if [[ "$resolved_backup_dir" == "$resolved_default_dir" ]]; then
  find "$resolved_backup_dir" -maxdepth 1 -type f -name 'tvu_app_*.dump' \
    -mtime "+$retention_days" -delete
fi

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  command -v rclone > /dev/null || {
    echo "BACKUP_REMOTE is set but rclone is unavailable" >&2
    exit 1
  }
  rclone copy "$backup_file" "$BACKUP_REMOTE"
fi

echo "Verified PostgreSQL backup: $backup_file"
