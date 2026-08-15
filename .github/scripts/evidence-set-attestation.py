# .github/scripts/evidence-set-attestation.py
"""Reads a report's own signed attestation (never the marker's -- design doc section 5: "report và
attestation không được trộn") into scanAttestationEvidenceLookup's/sbomAttestationEvidenceLookup's
shape."""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_attest_verify = _load("attest-verify")
verify_attestation_with_duplicates = _attest_verify.verify_attestation_with_duplicates
AttestationCheckError = _attest_verify.AttestationCheckError

_evidence_set_report = _load("evidence-set-report")
_build_normalized_report = _evidence_set_report._build_normalized_report

_envelope = _load("envelope")

__all__ = ["read_evidence_set_attestation"]

_PREDICATE_TYPE_KEYS = {
    "sbom": "sbom", "vulnerabilityScan": "vulnerabilityScan",
    "layerSecretScan": "layerSecretScan", "filesystemSecretScan": "filesystemSecretScan",
}


def read_evidence_set_attestation(registry_ref: str, evidence_set_tag: str, kind: str,
                                   subject_digest: str, source_revision: str,
                                   expected_source_repo: str, expected_signer_workflow: str,
                                   report_digest: str = None) -> dict:
    # subject_digest (what the attestation is ABOUT -- the report's own digest) and source_revision
    # (which commit the signing workflow ran from, gh's own --source-digest flag) are two different
    # facts -- an earlier draft of this function conflated them into one parameter, which would have
    # asked gh to verify the wrong thing entirely. Kept as two explicit parameters so a caller cannot
    # make that mistake by accident.
    predicate_type = _envelope.PREDICATE_TYPES[_PREDICATE_TYPE_KEYS[kind]]
    artifact_ref = f"oci://{registry_ref}:{evidence_set_tag}"

    try:
        result = verify_attestation_with_duplicates(
            artifact_ref, expected_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow,
            expected_predicate_type=predicate_type, expected_source_digest=source_revision,
        )
    except AttestationCheckError as exc:
        return {"status": "error", "queriedRef": artifact_ref, "detail": str(exc)}

    if not result["attestationVerified"]:
        # scanAttestationAbsent/sbomAttestationAbsent require `queried`, the FULL selection tuple --
        # not a queriedRef string. SBOM's tuple has no reportDigest (SPDX carries none, spec section 4);
        # the 3 scan kinds require it.
        queried = {
            "repository": expected_source_repo,
            "workflow": expected_signer_workflow,
            "sourceRevision": source_revision,
            "subjectDigest": subject_digest,
            "predicateType": predicate_type,
        }
        if kind != "sbom":
            queried["reportDigest"] = report_digest or ("sha256:" + "0" * 64)
        return {
            "status": "absent", "reason": "no_matching_attestation",
            "paginationComplete": result["paginationComplete"], "queried": queried,
        }

    normalized_predicate = (_build_normalized_report(kind, result["predicateBody"], subject_digest)
                             if result["predicateBody"] else {})

    return {
        "status": "present",
        "queriedRef": artifact_ref,
        "subjectDigest": subject_digest,
        "predicateType": predicate_type,
        "signerRepository": result["signerRepository"],
        "signerWorkflow": result["signerWorkflow"],
        "sourceRevision": result["sourceRevision"],
        "attestationVerified": True,
        "normalizedPredicate": normalized_predicate,
        "paginationComplete": result["paginationComplete"],
        "duplicates": result["duplicateStatements"],
    }
