"""The five predicate URIs, and the sweep that brings fixtures to them.

Two corrections live here, and they are different in kind. Three of the URIs merely moved domain:
tvu.id.vn was never owned by this team, and a namespace nobody owns is a namespace anyone may take.
The fourth is not a rename at all -- SBOM attestations carry the SPDX document type, not a URI this
project invents, because actions/attest-sbom emits that value and a constant the pipeline made up
would never match what a real attestation says.

Sole source of these five values until 5b moves them into release-envelope.schema.json's `constants`
$defs. When it does, this module cites that file rather than restating it.
"""

__all__ = ["PREDICATE_URIS", "REPLACEMENTS"]

PREDICATE_URIS = {
    "provenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
}

# Keyed by the exact string to be replaced, so a sweep cannot half-match and cannot rewrite a URI
# that was already correct. `provenance` is absent deliberately: it was already right.
REPLACEMENTS = {
    "https://tvu.id.vn/attestations/sbom/v1": PREDICATE_URIS["sbom"],
    "https://tvu.id.vn/attestations/vulnerabilityScan/v1":
        PREDICATE_URIS["vulnerabilityScan"],
    "https://tvu.id.vn/attestations/layerSecretScan/v1":
        PREDICATE_URIS["layerSecretScan"],
    "https://tvu.id.vn/attestations/filesystemSecretScan/v1":
        PREDICATE_URIS["filesystemSecretScan"],
}
