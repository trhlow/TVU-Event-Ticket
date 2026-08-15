"""Reads one report layer from a real evidence-set carrier into scanReportEvidenceLookup's/
sbomReportEvidenceLookup's shape: fetch the carrier manifest, find the layer by mediaType (never by
position -- design doc section 2's own rule), fetch and verify that layer's blob, validate it against
the real predicate schema, and build normalizedReport -- almost a direct passthrough for the 3 scan
kinds now that roadmap 1.4a/1.4b unified predicate documents with normalizedScanContent, and a
re-derivation from the parsed SPDX document for SBOM (a reader must recompute what it can, not trust a
claimed value).
"""
import importlib.util
import json
import pathlib
import sys

import canonical

_HERE = pathlib.Path(__file__).resolve().parent


class ReportReadError(Exception):
    """The report could not be CHECKED, as distinct from checked and found wanting.

    Every other failure in this module is reported as data (status/schemaValid/...), because a
    registry that says no is an answer. This one is raised instead: an environment that cannot run
    the check at all has produced no answer, and returning False would state a fact about the
    document that nobody established.
    """


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
fetch_blob = _oci_read.fetch_blob
read_object_lookup = _oci_read.read_object_lookup

__all__ = ["read_evidence_set_report"]

_LAYER_MEDIA_TYPES = {
    "sbom": "application/vnd.evts.evidence.sbom.v1+json",
    "vulnerabilityScan": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
    "layerSecretScan": "application/vnd.evts.evidence.layerSecretScan.v1+json",
    "filesystemSecretScan": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
}

_MANIFEST_SIZE_CAP = 64 * 1024
_REPORT_SIZE_CAP = 8 * 1024 * 1024  # design doc 3.3a: 8 MiB report blob cap

_PREDICATE_SCHEMA_FILES = {
    "vulnerabilityScan": "vulnerabilityScan.schema.json",
    "layerSecretScan": "layerSecretScan.schema.json",
    "filesystemSecretScan": "filesystemSecretScan.schema.json",
}


def _build_schema_registry():
    # Same reasoning as _validate_predicate_schema's jsonschema guard: the scan schemas $ref each
    # other by $id, so without `referencing` nothing can be resolved and no check happens at all.
    # An unusable checker is an environment fault, reported as one -- never as an invalid document.
    try:
        import referencing
        import referencing.jsonschema
    except ImportError as exc:
        raise ReportReadError(
            "referencing is not installed, so the predicate schemas' cross-references could not be "
            f"resolved and no schema could be checked at all -- an environment fault: {exc}"
        ) from exc

    contracts_dir = _HERE.parent / "contracts"
    resources = {}
    for path in sorted(contracts_dir.rglob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        schema_id = contents.get("$id")
        if isinstance(schema_id, str) and schema_id:
            resources[schema_id] = referencing.Resource.from_contents(
                contents, default_specification=referencing.jsonschema.DRAFT202012)
    return referencing.Registry().with_resources(resources.items())


def _validate_predicate_schema(kind: str, document: dict) -> bool:
    if kind == "sbom":
        return document.get("spdxVersion") == "SPDX-2.3" and isinstance(document.get("packages"), list)
    # NOT wrapped in `except Exception: return False`, and that is the whole point. It was, and a
    # missing jsonschema on the runner therefore raised ImportError, got swallowed, and was reported
    # as schemaValid=False -- "I could not check" masquerading as "I checked and it is invalid",
    # which is the exact conflation this contract refuses everywhere else ("absence must be observed,
    # never inferred"). It cost a real CI run: publish-finalize does not pip install jsonschema the
    # way lint does, so every scan report on a real run came back invalid while the very same
    # documents validated cleanly on a workstation that happened to have the library.
    #
    # An unusable checker is an environment fault and must be loud. Only a document that really was
    # checked and really failed returns False.
    try:
        import jsonschema
    except ImportError as exc:
        raise ReportReadError(
            f"jsonschema is not installed, so {kind}'s predicate schema could not be checked at all "
            f"-- this is an environment fault, not an invalid document, and must not be reported as "
            f"one: {exc}"
        ) from exc

    schema_path = _HERE.parent / "contracts" / "predicates" / _PREDICATE_SCHEMA_FILES[kind]
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    # The 3 scan predicate schemas $ref into observation.schema.json (digest/scanPolicy/scanCounts) via
    # relative $ids, so a plain, registry-less validator cannot resolve them and would report every real
    # document as invalid. Build the same $id-keyed registry the collector tests already build, so this
    # is a real, fully-resolved schema check, not a narrower approximation.
    registry = _build_schema_registry()
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema, registry=registry)
    errors = sorted(validator.iter_errors(document), key=str)
    if errors:
        # Printed, not discarded: a bare False sends the next person to guess which of a hundred
        # fields was wrong, which is how the ImportError above hid for a whole run.
        detail = "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5])
        print(f"schemaValid=False for {kind}: {detail}", file=sys.stderr)
        return False
    return True


def read_evidence_set_report(registry_ref: str, evidence_set_tag: str, kind: str, subject_digest: str,
                              username: str = None, password: str = None) -> dict:
    queried_ref = f"{registry_ref}:{evidence_set_tag}#{kind}"
    manifest_result = fetch_manifest(registry_ref, evidence_set_tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not (manifest_result["sizeVerified"] and manifest_result["digestVerified"]
            and manifest_result["raw"] is not None):
        object_lookup = read_object_lookup(registry_ref, evidence_set_tag, username=username,
                                            password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}
        return {"status": "error", "queriedRef": queried_ref, "detail": "manifest fetch unverifiable"}

    try:
        manifest = canonical.strict_loads(manifest_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        return {"status": "error", "queriedRef": queried_ref, "detail": f"manifest did not parse: {exc}"}

    target_media_type = _LAYER_MEDIA_TYPES[kind]
    layer_descriptor = next(
        (layer for layer in manifest.get("layers", []) if layer.get("mediaType") == target_media_type),
        None,
    )
    if layer_descriptor is None:
        return {"status": "error", "queriedRef": queried_ref,
                "detail": f"no layer with mediaType {target_media_type!r} in {evidence_set_tag}"}

    blob_result = fetch_blob(registry_ref, layer_descriptor["digest"], size_cap=_REPORT_SIZE_CAP,
                              username=username, password=password)

    descriptor = {"mediaType": target_media_type, "digest": layer_descriptor["digest"],
                  "size": layer_descriptor["size"]}

    if not (blob_result["sizeVerified"] and blob_result["digestVerified"] and blob_result["raw"] is not None):
        return {
            "status": "present", "queriedRef": queried_ref, "descriptor": descriptor,
            "digestVerified": blob_result["digestVerified"], "sizeVerified": blob_result["sizeVerified"],
            "schemaValid": False, "normalizedReport": {},
        }

    try:
        document = canonical.strict_loads(blob_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {
            "status": "present", "queriedRef": queried_ref, "descriptor": descriptor,
            "digestVerified": True, "sizeVerified": True, "schemaValid": False, "normalizedReport": {},
        }

    schema_valid = _validate_predicate_schema(kind, document)
    normalized_report = _build_normalized_report(kind, document, subject_digest) if schema_valid else {}

    return {
        "status": "present",
        "queriedRef": queried_ref,
        "descriptor": descriptor,
        "digestVerified": True,
        "sizeVerified": True,
        "schemaValid": schema_valid,
        "normalizedReport": normalized_report,
    }


def _build_normalized_report(kind: str, document: dict, subject_digest: str) -> dict:
    if kind == "sbom":
        packages = document.get("packages", [])
        canonical_payload = canonical.canonical_bytes(document)
        import hashlib
        return {
            "spdxVersion": document.get("spdxVersion", ""),
            "documentValidated": document.get("spdxVersion") == "SPDX-2.3",
            "subjectDigest": subject_digest,
            "packageCount": len(packages),
            "canonicalDigest": "sha256:" + hashlib.sha256(canonical_payload).hexdigest(),
            "canonicalSize": len(canonical_payload),
        }
    # The 3 scan kinds: the parsed predicate document is normalizedScanContent-shaped after roadmap
    # 1.4a/1.4b for the fields normalizedScanContent actually declares -- but normalizedScanContent is
    # additionalProperties:false and does NOT include the predicate's own scanner-identity/provenance
    # fields (timestamp on all 3; vulnerabilityDb on vulnerabilityScan; ruleset on the 2 secret-scan
    # kinds), so this must project onto exactly normalizedScanContent's 8 properties, not pass the whole
    # document through. `target` is the one field that also gets reshaped: the predicate schema keeps it
    # as a plain string while normalizedScanContent needs the {imageDigest} object form.
    _NORMALIZED_SCAN_FIELDS = ("scanner", "reportDigest", "policy", "counts", "findings", "truncated",
                               "declaredOutcome")
    normalized = {field: document[field] for field in _NORMALIZED_SCAN_FIELDS if field in document}
    normalized["target"] = {"imageDigest": subject_digest}
    return normalized
