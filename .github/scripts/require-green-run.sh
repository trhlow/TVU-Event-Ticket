#!/usr/bin/env bash
# Refuses to continue unless every named workflow completed successfully for one exact commit.
#
# Extracted from deploy-production.yml so the publish workflow can ask the same question. Two
# implementations of one gate is how the deploy path and the publish path start disagreeing about
# whether a commit is releasable, and the disagreement would surface as an artifact published from
# a red commit.
#
# Usage: require-green-run.sh REPO SHA WORKFLOW_FILE...
#   require-green-run.sh owner/name 05a426e... ci.yml codeql.yml
#
# Uses the `gh` CLI, so tests can stub it by putting a fake `gh` earlier on PATH.
set -euo pipefail

repo="${1:?repository (owner/name) is required}"
sha="${2:?commit SHA is required}"
shift 2
[[ $# -gt 0 ]] || {
  echo "At least one workflow file name is required" >&2
  exit 2
}

# A short SHA would match nothing in the API and the run would look absent rather than unverified,
# which reads as a different failure than it is.
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "SHA must be the full 40-character commit id, got '$sha'" >&2
  exit 2
}

failed=0

for workflow in "$@"; do
  # Keyed by workflow FILE name, which survives renaming the workflow. Check-run names are
  # deliberately not used: "CI" and "CodeQL" are workflow names, while the check-runs on a SHA are
  # individual job ids, several of which are conditional.
  if ! pairs="$(gh api --paginate \
      "repos/$repo/actions/workflows/$workflow/runs?head_sha=$sha&branch=main&event=push&per_page=100" \
      --jq '.workflow_runs[] | "\(.run_number) \(.id)"' 2>&1)"; then
    # An API error is not an answer. Treating it as "no runs" would turn an outage into a verdict.
    echo "::error::$workflow: could not query runs for $sha: $pairs"
    failed=1
    continue
  fi

  # Fail closed: no run found means unverified, not "probably fine".
  if [[ -z "$pairs" ]]; then
    echo "::error::$workflow: no push run found for $sha on main"
    failed=1
    continue
  fi

  # The LATEST run wins. Filtering by conclusion first would be fail-open: an older successful run
  # would hide a newer failing one for the same SHA.
  run_id="$(printf '%s\n' "$pairs" | sort -nr -k1,1 | head -1 | cut -d' ' -f2)"
  if [[ ! "$run_id" =~ ^[0-9]+$ ]]; then
    echo "::error::$workflow: unexpected run id '$run_id' for $sha"
    failed=1
    continue
  fi

  # Re-read that specific run so the current attempt is what gets judged. run_attempt is only
  # meaningful within one run id and is never compared across runs.
  if ! verdict="$(gh api "repos/$repo/actions/runs/$run_id" --jq '"\(.status) \(.conclusion)"' 2>&1)"; then
    echo "::error::$workflow: could not read run $run_id: $verdict"
    failed=1
    continue
  fi
  read -r status conclusion <<<"$verdict"

  # cancelled, neutral, timed_out and skipped are not a pass.
  if [[ "$status" != completed || "$conclusion" != success ]]; then
    echo "::error::$workflow: run $run_id is status='$status' conclusion='$conclusion'"
    failed=1
    continue
  fi

  echo "ok: $workflow run $run_id passed for $sha"
done

[[ "$failed" -eq 0 ]] || exit 1
echo "All required workflows passed for $sha"
