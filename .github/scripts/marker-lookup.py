# .github/scripts/marker-lookup.py
"""Reads a marker (finalMarker or preparedMarker -- same read path, different tag) into
observation.schema.json's markerLookup shape: fetch the manifest with the mandated size-before-hash
order (oci-read.py), verify its attestation (attest-verify.py), and -- only when the envelope's three
booleans are all true and it has exactly one layer, the schema's own conditional -- fetch and parse the
payload as content.
"""
import importlib.util
import json
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
fetch_blob = _oci_read.fetch_blob

_attest_verify = _load("attest-verify")
verify_attestation = _attest_verify.verify_attestation

_envelope = _load("envelope")
_canonical = _load("canonical")

__all__ = ["read_marker_lookup"]

_MANIFEST_SIZE_CAP = 64 * 1024
_PAYLOAD_SIZE_CAP = 256 * 1024


def read_marker_lookup(registry_ref: str, tag: str, expected_source_repo: str,
                        expected_signer_workflow: str, source_revision: str,
                        username: str = None, password: str = None) -> dict:
    queried_ref = f"{registry_ref}:{tag}"
    manifest_result = fetch_manifest(registry_ref, tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not manifest_result["sizeVerified"] and manifest_result["raw"] is None \
            and manifest_result["reportedDigest"] is None:
        # fetch_manifest cannot distinguish "not found" from "refused for other reasons" on its own
        # (it is a pure fetch/verify primitive, not a presence oracle) -- read_object_lookup already
        # solves that distinction with its own HEAD-based absence check, so reuse it here rather than
        # duplicating the 404-vs-error logic a second time.
        object_lookup = _load("oci-read").read_object_lookup(registry_ref, tag,
                                                                username=username, password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}

    ociEnvelope = {
        "digestVerified": manifest_result["digestVerified"],
        "sizeVerified": manifest_result["sizeVerified"],
        "parsed": False,
    }

    raw_manifest = None
    if manifest_result["sizeVerified"] and manifest_result["digestVerified"]:
        try:
            # strict_loads takes str, not bytes (its BOM guard is `text.startswith("﻿")`, a str
            # literal, which raises TypeError -- not ValueError -- if handed bytes directly). Decode
            # first; a decode failure on untrusted bytes is exactly as "not parsed" as a JSON syntax
            # error, so it is folded into the same except.
            raw_manifest = _canonical.strict_loads(manifest_result["raw"].decode("utf-8"))
            ociEnvelope["parsed"] = True
            ociEnvelope["raw"] = raw_manifest
        except (ValueError, UnicodeDecodeError):
            ociEnvelope["parsed"] = False

    marker_digest = None
    content = None
    if ociEnvelope.get("parsed") and ociEnvelope["digestVerified"] and ociEnvelope["sizeVerified"]:
        marker_digest = _envelope.marker_digest(raw_manifest)
        layers = raw_manifest.get("layers", [])
        if len(layers) == 1:
            blob_result = fetch_blob(registry_ref, layers[0]["digest"], size_cap=_PAYLOAD_SIZE_CAP,
                                      username=username, password=password)
            if blob_result["sizeVerified"] and blob_result["digestVerified"]:
                try:
                    content = _canonical.strict_loads(blob_result["raw"].decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    content = None

    # expected_source_digest is gh's --source-digest flag: the git commit sha1 the signing workflow
    # ran from, NOT the marker's own sha256 digest. subjectDigest (what the attestation is about) and
    # sourceRevision (which commit signed it) are two different facts -- this exact conflation has
    # already been found and fixed in evidence-set-attestation.py and evidence-set-lookup.py.
    verification_result = verify_attestation(
        f"oci://{registry_ref}:{tag}",
        expected_repo=expected_source_repo,
        expected_signer_workflow=expected_signer_workflow,
        expected_predicate_type=_envelope.PREDICATE_TYPES["markerProvenance"],
        expected_source_digest=source_revision,
    )
    verification = {
        "attestationVerified": verification_result["attestationVerified"],
        "subjectDigest": marker_digest or ("sha256:" + "0" * 64),
        "signerRepository": verification_result["signerRepository"],
        "signerWorkflow": verification_result["signerWorkflow"],
        "sourceRevision": verification_result["sourceRevision"],
        "predicateType": _envelope.PREDICATE_TYPES["markerProvenance"],
        # No separate policy engine exists in this pipeline -- gh attestation verify's own identity/
        # signature/predicate-type enforcement is the only policy there is right now. If a real policy
        # layer (e.g. OPA/Rego over the predicate body) is added later, this line is what changes.
        "policyPassed": verification_result["attestationVerified"],
    }

    result = {
        "status": "present",
        "queriedRef": queried_ref,
        "markerDigest": marker_digest or ("sha256:" + "0" * 64),
        "verification": verification,
        "ociEnvelope": ociEnvelope,
    }
    if content is not None:
        result["content"] = content
    return result
