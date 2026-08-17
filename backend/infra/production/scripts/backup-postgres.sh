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

# From here the dump is a verified artifact and must survive whatever happens next.
#
# The ERR trap above deletes it, and it stayed armed through the off-site copy below -- so an
# rclone that could not reach the remote took the freshly verified local backup down with it,
# leaving the host with one fewer backup precisely in the situation the off-site copy exists to
# survive. Disarmed here rather than widened, because every remaining step is either optional
# (off-site) or self-limiting (retention), and none of them can invalidate the file on disk.
trap - ERR

# Encryption is deliberately NOT applied to the local dump, and that is not the same as not
# encrypting. A key the production host can read protects nothing from anyone who reaches the
# production host, and a key it cannot read would make the local dump undecryptable -- which is
# the copy rollback.sh and restore-postgres-into-new-stack.sh actually restore from, on this host,
# usually while something is already broken. The local dump therefore sits inside the same trust
# boundary as postgres_data itself, which is also plaintext on the same disk.
#
# What leaves the host is a different matter, and is encrypted below: a third party's storage is
# outside that boundary, and these dumps carry every student's name, email, MSSV and ticket
# history. age -r takes a PUBLIC key, so BACKUP_AGE_RECIPIENT is all this host ever holds; the
# private key must live somewhere it cannot read, or the encryption is decoration.

meta_file="${backup_file}.meta"
printf 'BACKUP_STARTED_AT=%s\n' "$timestamp" > "$meta_file"

# OFF-SITE FIRST, THEN RETENTION. These two used to run the other way round, which meant a run that
# failed to reach the remote had already deleted the oldest local copies -- fewer backups on a disk
# that just proved it could not be relied on. The order matters most in exactly the situation the
# off-site copy exists for.
#
# The copy is checked rather than assumed: `rclone copy` succeeding tells you the command exited 0,
# and this whole script is a lesson in the difference between that and the file being there.
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  command -v rclone > /dev/null || {
    echo "BACKUP_REMOTE is set but rclone is unavailable" >&2
    exit 1
  }
  # Refused, not downgraded to a warning. Uploading these dumps in the clear is the one failure
  # here that cannot be undone afterwards: once every student's name, email and MSSV has been
  # handed to someone else's storage, deleting the object does not take it back. A backup that did
  # not happen is recoverable by running this again; a disclosure is not.
  [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || {
    echo "BACKUP_REMOTE is set but BACKUP_AGE_RECIPIENT is not." >&2
    echo "Refusing to copy an unencrypted database dump off this host: it contains every" >&2
    echo "student's name, email, MSSV and ticket history. Generate a key pair somewhere this" >&2
    echo "host cannot read (age-keygen), then set BACKUP_AGE_RECIPIENT to the PUBLIC key." >&2
    exit 1
  }
  command -v age > /dev/null || {
    echo "BACKUP_AGE_RECIPIENT is set but age is unavailable, so the dump cannot be encrypted" >&2
    echo "and will not be copied off this host. Install age (apt install age)." >&2
    exit 1
  }

  encrypted_file="${backup_file}.age"
  rm -f -- "$encrypted_file" "${encrypted_file}.sha256"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$encrypted_file" "$backup_file"

  # That age exited 0 is not evidence the file is encrypted -- the same reasoning the restore check
  # above exists for. An age file begins with its format banner, so a truncated, empty or
  # accidentally-plaintext artifact is caught here rather than discovered by whoever needs it.
  read -r age_header < "$encrypted_file" || age_header=""
  [[ "$age_header" == "age-encryption.org/v1" ]] || {
    echo "$encrypted_file does not begin with the age format banner, so it is not an encrypted" >&2
    echo "age file whatever age reported. Nothing has been copied off this host." >&2
    rm -f -- "$encrypted_file"
    exit 1
  }

  # Checksum of the ENCRYPTED artifact: this is the file the remote holds and the file a restore
  # downloads, so it is the one whose integrity the remote copy can be checked against. The
  # plaintext .sha256 written earlier stays local, for the local restore path.
  sha256sum "$encrypted_file" | awk '{print $1}' > "${encrypted_file}.sha256"

  rclone copy "$encrypted_file" "$BACKUP_REMOTE"
  rclone copy "${encrypted_file}.sha256" "$BACKUP_REMOTE"
  # The meta carries only the snapshot timestamp -- no personal data -- and the restore path needs
  # it to anchor its notification watermark, so it goes as-is.
  rclone copy "$meta_file" "$BACKUP_REMOTE"

  remote_size="$(rclone size --json "$BACKUP_REMOTE/$(basename "$encrypted_file")" 2>/dev/null \
    | "${PYTHON_BIN:-python3}" -c 'import json,sys; print(json.load(sys.stdin)["bytes"])' 2>/dev/null || echo 0)"
  local_size="$(stat -c '%s' "$encrypted_file")"
  [[ "$remote_size" == "$local_size" ]] || {
    echo "The off-site copy is $remote_size bytes; the encrypted dump is $local_size." >&2
    echo "Not deleting anything locally: the remote copy cannot be relied on." >&2
    exit 1
  }
  echo "Off-site copy verified: $local_size encrypted bytes at $BACKUP_REMOTE"

  # Removed once the remote holds it: this host cannot decrypt it, so keeping it here costs disk
  # and protects nothing. The plaintext dump it was made from stays, and is what a local restore
  # uses.
  rm -f -- "$encrypted_file" "${encrypted_file}.sha256"
fi

# Retention is intentionally constrained to the deployment backup directory.
#
# These dumps live on the same disk as postgres_data, so they survive a bad migration but not a lost
# volume or a lost host. BACKUP_REMOTE is what makes them a backup rather than a snapshot; without
# it, everything here is one disk failure from gone. That is a deliberate default for a capstone
# deployment, stated so it is a choice rather than an oversight.
resolved_backup_dir="$(cd -- "$backup_dir" && pwd)"
resolved_default_dir="$(cd -- "$deployment_dir" && pwd)/backups"
if [[ "$resolved_backup_dir" == "$resolved_default_dir" ]]; then
  find "$resolved_backup_dir" -maxdepth 1 -type f -name 'tvu_app_*.dump*' \
    -mtime "+$retention_days" -delete
fi

echo "Verified PostgreSQL backup: $backup_file"
