#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$script_dir/common.sh"

if [[ "${1:-}" != "--confirm" ]]; then
  cat >&2 <<'EOF'
Usage: bash scripts/rollback.sh --confirm [COMMIT_OR_REF]

This rebuilds and deploys old application code. It does NOT reverse Flyway
migrations or restore PostgreSQL. Review migration compatibility first. To
rewind data, use a verified database backup and restore-postgres.sh separately.
EOF
  exit 2
fi

target_ref="${2:-}"
if [[ -z "$target_ref" ]]; then
  [[ -f "$state_dir/previous-ref" ]] || die "No previous release is recorded; provide COMMIT_OR_REF"
  target_ref="$(<"$state_dir/previous-ref")"
fi
[[ "$target_ref" =~ ^[A-Za-z0-9._/-]+$ ]] || die "Rollback ref contains unsafe characters"

tracked_changes="$(git -C "$repository_dir" status --porcelain --untracked-files=no)"
[[ -z "$tracked_changes" ]] || die "Tracked files are modified on the production checkout"

current_ref="$(current_release_ref)"
git -C "$repository_dir" fetch --prune origin "$target_ref"
rollback_commit="$(git -C "$repository_dir" rev-parse --verify "FETCH_HEAD^{commit}")"

echo "Creating a verified backup before rollback"
bash "$script_dir/backup-postgres.sh"

# Keep the verified deployment tooling alive while Git replaces the working
# tree. The target release may predate these scripts.
tooling_dir="$(mktemp -d)"
trap 'rm -rf -- "$tooling_dir"' EXIT
cp "$script_dir/common.sh" "$script_dir/preflight.sh" "$script_dir/smoke-test.sh" \
  "$script_dir/deploy.sh" "$tooling_dir/"
git -C "$repository_dir" checkout --detach "$rollback_commit"

DEPLOYMENT_DIR_OVERRIDE="$deployment_dir" \
REPOSITORY_DIR_OVERRIDE="$repository_dir" \
PREVIOUS_REF="$current_ref" \
SKIP_DEPLOY_BACKUP=1 \
  bash "$tooling_dir/deploy.sh"
echo "Rolled back application code from $current_ref to $rollback_commit"
