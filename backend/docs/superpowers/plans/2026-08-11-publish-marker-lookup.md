# Publish job: markerLookup reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `read_marker_lookup` — the second of the four lookup shapes, used for two of the ten required
lookups (`finalMarker`, `preparedMarker`). Reads a marker's manifest, verifies its envelope
(`digestVerified`/`sizeVerified`/`parsed`/`raw`), verifies its attestation via the just-merged
`attest-verify.py`, and — only when the envelope's three booleans are all true and it has exactly one
layer (the schema's own conditional, `observation.schema.json:153-168`) — fetches and parses that
layer's blob as `content`.

**Architecture:** One new function in `oci-read.py` (extending it, not a new module — `fetch_blob` is
the same size-before-hash discipline `fetch_manifest` already implements, just addressed by digest
instead of by tag). One new module, `marker-lookup.py`, composing `fetch_manifest` +
`attest-verify.py`'s `verify_attestation` into `presentMarker`'s exact shape, matching how
`envelope.py`'s own `marker_digest` is reused rather than reimplemented.

**Tech Stack:** Python 3.10+, the merged `oci-read.py`/`attest-verify.py`/`envelope.py`/`canonical.py`.
Tested against a real marker `marker-envelope.py`'s own test already proved it can push, read back
through the exact same fetch path a real observer would use.

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- `observedEnvelope`'s shape (`release-envelope.schema.json`'s own `$def`, already read this session):
  `digestVerified`/`sizeVerified`/`parsed` are three separate booleans (not one collapsed outcome),
  `raw` present only when all three are true. `fetch_manifest` already returns `sizeVerified`/
  `digestVerified` and raw bytes only when both are true — this task's `parsed` boolean is simply
  "did `json.loads` on those bytes succeed," attempted only when both fetch-level booleans are already
  true (never on unverified bytes — reusing `fetch_manifest`'s own refusal to hand back `raw` at all
  when either check fails means `parsed` literally cannot be computed on unverified bytes, by
  construction, not by a caller remembering to check first).
- `content` is present in the returned dict if and only if `observation.schema.json`'s own conditional
  holds (`digestVerified: true, sizeVerified: true, raw.layers` has exactly one item) — copy this
  condition exactly, do not approximate it with "the envelope looked fine."
- `verification.subjectDigest` must equal the marker's own `markerDigest` (per `verification`'s own
  description: "must equal the digest of the object it describes ... markerDigest for a marker's own
  verification"), and `verification.predicateType` must be `envelope.PREDICATE_TYPES["markerProvenance"]`
  — both passed to `attest-verify.py`'s `verify_attestation` as the values it enforces via `gh`'s own
  `--source-digest`/`--predicate-type` flags, not filled in separately afterward (if `gh` didn't check
  it, this task doesn't get to assert it either).
- `verification.policyPassed`: this project has no separate policy engine (no OPA/Rego, nothing beyond
  what `gh attestation verify`'s own identity/signature/predicate-type checks already enforce) — so
  `policyPassed` is set equal to `attestationVerified`'s own value. This is a stated, deliberate
  simplification (documented in the code, not silently assumed): if a real policy layer is added later,
  this is the one line that needs to change, and until then "gh verified it" is the only policy this
  pipeline has.
- Byte caps: marker manifest fetch uses the 64 KiB cap (already used in `oci-read.py`'s own test);
  marker payload (the blob) uses 256 KiB (design doc §3.3a's own table).

---

## File Structure

- Modify: `.github/scripts/oci-read.py` — add `fetch_blob`.
- Modify: `.github/scripts/oci-read.test.py` — add a test for `fetch_blob`.
- Create: `.github/scripts/marker-lookup.py` — `read_marker_lookup`.
- Create: `.github/scripts/marker-lookup.test.py` — exercises it against a real pushed marker.

## Interfaces

- `fetch_blob(registry_ref: str, digest: str, size_cap: int, username: str = None, password: str =
  None) -> dict` — same shape/discipline as `fetch_manifest`, addressed by digest at
  `/v2/<repo>/blobs/<digest>` instead of by tag at `/v2/<repo>/manifests/<tag>`. Returns
  `{"sizeVerified": bool, "digestVerified": bool, "raw": bytes | None}` (no `reportedDigest` field here
  — a blob fetch already knows the digest it asked for, unlike a manifest fetch by tag which doesn't
  know the digest in advance).
- `read_marker_lookup(registry_ref: str, tag: str, expected_source_repo: str,
  expected_signer_workflow: str, username: str = None, password: str = None) -> dict` — returns
  `markerLookup`'s shape (`presentMarker`/`absent`/`error`) ready to drop into an observation's
  `lookups.finalMarker`/`lookups.preparedMarker` key.

---

### Task 1: `fetch_blob` — the blob half of the raw reader

**Files:**
- Modify: `.github/scripts/oci-read.py`
- Modify: `.github/scripts/oci-read.test.py`

**Interfaces:**
- Consumes: `oci-push.py`'s `push_blob` (to push something real to read back), the same throwaway
  registry pattern `oci-read.py`'s own existing test already uses.
- Produces: `fetch_blob`, importable by Task 2.

- [ ] **Step 1: Write the failing test additions**

Append to `.github/scripts/oci-read.test.py` (before the final `print(f"\npassed=...")`/`sys.exit(...)`
lines — move those two lines to the true end of the file):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python oci-read.test.py`
Expected: the existing 6 assertions still pass, then `AttributeError: module 'oci_read' has no
attribute 'fetch_blob'`.

- [ ] **Step 3: Write the implementation**

Append to `.github/scripts/oci-read.py`:

```python
def fetch_blob(registry_ref: str, digest: str, size_cap: int,
                username: str = None, password: str = None) -> dict:
    host, repo = _split_ref(registry_ref)
    url = f"http://{host}/v2/{repo}/blobs/{digest}"

    try:
        head_resp = _request("HEAD", url, username=username, password=password)
    except ReadError:
        return {"sizeVerified": False, "digestVerified": False, "raw": None}

    content_length = head_resp.headers.get("Content-Length")
    if content_length is None or int(content_length) > size_cap:
        return {"sizeVerified": False, "digestVerified": False, "raw": None}

    get_resp = _request("GET", url, username=username, password=password)
    raw = get_resp.read()

    size_verified = len(raw) == int(content_length)
    actual_digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    digest_verified = actual_digest == digest

    if not (size_verified and digest_verified):
        return {"sizeVerified": size_verified, "digestVerified": digest_verified, "raw": None}

    return {"sizeVerified": True, "digestVerified": True, "raw": raw}
```

Add `"fetch_blob"` to `oci-read.py`'s `__all__` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python oci-read.test.py`
Expected: `passed=10 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/oci-read.py .github/scripts/oci-read.test.py
git commit -m "feat(ci): add fetch_blob to oci-read.py for reading a marker's payload"
```

---

### Task 2: `marker-lookup.py` — read a real marker into `presentMarker`'s shape

**Files:**
- Create: `.github/scripts/marker-lookup.py`
- Test: `.github/scripts/marker-lookup.test.py`

**Interfaces:**
- Consumes: `fetch_manifest`/`fetch_blob` from `oci-read.py`, `verify_attestation` from
  `attest-verify.py`, `PREDICATE_TYPES`/`marker_digest` from `envelope.py`, `strict_loads` from
  `canonical.py` (parsing untrusted bytes as JSON must go through the same strict reader
  `publish-decision.sh` itself uses — not a bare `json.loads`, which silently keeps the last of
  duplicate keys, exactly the hole `canonical.py`'s own docstring warns about).
- Produces: `read_marker_lookup`, importable by the full observer task (not in this plan).

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python marker-lookup.test.py`
Expected: fails in the `_load("marker-lookup")` call (`marker-lookup.py` does not exist yet).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/marker-lookup.py
"""Reads a marker (finalMarker or preparedMarker -- same read path, different tag) into
observation.schema.json's markerLookup shape: fetch the manifest with the mandated size-before-hash
order (oci-read.py), verify its attestation (attest-verify.py), and -- only when the envelope's three
booleans are all true and it has exactly one layer, the schema's own conditional -- fetch and parse the
payload as content.
"""
import importlib.util
import json
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
fetch_blob = _oci_read.fetch_blob

_attest_verify = _load("attest-verify")
verify_attestation = _attest_verify.verify_attestation

_envelope = _load("envelope")
_canonical = _load("canonical")

__all__ = ["read_marker_lookup"]

_MANIFEST_SIZE_CAP = 64 * 1024
_PAYLOAD_SIZE_CAP = 256 * 1024


def read_marker_lookup(registry_ref: str, tag: str, expected_source_repo: str,
                        expected_signer_workflow: str,
                        username: str = None, password: str = None) -> dict:
    queried_ref = f"{registry_ref}:{tag}"
    manifest_result = fetch_manifest(registry_ref, tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not manifest_result["sizeVerified"] and manifest_result["raw"] is None \
            and manifest_result["reportedDigest"] is None:
        # fetch_manifest cannot distinguish "not found" from "refused for other reasons" on its own
        # (it is a pure fetch/verify primitive, not a presence oracle) -- read_object_lookup already
        # solves that distinction with its own HEAD-based absence check, so reuse it here rather than
        # duplicating the 404-vs-error logic a second time.
        object_lookup = _load("oci-read").read_object_lookup(registry_ref, tag,
                                                                username=username, password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}

    ociEnvelope = {
        "digestVerified": manifest_result["digestVerified"],
        "sizeVerified": manifest_result["sizeVerified"],
        "parsed": False,
    }

    raw_manifest = None
    if manifest_result["sizeVerified"] and manifest_result["digestVerified"]:
        try:
            raw_manifest = _canonical.strict_loads(manifest_result["raw"])
            ociEnvelope["parsed"] = True
            ociEnvelope["raw"] = raw_manifest
        except ValueError:
            ociEnvelope["parsed"] = False

    marker_digest = None
    content = None
    if ociEnvelope.get("parsed") and ociEnvelope["digestVerified"] and ociEnvelope["sizeVerified"]:
        marker_digest = _envelope.marker_digest(raw_manifest)
        layers = raw_manifest.get("layers", [])
        if len(layers) == 1:
            blob_result = fetch_blob(registry_ref, layers[0]["digest"], size_cap=_PAYLOAD_SIZE_CAP,
                                      username=username, password=password)
            if blob_result["sizeVerified"] and blob_result["digestVerified"]:
                try:
                    content = _canonical.strict_loads(blob_result["raw"])
                except ValueError:
                    content = None

    verification_result = verify_attestation(
        f"oci://{registry_ref}:{tag}",
        expected_repo=expected_source_repo,
        expected_signer_workflow=expected_signer_workflow,
        expected_predicate_type=_envelope.PREDICATE_TYPES["markerProvenance"],
        expected_source_digest=marker_digest or "",
    )
    verification = {
        "attestationVerified": verification_result["attestationVerified"],
        "subjectDigest": marker_digest or ("sha256:" + "0" * 64),
        "signerRepository": verification_result["signerRepository"],
        "signerWorkflow": verification_result["signerWorkflow"],
        "sourceRevision": verification_result["sourceRevision"],
        "predicateType": _envelope.PREDICATE_TYPES["markerProvenance"],
        # No separate policy engine exists in this pipeline -- gh attestation verify's own identity/
        # signature/predicate-type enforcement is the only policy there is right now. If a real policy
        # layer (e.g. OPA/Rego over the predicate body) is added later, this line is what changes.
        "policyPassed": verification_result["attestationVerified"],
    }

    result = {
        "status": "present",
        "queriedRef": queried_ref,
        "markerDigest": marker_digest or ("sha256:" + "0" * 64),
        "verification": verification,
        "ociEnvelope": ociEnvelope,
    }
    if content is not None:
        result["content"] = content
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python marker-lookup.test.py`
Expected: `passed=6 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/marker-lookup.py .github/scripts/marker-lookup.test.py
git commit -m "feat(ci): read a marker into markerLookup's shape (fetch, verify, conditionally parse content)"
```

---

## Explicitly out of scope for this plan

- `read_evidence_set_lookup` (needs 4 nested report/attestation pairs) — a follow-up plan.
- The full observer + `publish-decision.sh` orchestration.

## Self-Review Notes

- Spec coverage: `presentMarker`'s full shape (`status`, `queriedRef`, `markerDigest`, `verification`,
  `ociEnvelope`, conditional `content`) is built and exercised for real against a marker
  `marker-envelope.py`'s own test already proved pushes correctly.
- Placeholder scan: no TBD/TODO. `policyPassed`'s simplification is stated explicitly as a real,
  deliberate design choice with a named trigger for when it would need to change, not silently assumed.
- Type consistency: `read_marker_lookup`'s `expected_source_repo`/`expected_signer_workflow` parameters
  match `verify_attestation`'s own parameter names/meaning from the already-merged `attest-verify.py`.
