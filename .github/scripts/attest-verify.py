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
import subprocess

__all__ = ["verify_attestation", "AttestationCheckError"]


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
