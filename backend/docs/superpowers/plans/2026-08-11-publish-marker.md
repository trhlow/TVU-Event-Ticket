# Publish job: marker writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push a real marker (prepared or final — same shape, different tag and different completeness
of `content`, per design doc §4 steps 5/7) using `envelope.py`'s already-proven `envelope_for` plus
`oci-push.py`, the same pattern just proven for evidence-sets in `evidence-set-envelope.py`.

**Architecture:** One function, `publish_marker`, in a new `marker-envelope.py`: canonicalizes
`content` via `canonical.canonical_bytes` (the same bytes `envelope_for` already hashes internally to
build the layer descriptor — this function must push those exact same bytes as the blob, not
recompute them separately), pushes that blob, pushes the shared empty config blob, calls
`envelope.envelope_for(content)` to get the manifest, pushes the manifest under the given tag. No new
manifest-shape logic — `envelope_for` already IS the correct, annotation-free, no-subject construction
(confirmed by reading it: markers carry no `subject` key at all, unlike evidence-sets, matching the
"subject absent is the marker's own rule" distinction already established in the manifest spec).

**Tech Stack:** Python 3.10+, `envelope.py` (unmodified — this plan only calls it, does not change it),
`canonical.py`, the merged `oci-push.py`. Tested against a real throwaway `registry:2`.

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- `envelope_for(content)` is NOT modified by this plan. It already produces the correct shape (no
  annotations, no subject, one layer). This plan only adds the I/O — pushing that shape somewhere real.
- The blob pushed for the marker's own layer must be `canonical.canonical_bytes(content)` — the exact
  same bytes `envelope_for` itself hashes internally (`envelope.py:35`,
  `payload = canonical_bytes(content)`) to build the layer descriptor it returns. This plan's own
  `publish_marker` must NOT call `canonical_bytes` a second, separately-timed time and assume it
  produces the same bytes by coincidence — it must reuse the manifest's own `layers[0].digest`/`.size`
  as the source of truth for what to push, computing the canonical bytes once and handing the same
  bytes to both `envelope_for` (indirectly, since `envelope_for` recomputes internally from `content`)
  and `push_blob` (directly). Since `envelope_for` takes `content` and recomputes internally rather than
  accepting pre-computed bytes, and `canonical_bytes` is a pure deterministic function, calling it twice
  over the identical `content` value produces identical bytes by construction — but the test must prove
  this, not merely assume it (see Task 1 Step 1's assertion comparing the pushed blob's digest against
  the manifest's own `layers[0].digest`).
- `content` for a PREPARED marker is a `markerContent`-shaped dict missing whatever fields aren't yet
  known at that point in the flow (design doc §4 step 5: "observation đầy đủ trừ phần chỉ final marker
  mới có") — this plan does not construct that partial content itself; it accepts whatever dict the
  caller (a later orchestration task, not in this plan) passes in, matching how `envelope_for` itself
  is agnostic to what `content` contains.

---

## File Structure

- Create: `.github/scripts/marker-envelope.py` — `publish_marker`.
- Create: `.github/scripts/marker-envelope.test.py` — exercises it against a real throwaway registry,
  using a real (fabricated-for-the-test, since a full real `markerContent` requires the pieces slice 4's
  investigation found are only available inside a real publish run) content dict shaped like
  `markerContent` closely enough to exercise the push mechanics, not to prove `markerContent` validity
  itself (that is `publish-decision.sh`'s own already-extensive test suite's job, not this plan's).

## Interfaces

- `publish_marker(registry_ref: str, tag: str, content: dict, username: str = None, password: str =
  None) -> str` — returns the manifest's digest (== the marker's digest, the same value
  `envelope.marker_digest` would independently compute from the same `content` — Task 1's test proves
  this equality for real, not by inspection). Raises `oci-push.py`'s `PublishError` unchanged (no
  re-wrap, matching `evidence-set-envelope.py`'s own established convention for this class of module).

---

### Task 1: `marker-envelope.py` — push a real marker

**Files:**
- Create: `.github/scripts/marker-envelope.py`
- Test: `.github/scripts/marker-envelope.test.py`

**Interfaces:**
- Consumes: `envelope_for`/`marker_digest` from `envelope.py` (unmodified), `push_blob`/`push_manifest`/
  `PublishError` from `oci-push.py`, `canonical_bytes` from `canonical.py`.
- Produces: `publish_marker`, importable by a later orchestration task (not in this plan).

- [ ] **Step 1: Write the failing test**

```python
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

envelope_mod = _load("envelope")
canonical_mod = _load("canonical")

sys.path.insert(0, str(HERE))
from marker_envelope import PublishError  # noqa: E402  (re-exported from oci-push.py by marker-envelope.py)

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

expected_digest = envelope_mod.marker_digest(content)
expected_manifest = envelope_mod.envelope_for(content)

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python marker-envelope.test.py`
Expected: fails in the `_load("marker-envelope")` call (`marker-envelope.py` does not exist yet).

- [ ] **Step 3: Write the implementation**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python marker-envelope.test.py`
Expected: `passed=5 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/marker-envelope.py .github/scripts/marker-envelope.test.py
git commit -m "feat(ci): push a real marker using envelope.py's envelope_for + oci-push.py"
```

---

## Explicitly out of scope for this plan

- Constructing a real, fully-valid `markerContent` (the test's `content` dict is shaped closely enough
  to exercise push mechanics, not validated against `observation.schema.json` here).
- Calling `publish-decision.sh` with the result, or any orchestration deciding COMPLETE/PARTIAL/CONFLICT.
- Candidate-tag image pushing, real GHCR wiring.

## Self-Review Notes

- Spec coverage: this plan's only claim is "marker push works and matches envelope.py's own
  independent computation" — proven for real in Task 1 by comparing three independent things (the
  pushed digest, the stored manifest bytes, the stored blob bytes) against what `envelope.py` itself
  computes, not merely trusting `publish_marker`'s own internal consistency.
- Placeholder scan: no TBD/TODO.
- Type consistency: `publish_marker`'s signature matches `publish_evidence_set`'s own established
  pattern (`registry_ref, tag, ..., username=None, password=None`) from the just-merged
  `evidence-set-envelope.py`.
