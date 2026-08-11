"""Composes evidence-set-report.py + evidence-set-attestation.py + the carrier's own provenance
attestation into presentEvidenceSet's full shape -- the last of the 4 lookup types, completing
evidenceSetLookup (2 of the 10 required top-level lookups: monolithEvidenceSet, frontendEvidenceSet).
"""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
read_object_lookup = _oci_read.read_object_lookup

_attest_verify = _load("attest-verify")
verify_attestation = _attest_verify.verify_attestation
AttestationCheckError = _attest_verify.AttestationCheckError

_evidence_set_report = _load("evidence-set-report")
read_evidence_set_report = _evidence_set_report.read_evidence_set_report

_evidence_set_attestation = _load("evidence-set-attestation")
read_evidence_set_attestation = _evidence_set_attestation.read_evidence_set_attestation

_evidence_set_envelope = _load("evidence-set-envelope")
LAYER_MEDIA_TYPES = _evidence_set_envelope.LAYER_MEDIA_TYPES

_envelope = _load("envelope")

__all__ = ["read_evidence_set_lookup"]

_MANIFEST_SIZE_CAP = 64 * 1024
_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")


def read_evidence_set_lookup(registry_ref: str, evidence_set_tag: str, subject_digest: str,
                              source_revision: str, expected_source_repo: str,
                              expected_signer_workflow: str,
                              username: str = None, password: str = None) -> dict:
    # source_revision is the git commit sha1 the signing workflow ran from (gh's own --source-digest
    # flag, sha1-shaped) -- a DIFFERENT fact from carrier_digest/subject_digest (sha256-shaped OCI
    # digests naming what the attestation is ABOUT). An earlier version of this function reused
    # carrier_digest for both, which fails verification.sourceRevision's real ^[0-9a-f]{40}$ pattern
    # for anything but a coincidental 40-hex-char sha256 prefix match. Same conflation class already
    # found and fixed once in evidence-set-attestation.py (roadmap 1.5) -- this caller just hadn't been
    # updated to supply the now-separate parameter.
    queried_ref = f"{registry_ref}:{evidence_set_tag}"
    manifest_result = fetch_manifest(registry_ref, evidence_set_tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not (manifest_result["sizeVerified"] and manifest_result["digestVerified"]
            and manifest_result["raw"] is not None):
        object_lookup = read_object_lookup(registry_ref, evidence_set_tag, username=username,
                                            password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}
        return {"status": "error", "queriedRef": queried_ref, "detail": "manifest fetch unverifiable"}

    import canonical
    try:
        manifest = canonical.strict_loads(manifest_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        return {"status": "error", "queriedRef": queried_ref, "detail": f"manifest did not parse: {exc}"}

    carrier_digest = _envelope.marker_digest(manifest)

    layers = manifest.get("layers", [])
    layer_media_types = [layer.get("mediaType") for layer in layers]
    required_media_types = set(LAYER_MEDIA_TYPES.values())
    layers_valid = (len(layers) == 4 and set(layer_media_types) == required_media_types
                     and len(layer_media_types) == len(set(layer_media_types)))

    subject = manifest.get("subject", {})
    subject_matches = subject.get("digest") == subject_digest

    try:
        carrier_verification_result = verify_attestation(
            f"oci://{registry_ref}:{evidence_set_tag}", expected_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow,
            expected_predicate_type=_envelope.PREDICATE_TYPES["evidenceSet"],
            expected_source_digest=source_revision,
        )
    except AttestationCheckError:
        carrier_verification_result = {
            "attestationVerified": False, "signerRepository": expected_source_repo,
            "signerWorkflow": expected_signer_workflow, "sourceRevision": source_revision,
        }

    verification = {
        "attestationVerified": carrier_verification_result["attestationVerified"],
        "subjectDigest": carrier_digest,
        "signerRepository": carrier_verification_result["signerRepository"],
        "signerWorkflow": carrier_verification_result["signerWorkflow"],
        "sourceRevision": carrier_verification_result["sourceRevision"],
        "predicateType": _envelope.PREDICATE_TYPES["evidenceSet"],
        "policyPassed": carrier_verification_result["attestationVerified"],
    }

    reports = {}
    for kind in _KINDS:
        report_lookup = read_evidence_set_report(registry_ref, evidence_set_tag, kind, subject_digest,
                                                   username=username, password=password)
        report_digest = None
        if report_lookup.get("status") == "present":
            report_digest = report_lookup.get("descriptor", {}).get("digest")
        attestation_lookup = read_evidence_set_attestation(
            registry_ref, evidence_set_tag, kind, subject_digest,
            source_revision=source_revision, expected_source_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow, report_digest=report_digest,
        )
        reports[kind] = {"reportLookup": report_lookup, "attestationLookup": attestation_lookup}

    return {
        "status": "present",
        "queriedRef": queried_ref,
        "carrierDigest": carrier_digest,
        "verification": verification,
        "subjectMatches": subject_matches,
        "layersValid": layers_valid,
        "reports": reports,
    }
