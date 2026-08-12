# .github/scripts/evidence-set-envelope.py
"""Builds and pushes a real evidence-set OCI manifest (release-evidence-set.schema.json): four evidence
reports (SBOM, vulnerabilityScan, layerSecretScan, filesystemSecretScan) as layers, bound to the image
they describe via `subject`. No annotations anywhere -- same discipline as envelope.py's own
envelope_for, and the same reason oci-push.py exists at all (design doc section 7a: oras push cannot be
trusted not to add them).
"""
import importlib.util
import pathlib

import canonical

_HERE = pathlib.Path(__file__).resolve().parent

_envelope_spec = importlib.util.spec_from_file_location("envelope", _HERE / "envelope.py")
_envelope_module = importlib.util.module_from_spec(_envelope_spec)
_envelope_spec.loader.exec_module(_envelope_module)

_push_spec = importlib.util.spec_from_file_location("oci_push", _HERE / "oci-push.py")
_push_module = importlib.util.module_from_spec(_push_spec)
_push_spec.loader.exec_module(_push_module)
push_blob = _push_module.push_blob
push_manifest = _push_module.push_manifest
PublishError = _push_module.PublishError

__all__ = ["evidence_set_envelope_for", "publish_evidence_set", "PublishError"]

ARTIFACT_TYPE = "application/vnd.evts.evidence-set.v1+json"

LAYER_MEDIA_TYPES = {
    "sbom": "application/vnd.evts.evidence.sbom.v1+json",
    "vulnerabilityScan": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
    "layerSecretScan": "application/vnd.evts.evidence.layerSecretScan.v1+json",
    "filesystemSecretScan": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
}

# Fixed order for determinism -- a schema's `contains`/minContains/maxContains does not care about
# layer order, but a stable order means two runs over the same content produce byte-identical
# manifests, which matters for the same reason collect-flyway-inventory.py's determinism test does.
_KIND_ORDER = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")


def evidence_set_envelope_for(layer_descriptors: dict, subject_digest: str, subject_size: int) -> dict:
    layers = []
    for kind in _KIND_ORDER:
        descriptor = layer_descriptors[kind]
        layers.append({
            "mediaType": LAYER_MEDIA_TYPES[kind],
            "digest": descriptor["digest"],
            "size": descriptor["size"],
        })
    return {
        "schemaVersion": 2,
        "mediaType": _envelope_module.MANIFEST_MEDIA_TYPE,
        "artifactType": ARTIFACT_TYPE,
        "config": {
            "mediaType": _envelope_module.EMPTY_CONFIG_MEDIA_TYPE,
            "digest": _envelope_module.EMPTY_CONFIG_DIGEST,
            "size": _envelope_module.EMPTY_CONFIG_SIZE,
            "data": _envelope_module.EMPTY_CONFIG_DATA,
        },
        "layers": layers,
        "subject": {
            "mediaType": _envelope_module.MANIFEST_MEDIA_TYPE,
            "digest": subject_digest,
            "size": subject_size,
        },
    }


def publish_evidence_set(registry_ref: str, tag: str, evidence_documents: dict,
                          subject_digest: str, subject_size: int,
                          username: str = None, password: str = None) -> str:
    layer_descriptors = {}
    for kind in _KIND_ORDER:
        content = canonical.canonical_bytes(evidence_documents[kind])
        digest = push_blob(registry_ref, content, username=username, password=password)
        layer_descriptors[kind] = {"digest": digest, "size": len(content)}

    push_blob(registry_ref, b"{}", username=username, password=password)  # shared empty config blob

    manifest = evidence_set_envelope_for(layer_descriptors, subject_digest, subject_size)
    return push_manifest(registry_ref, manifest, manifest["mediaType"], tag,
                          username=username, password=password)
