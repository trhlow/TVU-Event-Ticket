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

# Keep the verified deployment tooling alive while Git replaces the working tree. The target release
# may predate these scripts.
#
# The whole directory, not a hand-written list. The list named four files and preflight.sh sources
# frontend-config.sh, which was not one of them: rollback died on "No such file or directory" -- and
# it died AFTER the checkout below had already moved the tree, so the operator was left with old
# code checked out, new images still running, and an error that reads like a broken tool rather than
# "your working tree has moved". A list has to be updated every time a script grows a dependency,
# and nothing makes anyone do that.
tooling_dir="$(mktemp -d)"
trap 'rm -rf -- "$tooling_dir"' EXIT
cp -R "$script_dir/." "$tooling_dir/"

# Everything that can be checked before the tree moves, is. A rollback that fails on its own
# preconditions must fail with the checkout still where it was.
DEPLOYMENT_DIR_OVERRIDE="$deployment_dir" \
REPOSITORY_DIR_OVERRIDE="$repository_dir" \
  bash "$tooling_dir/preflight.sh" >/dev/null \
  || die "Preflight fails before the rollback has changed anything. Nothing was moved."

# Flyway's validateOnMigrate is on, so a migration that has been applied but is not present in the
# target commit's db/migration is an error, not a no-op: the rollback would fail at migrate.sh --
# again after the checkout. Say so here, where the tree is still intact and the operator still has
# every option.
applied="$(compose exec -T postgres psql -U "$(env_value POSTGRES_USER)" -d "$(env_value POSTGRES_DB)" \
  -qtAX -c "select count(*) from flyway_schema_history where success" 2>/dev/null || echo unknown)"
target_count="$(git -C "$repository_dir" ls-tree -r --name-only "$rollback_commit" \
  -- backend/monolith/src/main/resources/db/migration 2>/dev/null | grep -c '\.sql$' || true)"
if [[ "$applied" != unknown && "$target_count" -gt 0 && "$applied" -gt "$target_count" ]]; then
  die "The database has $applied applied migrations; $rollback_commit ships $target_count.
Rolling the code back does NOT reverse a migration, and Flyway will refuse to start against a
history it cannot resolve. Nothing has been changed. Restore a pre-migration backup into a parallel
stack first -- see docs/CLEAN_SLATE_CUTOVER_VI.md -- or pick a target that includes every applied
migration."
fi

git -C "$repository_dir" checkout --detach "$rollback_commit"
# From here the tree is not where the operator left it, so any failure puts it back rather than
# leaving them to discover it.
restore_checkout() {
  git -C "$repository_dir" checkout --detach "$current_ref" >/dev/null 2>&1 || true
  echo "Rollback failed; the working tree was returned to $current_ref." >&2
  echo "The running stack was not changed by the failure." >&2
}
trap 'restore_checkout; rm -rf -- "$tooling_dir"' ERR

DEPLOYMENT_DIR_OVERRIDE="$deployment_dir" \
REPOSITORY_DIR_OVERRIDE="$repository_dir" \
PREVIOUS_REF="$current_ref" \
SKIP_DEPLOY_BACKUP=1 \
  bash "$tooling_dir/deploy.sh"
trap 'rm -rf -- "$tooling_dir"' EXIT
echo "Rolled back application code from $current_ref to $rollback_commit"
