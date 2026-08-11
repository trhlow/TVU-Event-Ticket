# .github/scripts/marker-envelope.py
"""Pushes a real marker (prepared or final -- same shape, different tag/completeness) using
envelope.py's already-correct envelope_for plus oci-push.py. Adds no new manifest-shape logic --
envelope_for already produces the right shape (no annotations, no subject, one layer); this module only
adds the I/O to actually write it somewhere.
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

__all__ = ["publish_marker", "PublishError"]


def publish_marker(registry_ref: str, tag: str, content: dict,
                    username: str = None, password: str = None) -> str:
    payload = canonical.canonical_bytes(content)
    push_blob(registry_ref, payload, username=username, password=password)
    push_blob(registry_ref, b"{}", username=username, password=password)  # shared empty config blob

    manifest = _envelope_module.envelope_for(content)
    return push_manifest(registry_ref, manifest, manifest["mediaType"], tag,
                          username=username, password=password)
