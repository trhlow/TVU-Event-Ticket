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

# A dump that fails halfway leaves a file that looks like a backup. Remove it rather than leave it
# in the directory the restore path chooses from.
trap 'rm -f -- "$backup_file"' ERR

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"

# VERIFIED BY RESTORING IT, not by listing it. `pg_restore --list` reads the table of contents at
# the head of the file and stops: a dump truncated to 0.4% of its bytes lists exactly like a whole
# one, and this script printed "Verified" over it. Measured against a 200,000-row dump truncated to
# 4 KB. The plausible cause is not exotic -- a full disk mid-redirect, or the OOM killer taking the
# docker CLI during the concurrent build on a 4 GB host.
#
# So: restore into a throwaway container and count rows in a table that must not be empty. On this
# data size it costs seconds, and it is the only check that reads the whole file.
verify_container="tvu-backup-verify-$$"
cleanup_verify() { docker rm -f "$verify_container" >/dev/null 2>&1 || true; }
trap 'cleanup_verify; rm -f -- "$backup_file"' ERR
docker run -d --rm --name "$verify_container" -e POSTGRES_PASSWORD=verify \
  postgres:18.4-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$verify_container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$verify_container" pg_restore -U postgres -d postgres --no-owner --no-privileges \
  < "$backup_file" >/dev/null 2>&1 || true
restored_tables="$(docker exec "$verify_container" psql -U postgres -qtAX \
  -c "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo 0)"
cleanup_verify
trap 'rm -f -- "$backup_file"' ERR
[[ "$restored_tables" -gt 0 ]] || {
  echo "The dump restored zero tables. It is not a usable backup, whatever its size." >&2
  rm -f -- "$backup_file"
  exit 1
}
echo "Restore check: $restored_tables tables came back"

# Record the snapshot moment beside the dump. restore-postgres-into-new-stack.sh anchors its "requeue recently-sent
# notifications" window to this watermark -- the instant the backup was taken -- instead of to max(sent_at),
# which can sit far in the past (e.g. a backup of a long-idle database) and would otherwise re-blast an old
# cluster of ticket emails. Written only after the dump verifies, so a partial backup leaves no watermark.
# A checksum beside the dump, so the RESTORE PATH can tell a corrupted copy from a good one before
# it drops anything. Written after the restore check above, so it certifies a file that has been
# read end to end -- on its own, a checksum of whatever landed on disk proves only that the bytes
# have not changed since, which is not what "verified" should mean.
sha256sum "$backup_file" | awk '{print $1}' > "${backup_file}.sha256"

# Encryption is NOT done here on purpose, because doing it badly is worse than not doing it: a key
# stored next to the backup protects nothing. Encrypt during the off-site copy, with a key held
# somewhere the production host cannot read. Until that exists, treat these dumps as containing
# every student's name, address and ticket history — because they do.
#   Suggested: age -r <recipient> "$backup_file" > "$backup_file.age" && rm "$backup_file"

meta_file="${backup_file}.meta"
printf 'BACKUP_STARTED_AT=%s\n' "$timestamp" > "$meta_file"

# Retention is intentionally constrained to the deployment backup directory.
resolved_backup_dir="$(cd -- "$backup_dir" && pwd)"
resolved_default_dir="$(cd -- "$deployment_dir" && pwd)/backups"
if [[ "$resolved_backup_dir" == "$resolved_default_dir" ]]; then
  find "$resolved_backup_dir" -maxdepth 1 -type f -name 'tvu_app_*.dump*' \
    -mtime "+$retention_days" -delete
fi

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  command -v rclone > /dev/null || {
    echo "BACKUP_REMOTE is set but rclone is unavailable" >&2
    exit 1
  }
  rclone copy "$backup_file" "$BACKUP_REMOTE"
  rclone copy "$meta_file" "$BACKUP_REMOTE"
fi

echo "Verified PostgreSQL backup: $backup_file"
