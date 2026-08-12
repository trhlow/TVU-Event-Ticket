# .github/scripts/marker-envelope.test.py
"""Exercises publish_marker against a real throwaway registry. The content dict below is shaped like
markerContent closely enough to exercise the push mechanics (it is not asserted against
observation.schema.json here -- that is publish-decision.sh's own test suite's job); what this test
proves is that what gets pushed is byte-identical to what envelope_for/marker_digest independently
compute from the same input, and that a real registry round-trip preserves it exactly."""
import importlib.util
import json
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


marker_envelope = _load("marker-envelope")
publish_marker = marker_envelope.publish_marker
PublishError = marker_envelope.PublishError

envelope_mod = _load("envelope")
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


content = {
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "environment": "production",
    "frontendConfigFingerprint": "a" * 64,
    "images": {
        "monolith": "sha256:" + "1" * 64,
        "frontend": "sha256:" + "2" * 64,
    },
    "provenance": {
        "monolith": {"revision": "0123456789abcdef0123456789abcdef01234567",
                      "subjectDigest": "sha256:" + "1" * 64},
        "frontend": {"revision": "0123456789abcdef0123456789abcdef01234567",
                      "subjectDigest": "sha256:" + "2" * 64},
    },
    "evidence": {
        "sbom": {"monolith": {"digest": "sha256:" + "3" * 64, "subjectDigest": "sha256:" + "1" * 64,
                               "predicateType": "https://spdx.dev/Document/v2.3",
                               "documentValidated": True, "packageCount": 1},
                 "frontend": {"digest": "sha256:" + "4" * 64, "subjectDigest": "sha256:" + "2" * 64,
                              "predicateType": "https://spdx.dev/Document/v2.3",
                              "documentValidated": True, "packageCount": 1}},
        "vulnerabilityScan": {"monolith": {"digest": "sha256:" + "5" * 64,
                                            "subjectDigest": "sha256:" + "1" * 64,
                                            "predicateType": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
                                            "passed": True},
                               "frontend": {"digest": "sha256:" + "6" * 64,
                                            "subjectDigest": "sha256:" + "2" * 64,
                                            "predicateType": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
                                            "passed": True}},
        "layerSecretScan": {"monolith": {"digest": "sha256:" + "7" * 64,
                                          "subjectDigest": "sha256:" + "1" * 64,
                                          "predicateType": "https://evts.id.vn/attestations/layerSecretScan/v1",
                                          "passed": True},
                             "frontend": {"digest": "sha256:" + "8" * 64,
                                          "subjectDigest": "sha256:" + "2" * 64,
                                          "predicateType": "https://evts.id.vn/attestations/layerSecretScan/v1",
                                          "passed": True}},
        "filesystemSecretScan": {"monolith": {"digest": "sha256:" + "9" * 64,
                                               "subjectDigest": "sha256:" + "1" * 64,
                                               "predicateType": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
                                               "passed": True},
                                  "frontend": {"digest": "sha256:" + "a" * 64,
                                               "subjectDigest": "sha256:" + "2" * 64,
                                               "predicateType": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
                                               "passed": True}},
        "evidenceSetDigest": {"monolith": "sha256:" + "b" * 64, "frontend": "sha256:" + "c" * 64},
    },
    "flywayInventory": {
        "boundTo": "sha256:" + "1" * 64,
        "checksum": "d" * 64,
        "migrations": [{"installedRank": 1, "version": "1", "type": "SQL", "script": "V1__init.sql",
                         "checksum": 12345, "success": True}],
    },
}

expected_manifest = envelope_mod.envelope_for(content)
expected_digest = envelope_mod.marker_digest(expected_manifest)

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

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    break
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)

    registry_ref = f"localhost:{host_port}/marker-test"

    pushed_digest = publish_marker(registry_ref, "prepared-testcommit", content)

    report("publish_marker's returned digest equals envelope.marker_digest's independent computation",
           pushed_digest == expected_digest,
           f"pushed={pushed_digest!r}, expected={expected_digest!r}")

    req = urllib.request.Request(
        f"http://localhost:{host_port}/v2/marker-test/manifests/prepared-testcommit",
        headers={"Accept": expected_manifest["mediaType"]},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        stored_manifest_bytes = resp.read()
    expected_manifest_bytes = canonical_mod.canonical_bytes(expected_manifest)
    report("the stored manifest is byte-identical to envelope_for's own output",
           stored_manifest_bytes == expected_manifest_bytes,
           f"stored {len(stored_manifest_bytes)} bytes, expected {len(expected_manifest_bytes)} bytes")

    layer_digest = expected_manifest["layers"][0]["digest"]
    blob_req = urllib.request.Request(
        f"http://localhost:{host_port}/v2/marker-test/blobs/{layer_digest}"
    )
    with urllib.request.urlopen(blob_req, timeout=10) as resp:
        stored_blob = resp.read()
    report("the pushed blob is byte-identical to canonical_bytes(content)",
           stored_blob == canonical_mod.canonical_bytes(content),
           f"stored {len(stored_blob)} bytes")

    stored_manifest = json.loads(stored_manifest_bytes)
    report("the stored manifest carries no annotations and no subject key",
           "annotations" not in stored_manifest and "subject" not in stored_manifest,
           f"stored manifest keys: {sorted(stored_manifest.keys())}")

    try:
        publish_marker("localhost:1/nothing-here", "irrelevant", content)
        report("pushing to an unreachable registry raises PublishError", False,
               "no exception was raised")
    except PublishError:
        report("pushing to an unreachable registry raises PublishError", True)
    except Exception as exc:  # noqa: BLE001
        report("pushing to an unreachable registry raises PublishError", False,
               f"raised {type(exc).__name__} instead")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
