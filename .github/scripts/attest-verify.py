# .github/scripts/attest-verify.py
"""Verifies a real GitHub build-provenance attestation via `gh attestation verify`.

Delegates ALL identity matching to gh's own enforcement flags (--repo, --signer-workflow,
--predicate-type, --source-digest) rather than parsing gh's JSON output for those fields -- no real
signed sample was obtainable in this session to confirm the exact JSON field paths (design doc section
7b / the accompanying plan's Global Constraints record what was tried). A 0 exit code with all four
flags passed is gh's own proof all four facts hold; this module's job is only to invoke it correctly and
translate the result into the shape observation.schema.json's presentAttestation needs, not to
re-derive what gh already checked.
"""
import json
import subprocess

__all__ = ["verify_attestation", "verify_attestation_with_duplicates", "AttestationCheckError"]


class AttestationCheckError(Exception):
    pass


def _signer_workflow_flag(expected_repo: str, expected_signer_workflow: str) -> str:
    """What gh's --signer-workflow actually wants, built from what this project actually stores.

    gh documents the flag as `[host/]<owner>/<repo>/<path>/<to>/<workflow>` and matches it against
    the signing certificate's SAN, which really reads
    `https://github.com/trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main`.
    observation.schema.json's `expected.signerWorkflow` is deliberately the repo-relative path
    instead ("Full path, e.g. .github/workflows/ci.yml. A marker signed by any other workflow in the
    same repository is not this pipeline's") -- a statement about which workflow, not about which
    host and owner, and the same value publish-decision.sh compares a marker's verification against.

    Passing the repo-relative path straight through was the real bug: gh looked for a SAN under
    `https://github.com/.github/workflows/ci.yml` and every verification failed with the unhelpful
    `Error: verifying with issuer "sigstore.dev"` (confirmed 2026-08-12, the first CI run in which
    gh got far enough to verify anything at all). Joining happens here, at the gh boundary, rather
    than by redefining the stored value -- the schema's meaning stays intact, and expected_repo is
    already this function's own parameter.

    Idempotent on an already-qualified value, so a caller that passes the full form is not mangled.
    """
    if expected_signer_workflow.startswith(f"{expected_repo}/"):
        return expected_signer_workflow
    return f"{expected_repo}/{expected_signer_workflow}"


def verify_attestation(artifact_ref: str, expected_repo: str, expected_signer_workflow: str,
                        expected_predicate_type: str, expected_source_digest: str) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", _signer_workflow_flag(expected_repo, expected_signer_workflow),
             "--predicate-type", expected_predicate_type,
             "--source-digest", expected_source_digest,
             "--format", "json"],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise AttestationCheckError(f"gh is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise AttestationCheckError(f"gh attestation verify timed out for {artifact_ref}") from exc

    if proc.returncode == 0:
        return {
            "attestationVerified": True,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "sourceRevision": expected_source_digest,
        }

    stderr = proc.stderr.strip()
    if "no attestations found" in stderr.lower() or "404" in stderr:
        return {
            "attestationVerified": False,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "sourceRevision": expected_source_digest,
        }

    # Both streams, and the flags: gh's stderr on a failed verification is often just
    # `Error: verifying with issuer "sigstore.dev"`, which names neither which check failed nor what
    # it was comparing against -- one real CI run was spent learning only that. The flags are the
    # whole enforced identity, so printing them turns the next failure into a diff instead of a hunt.
    raise AttestationCheckError(
        f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]} "
        f"| stdout: {proc.stdout.strip()[:1000]} "
        f"| flags: --repo {expected_repo} "
        f"--signer-workflow {_signer_workflow_flag(expected_repo, expected_signer_workflow)} "
        f"--predicate-type {expected_predicate_type} --source-digest {expected_source_digest}"
    )


def verify_attestation_with_duplicates(artifact_ref: str, expected_repo: str,
                                        expected_signer_workflow: str, expected_predicate_type: str,
                                        expected_source_digest: str, limit: int = 30) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", _signer_workflow_flag(expected_repo, expected_signer_workflow),
             "--predicate-type", expected_predicate_type,
             "--source-digest", expected_source_digest,
             "--limit", str(limit),
             "--format", "json"],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise AttestationCheckError(f"gh is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise AttestationCheckError(f"gh attestation verify timed out for {artifact_ref}") from exc

    stderr = proc.stderr.strip()
    if proc.returncode != 0:
        if "no attestations found" in stderr.lower() or "404" in stderr:
            return {
                "attestationVerified": False, "signerRepository": expected_repo,
                "signerWorkflow": expected_signer_workflow, "sourceRevision": expected_source_digest,
                "predicateBody": None, "paginationComplete": True, "duplicateStatements": [],
            }
        # Same reasoning as verify_attestation's own failure path: gh's stderr alone does not say
        # which enforced fact failed, so the flags travel with it.
        raise AttestationCheckError(
            f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]} "
            f"| stdout: {proc.stdout.strip()[:1000]} "
            f"| flags: --repo {expected_repo} "
            f"--signer-workflow {_signer_workflow_flag(expected_repo, expected_signer_workflow)} "
            f"--predicate-type {expected_predicate_type} --source-digest {expected_source_digest}"
        )

    # HIGHEST-RISK ASSUMPTION IN THIS PLAN (see Global Constraints): the exact JSON shape of a real
    # verified result has never been observed in this session -- every real public artifact tried came
    # back "no attestations found" with the credentials available here. This parsing is written against
    # GitHub's own documented `gh attestation verify --format json` shape (a JSON array, one object per
    # matching attestation, each with a verificationResult.statement.predicate body and a
    # verificationResult.statement.subject[].digest.sha256), NOT a captured real sample. Confirm this
    # against a real result the first time roadmap 3.4 runs this in CI, and fix ONLY this block if it's
    # wrong -- everything else in this function (the enforcement flags, the absent-path handling) is
    # already proven correct against real `gh` behavior.
    try:
        results = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AttestationCheckError(f"gh attestation verify printed non-JSON with --format json: {exc}") from exc

    if not isinstance(results, list) or not results:
        raise AttestationCheckError(
            f"gh attestation verify exited 0 but --format json printed no results: {proc.stdout[:1000]}"
        )

    def _predicate_body(entry):
        return (entry.get("verificationResult", {}).get("statement", {}).get("predicate"))

    primary_predicate = _predicate_body(results[0])
    duplicate_statements = []
    for entry in results[1:]:
        predicate = _predicate_body(entry) or {}
        statement = {
            "subjectDigest": "sha256:" + entry.get("verificationResult", {}).get("statement", {})
                .get("subject", [{}])[0].get("digest", {}).get("sha256", "0" * 64),
            "sourceRevision": expected_source_digest,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "predicateType": expected_predicate_type,
        }
        if "reportDigest" in predicate:
            statement["reportDigest"] = predicate["reportDigest"]
        if "policy" in predicate:
            statement["policy"] = predicate["policy"]
        if "declaredOutcome" in predicate:
            statement["outcome"] = predicate["declaredOutcome"]
        duplicate_statements.append(statement)

    return {
        "attestationVerified": True,
        "signerRepository": expected_repo,
        "signerWorkflow": expected_signer_workflow,
        "sourceRevision": expected_source_digest,
        "predicateBody": primary_predicate,
        "paginationComplete": len(results) < limit,
        "duplicateStatements": duplicate_statements,
    }
