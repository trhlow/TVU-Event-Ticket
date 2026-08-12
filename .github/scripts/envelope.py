"""The OCI manifest a marker travels in, built from the payload it carries.

Every choice OCI leaves optional is pinned here, because an unpinned choice means several valid
envelopes carry different digests and one SHA no longer reproduces one artifact. In 5a these values
are only used to *build* envelopes -- the decision does not yet judge the shape of a raw manifest.
5b adds release-envelope.schema.json and the decision's constants, and manifest-agreement.test.sh
then holds all three to this module.
"""
import hashlib

from canonical import canonical_bytes

__all__ = ["envelope_for", "marker_digest",
           "MANIFEST_MEDIA_TYPE", "ARTIFACT_TYPE",
           "EMPTY_CONFIG_MEDIA_TYPE", "EMPTY_CONFIG_DIGEST",
           "EMPTY_CONFIG_SIZE", "EMPTY_CONFIG_DATA", "PREDICATE_TYPES"]

MANIFEST_MEDIA_TYPE = "application/vnd.oci.image.manifest.v1+json"
ARTIFACT_TYPE = "application/vnd.tvu.release-manifest.v1+json"
EMPTY_CONFIG_MEDIA_TYPE = "application/vnd.oci.empty.v1+json"
EMPTY_CONFIG_DIGEST = "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
EMPTY_CONFIG_SIZE = 2
EMPTY_CONFIG_DATA = "e30="
PREDICATE_TYPES = {
    "markerProvenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
    "evidenceSet": "https://evts.id.vn/attestations/evidenceSet/v1",
}


def envelope_for(content):
    """The canonical envelope carrying `content`. No annotations key, no subject key, one layer."""
    payload = canonical_bytes(content)
    return {
        "schemaVersion": 2,
        "mediaType": MANIFEST_MEDIA_TYPE,
        "artifactType": ARTIFACT_TYPE,
        "config": {
            "mediaType": EMPTY_CONFIG_MEDIA_TYPE,
            "digest": EMPTY_CONFIG_DIGEST,
            "size": EMPTY_CONFIG_SIZE,
            "data": EMPTY_CONFIG_DATA,
        },
        "layers": [{
            "mediaType": ARTIFACT_TYPE,
            "digest": "sha256:" + hashlib.sha256(payload).hexdigest(),
            "size": len(payload),
        }],
    }


def marker_digest(raw):
    """The digest of a manifest as the registry would address it."""
    return "sha256:" + hashlib.sha256(canonical_bytes(raw)).hexdigest()
