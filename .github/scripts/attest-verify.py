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


def verify_attestation(artifact_ref: str, expected_repo: str, expected_signer_workflow: str,
                        expected_predicate_type: str, expected_source_digest: str) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", expected_signer_workflow,
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

    raise AttestationCheckError(
        f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]}"
    )


def verify_attestation_with_duplicates(artifact_ref: str, expected_repo: str,
                                        expected_signer_workflow: str, expected_predicate_type: str,
                                        expected_source_digest: str, limit: int = 30) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", expected_signer_workflow,
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
        raise AttestationCheckError(
            f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]}"
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
