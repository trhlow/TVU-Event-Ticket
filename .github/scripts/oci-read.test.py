"""Exercises fetch_manifest/read_object_lookup against real throwaway registry state -- reading back
real content oci-push.py and marker-envelope.py already proved they can write, not a fixture invented
for this test alone."""
import hashlib
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent

# The throwaway registry, with the setup guards all ten of these files used to skip.
sys.path.insert(0, str(HERE))
import registry_fixture  # noqa: E402


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


oci_read = _load("oci-read")
fetch_manifest = oci_read.fetch_manifest
read_object_lookup = oci_read.read_object_lookup
ReadError = oci_read.ReadError

oci_push = _load("oci-push")
canonical_mod = _load("canonical")

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

    registry_ref = f"localhost:{host_port}/oci-read-test"

    manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "artifactType": "application/vnd.test.oci-read-check.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.empty.v1+json",
            "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
            "size": 2,
            "data": "e30=",
        },
        "layers": [],
    }
    oci_push.push_blob(registry_ref, b"{}")
    pushed_digest = oci_push.push_manifest(registry_ref, manifest, manifest["mediaType"], "readable")

    fetch_result = fetch_manifest(registry_ref, "readable", size_cap=65536)
    report("fetch_manifest verifies size and digest for a real pushed manifest",
           fetch_result["sizeVerified"] is True and fetch_result["digestVerified"] is True,
           f"fetch_result={fetch_result!r}")
    report("fetch_manifest returns the exact canonical bytes as raw",
           fetch_result["raw"] == canonical_mod.canonical_bytes(manifest),
           f"raw is {fetch_result['raw']!r}")

    tiny_cap_result = fetch_manifest(registry_ref, "readable", size_cap=1)
    report("a manifest over the size cap is refused before download (sizeVerified False, raw is None)",
           tiny_cap_result["sizeVerified"] is False and tiny_cap_result["raw"] is None,
           f"tiny_cap_result={tiny_cap_result!r}")

    object_lookup = read_object_lookup(registry_ref, "readable")
    report("read_object_lookup reports present with the real digest for an existing tag",
           object_lookup.get("status") == "present" and object_lookup.get("digest") == pushed_digest,
           f"object_lookup={object_lookup!r}")

    absent_lookup = read_object_lookup(registry_ref, "this-tag-was-never-pushed")
    report("read_object_lookup reports absent with observedCode 404 for a real missing tag",
           absent_lookup.get("status") == "absent" and absent_lookup.get("observedCode") == 404,
           f"absent_lookup={absent_lookup!r}")

    try:
        read_object_lookup("localhost:1/nothing-here", "irrelevant")
        report("an unreachable registry raises ReadError from read_object_lookup", False,
               "no exception was raised")
    except ReadError:
        report("an unreachable registry raises ReadError from read_object_lookup", True)
    except Exception as exc:  # noqa: BLE001
        report("an unreachable registry raises ReadError from read_object_lookup", False,
               f"raised {type(exc).__name__} instead")

    blob_content = b'{"marker-lookup-plan": "fetch_blob check"}'
    blob_digest = oci_push.push_blob(registry_ref, blob_content)

    fetch_blob = oci_read.fetch_blob

    blob_result = fetch_blob(registry_ref, blob_digest, size_cap=65536)
    report("fetch_blob verifies size and digest for a real pushed blob",
           blob_result["sizeVerified"] is True and blob_result["digestVerified"] is True,
           f"blob_result={blob_result!r}")
    report("fetch_blob returns the exact bytes pushed",
           blob_result["raw"] == blob_content,
           f"raw is {blob_result['raw']!r}")

    tiny_blob_result = fetch_blob(registry_ref, blob_digest, size_cap=1)
    report("a blob over the size cap is refused before download",
           tiny_blob_result["sizeVerified"] is False and tiny_blob_result["raw"] is None,
           f"tiny_blob_result={tiny_blob_result!r}")

    wrong_digest = "sha256:" + "0" * 64
    missing_blob_result = fetch_blob(registry_ref, wrong_digest, size_cap=65536)
    report("fetching a nonexistent blob digest returns sizeVerified False, not an exception",
           missing_blob_result["sizeVerified"] is False and missing_blob_result["raw"] is None,
           f"missing_blob_result={missing_blob_result!r}")
finally:
    registry_fixture.stop_local_registry(container_id)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
