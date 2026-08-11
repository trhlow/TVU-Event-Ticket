"""Exercises fetch_manifest/read_object_lookup against real throwaway registry state -- reading back
real content oci-push.py and marker-envelope.py already proved they can write, not a fixture invented
for this test alone."""
import hashlib
import importlib.util
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent


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


def _wait_ready(port, timeout_seconds=30.0):
    deadline = time.monotonic() + timeout_seconds
    last = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, OSError) as exc:
            last = exc
        time.sleep(0.5)
    raise RuntimeError(f"registry on {port} never became ready: {last}")


container_id = None
try:
    run_proc = subprocess.run(
        ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", "registry:2"],
        capture_output=True, text=True, timeout=60, check=False,
    )
    container_id = run_proc.stdout.strip()
    port_proc = subprocess.run(["docker", "port", container_id, "5000/tcp"],
                                capture_output=True, text=True, timeout=30, check=False)
    host_port = port_proc.stdout.strip().splitlines()[0].rsplit(":", 1)[1]
    _wait_ready(host_port)

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
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
