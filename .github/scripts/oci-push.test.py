# .github/scripts/oci-push.test.py
"""Exercises push_blob/push_manifest against a real throwaway registry:2 -- not mocked, because the
entire point is proving the exact bytes sent are the exact bytes a real registry stores and reports
back, which a mock cannot do."""
import hashlib
import importlib.util
import json
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent

# The throwaway registry, with the setup guards all ten of these files used to skip.
sys.path.insert(0, str(HERE))
import registry_fixture  # noqa: E402

_spec = importlib.util.spec_from_file_location("oci_push", HERE / "oci-push.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
push_blob = _module.push_blob
push_manifest = _module.push_manifest
PublishError = _module.PublishError

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


container_id = None
try:
    container_id, host_port = registry_fixture.start_local_registry()

    registry_ref = f"localhost:{host_port}/oci-push-test"

    content = b'{"hello": "oci-push"}'
    expected_digest = "sha256:" + hashlib.sha256(content).hexdigest()

    digest = push_blob(registry_ref, content)
    report("push_blob returns the correct digest", digest == expected_digest,
           f"got {digest!r}, expected {expected_digest!r}")

    digest_again = push_blob(registry_ref, content)
    report("pushing the same blob twice is idempotent (same digest, no error)",
           digest_again == expected_digest, f"got {digest_again!r}")

    manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "artifactType": "application/vnd.test.oci-push-check.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.empty.v1+json",
            "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
            "size": 2,
            "data": "e30=",
        },
        "layers": [{
            "mediaType": "application/vnd.test.oci-push-check.layer.v1+json",
            "digest": digest,
            "size": len(content),
        }],
    }
    push_blob(registry_ref, b"{}")  # the empty config blob, must exist before the manifest references it

    sys.path.insert(0, str(HERE))
    import canonical
    manifest_bytes = canonical.canonical_bytes(manifest)
    expected_manifest_digest = "sha256:" + hashlib.sha256(manifest_bytes).hexdigest()

    manifest_digest = push_manifest(registry_ref, manifest, manifest["mediaType"], "check")
    report("push_manifest returns the correct digest",
           manifest_digest == expected_manifest_digest,
           f"got {manifest_digest!r}, expected {expected_manifest_digest!r}")

    # Read it back with a plain HTTP GET (no oras/crane involved) and confirm the registry stored the
    # EXACT canonical bytes -- not a re-serialized copy that happens to be JSON-equal but byte-different.
    req = urllib.request.Request(
        f"http://localhost:{host_port}/v2/oci-push-test/manifests/check",
        headers={"Accept": manifest["mediaType"]},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        stored_bytes = resp.read()
    report("the registry stored the exact canonical bytes, not a re-serialized copy",
           stored_bytes == manifest_bytes,
           f"stored {len(stored_bytes)} bytes, expected {len(manifest_bytes)} bytes")

    report("the stored manifest carries no annotations key anywhere (unlike oras push's default)",
           "annotations" not in json.loads(stored_bytes)
           and all("annotations" not in layer for layer in json.loads(stored_bytes).get("layers", [])),
           f"stored manifest: {json.loads(stored_bytes)}")

    # Negative case: pushing to an address nothing is listening on must raise PublishError, not hang
    # or crash with a bare socket traceback a caller wouldn't know to catch.
    try:
        push_blob("localhost:1/nothing-here", b"irrelevant")
        report("pushing to an unreachable registry raises PublishError", False, "no exception was raised")
    except PublishError:
        report("pushing to an unreachable registry raises PublishError", True)
    except Exception as exc:  # noqa: BLE001
        report("pushing to an unreachable registry raises PublishError", False,
               f"raised {type(exc).__name__} instead")
finally:
    registry_fixture.stop_local_registry(container_id)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
