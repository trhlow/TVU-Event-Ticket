# .github/scripts/marker-lookup.test.py
"""Exercises read_marker_lookup against a real marker marker-envelope.py's own test already proved it
can push -- the same content, the same push path, read back through the exact fetch path a real
observer would use."""
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


marker_lookup_mod = _load("marker-lookup")
read_marker_lookup = marker_lookup_mod.read_marker_lookup

marker_envelope_mod = _load("marker-envelope")
envelope_mod = _load("envelope")

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
    "images": {"monolith": "sha256:" + "1" * 64, "frontend": "sha256:" + "2" * 64},
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
expected_marker_digest = envelope_mod.marker_digest(envelope_mod.envelope_for(content))

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

    registry_ref = f"localhost:{host_port}/marker-lookup-test"
    marker_envelope_mod.publish_marker(registry_ref, "prepared-testcommit", content)

    result = read_marker_lookup(registry_ref, "prepared-testcommit",
                                 expected_source_repo="trhlow/TVU-Event-Ticket",
                                 expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main")

    report("read_marker_lookup reports present with the real markerDigest",
           result.get("status") == "present" and result.get("markerDigest") == expected_marker_digest,
           f"result status/digest: {result.get('status')!r}, {result.get('markerDigest')!r}")

    report("ociEnvelope's three booleans are all true for a genuinely well-formed marker",
           all(result.get("ociEnvelope", {}).get(k) is True
               for k in ("digestVerified", "sizeVerified", "parsed")),
           f"ociEnvelope={result.get('ociEnvelope')!r}")

    report("content is present and matches exactly what was pushed "
           "(envelope verified, one layer -- the schema's own conditional holds)",
           result.get("content") == content,
           f"content matches: {result.get('content') == content}")

    report("verification.attestationVerified is False (no real signature exists on this test push)",
           result.get("verification", {}).get("attestationVerified") is False,
           f"verification={result.get('verification')!r}")

    report("verification.policyPassed mirrors attestationVerified (no separate policy engine exists)",
           result.get("verification", {}).get("policyPassed")
           == result.get("verification", {}).get("attestationVerified"),
           f"verification={result.get('verification')!r}")

    absent_result = read_marker_lookup(registry_ref, "this-tag-was-never-pushed",
                                        expected_source_repo="trhlow/TVU-Event-Ticket",
                                        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main")
    report("a missing marker tag reports absent",
           absent_result.get("status") == "absent",
           f"absent_result={absent_result!r}")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
