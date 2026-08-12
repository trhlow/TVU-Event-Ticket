# Publish job: compose read_evidence_set_lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap task 1.6, the last piece of Phase 1. `read_evidence_set_lookup` composes everything
built in 1.4/1.5 into `presentEvidenceSet`'s full shape (`carrierDigest`, `verification`,
`subjectMatches`, `layersValid`, `reports` — the 4 report/attestation pairs), completing
`evidenceSetLookup` (2 of the 10 required top-level lookups: `monolithEvidenceSet`,
`frontendEvidenceSet`).

**Architecture:** One function, `read_evidence_set_lookup`, that: fetches the carrier's own manifest
(`fetch_manifest`, reusing `oci-read.py`) for `carrierDigest`; checks `subjectMatches` (does the
carrier's own `subject.digest` equal the expected image digest) and `layersValid` (does the carrier
have exactly the 4 required mediaTypes, no duplicates, no extras — reusing
`evidence-set-envelope.py`'s own `LAYER_MEDIA_TYPES` constant rather than a second, independently
maintained list); verifies the **carrier's own** provenance attestation (a *third*, distinct
attestation from each report's own — this needs a predicate type that does not exist yet, since
`publish-decision.sh`'s own `evidence_set_problems()` never pinned one, confirmed by reading its real
code: the check is `type(predicate) is not str or not predicate`, no constant comparison — this plan
adds `PREDICATE_TYPES["evidenceSet"]` to `envelope.py`, a purely additive change nothing else in the
codebase iterates expecting a fixed key count); and for each of the 4 kinds, calls
`evidence-set-report.py` + `evidence-set-attestation.py` and composes their output into
`reportAttestationPair`'s shape (`sbomReportAttestationPair` for SBOM,
`scanReportAttestationPair` for the other three).

**Tech Stack:** Python 3.10+, every module already merged this session (`oci-read.py`,
`attest-verify.py`, `evidence-set-report.py`, `evidence-set-attestation.py`, `evidence-set-envelope.py`,
`envelope.py`).

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- **`envelope.py` change, confirmed safe before this plan was written**: adding
  `PREDICATE_TYPES["evidenceSet"] = "https://evts.id.vn/attestations/evidenceSet/v1"` is purely
  additive — grepped every `.py`/`.test.py` in `.github/scripts/` for anything iterating
  `PREDICATE_TYPES` expecting an exact count (none found), and confirmed
  `manifest-agreement.test.sh`'s own cross-source drift check only verifies its own hardcoded 5-key
  `EXPECTED_PREDICATES` dict is a match for the schema, never asserts `envelope.PREDICATE_TYPES` has
  *exactly* 5 keys — so a 6th key does not break that already-CI-verified test. If the implementer's
  own re-check of this before starting disagrees, stop and report rather than proceeding.
- `layersValid` reuses `evidence-set-envelope.py`'s own `LAYER_MEDIA_TYPES` dict (imported, not
  copy-pasted) to check the carrier's 4 layers have exactly those 4 mediaTypes, each exactly once, no
  extras.
- The carrier's own `verification` block reuses the SAME shape marker-lookup.py's own `verification`
  already builds (per `presentEvidenceSet`'s own description: "verification reuses the same shape a
  marker's own attestation check uses") — reuse `attest-verify.py`'s original, simpler
  `verify_attestation` (not `verify_attestation_with_duplicates` — the carrier's own attestation has no
  pagination/duplicate-detection requirement in the schema, only the per-report attestations do) plus
  the SAME `policyPassed`-mirrors-`attestationVerified` simplification `marker-lookup.py` already
  established (no separate policy engine exists in this pipeline, stated there and reused here rather
  than re-litigated).
- `reports.<kind>` uses `sbomReportAttestationPair` for `"sbom"` and `scanReportAttestationPair` for the
  other three — both are just `{reportLookup, attestationLookup}`, so this is a direct composition of
  1.4's and 1.5's own return values, no new shape logic.
- No network calls beyond what `oci-read.py`/`attest-verify.py` already make.

---

## File Structure

- Modify: `.github/scripts/envelope.py` — add `PREDICATE_TYPES["evidenceSet"]`.
- Modify: `.github/scripts/envelope.test.py` if one exists (check first — `envelope.py` may only be
  covered indirectly via `manifest-agreement.test.sh`; if no standalone test file exists, this task adds
  none, matching the existing pattern rather than inventing a new one for a one-line constant addition).
- Create: `.github/scripts/evidence-set-lookup.py` — `read_evidence_set_lookup`.
- Create: `.github/scripts/evidence-set-lookup.test.py`.

## Interfaces

- `read_evidence_set_lookup(registry_ref: str, evidence_set_tag: str, subject_digest: str,
  expected_source_repo: str, expected_signer_workflow: str) -> dict` — returns `evidenceSetLookup`'s
  shape (`presentEvidenceSet`/`absent`/`error`), ready to drop into an observation's
  `lookups.monolithEvidenceSet`/`lookups.frontendEvidenceSet` key.

---

### Task 1: Add the evidence-set carrier's own predicate type

**Files:**
- Modify: `.github/scripts/envelope.py`

- [ ] **Step 1: Confirm the safety check for real before editing**

Run: `grep -rn "PREDICATE_TYPES" .github/scripts/*.py .github/scripts/*.test.py` from the repo root and
read every match. Confirm none iterate the dict expecting an exact key count (e.g. `len(PREDICATE_TYPES)
== 5`, `assert set(PREDICATE_TYPES) == {...}`). If any such assertion exists, STOP and report rather
than proceeding — this plan's own safety claim would be wrong and needs re-evaluation, not a workaround.

- [ ] **Step 2: Add the new key**

In `.github/scripts/envelope.py`, add to the `PREDICATE_TYPES` dict:
```python
    "evidenceSet": "https://evts.id.vn/attestations/evidenceSet/v1",
```
(Read the file first to match the existing dict's exact formatting/comment style before editing.)

- [ ] **Step 3: Run the sibling suite that touches this file**

Run `PYTHON_BIN=python bash manifest-agreement.test.sh` from `.github/scripts/` (source
`python-bin.sh`'s convention). Expected: same pass/fail counts as this session's last known-good run
for this file (23 passed / 2 known-artifact-failed, per the ledger) — confirming the 6th key did not
break the cross-source drift check, exactly as Step 1 predicted.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/envelope.py
git commit -m "feat(ci): add the evidence-set carrier's own predicate type"
```

---

### Task 2: `evidence-set-lookup.py`

**Files:**
- Create: `.github/scripts/evidence-set-lookup.py`
- Test: `.github/scripts/evidence-set-lookup.test.py`

**Interfaces:**
- Consumes: `fetch_manifest`/`read_object_lookup` from `oci-read.py`, `verify_attestation` from
  `attest-verify.py`, `read_evidence_set_report` from `evidence-set-report.py`,
  `read_evidence_set_attestation` from `evidence-set-attestation.py`, `LAYER_MEDIA_TYPES`/
  `publish_evidence_set` from `evidence-set-envelope.py`, `PREDICATE_TYPES`/`marker_digest`-style
  patterns from `envelope.py`, all 4 collector modules (the test pushes a real evidence-set exactly like
  `evidence-set-report.test.py`/`evidence-set-attestation.test.py` already do).
- Produces: `read_evidence_set_lookup`, importable by Phase 2's orchestration (not in this plan).

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/evidence-set-lookup.test.py
"""Exercises read_evidence_set_lookup against a real evidence-set pushed by the already-merged
evidence-set-envelope.py, composing every reader built in roadmap 1.4/1.5 into the full
presentEvidenceSet shape."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
IGNORE_FILE = HERE / "collector-fixtures" / "vulnerability-ignore.yaml"


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence_set_lookup_mod = _load("evidence-set-lookup")
read_evidence_set_lookup = evidence_set_lookup_mod.read_evidence_set_lookup

evidence_set_envelope_mod = _load("evidence-set-envelope")
collect_sbom_mod = _load("collect-sbom")
collect_vuln_mod = _load("collect-vulnerability-scan")
collect_secret_mod = _load("collect-secret-scan")
local_registry_mod = _load("local-registry")

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


def build_registry():
    contracts_dir = HERE.parent / "contracts"
    resources = {}
    for path in sorted(contracts_dir.rglob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        schema_id = contents.get("$id")
        if isinstance(schema_id, str) and schema_id:
            resources[schema_id] = referencing.Resource.from_contents(
                contents, default_specification=referencing.jsonschema.DRAFT202012)
    return referencing.Registry().with_resources(resources.items())


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run slice 1 Task 1 first)", False, f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

sbom_result = collect_sbom_mod.collect_sbom(str(TARBALL), "tvu-collector-test:tiny")
vuln_document = collect_vuln_mod.collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                              str(IGNORE_FILE))
layer_document = collect_secret_mod.collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                str(RULESET))
fs_document = collect_secret_mod.collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                   str(RULESET))
evidence_documents = {
    "sbom": sbom_result["document"], "vulnerabilityScan": vuln_document,
    "layerSecretScan": layer_document, "filesystemSecretScan": fs_document,
}

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

    registry_ref = f"localhost:{host_port}/evidence-set-lookup-test"

    with local_registry_mod.local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as subject_ref:
        digest_proc = subprocess.run(["crane", "digest", "--full-ref", subject_ref],
                                      capture_output=True, text=True, timeout=30, check=False)
        manifest_proc = subprocess.run(["crane", "manifest", subject_ref],
                                        capture_output=True, text=True, timeout=30, check=False)
    subject_digest = digest_proc.stdout.strip().rsplit("@", 1)[-1]
    subject_size = len(manifest_proc.stdout.encode("utf-8"))

    evidence_set_envelope_mod.publish_evidence_set(registry_ref, "evidence-monolith-sha-testcommit",
                                                     evidence_documents, subject_digest, subject_size)

    result = read_evidence_set_lookup(
        registry_ref, "evidence-monolith-sha-testcommit", subject_digest,
        expected_source_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
    )

    report("result is present with the real carrierDigest",
           result.get("status") == "present" and isinstance(result.get("carrierDigest"), str)
           and result["carrierDigest"].startswith("sha256:"),
           f"status/carrierDigest: {result.get('status')!r}, {result.get('carrierDigest')!r}")

    report("subjectMatches is true (the carrier's own subject really is this image)",
           result.get("subjectMatches") is True, f"subjectMatches={result.get('subjectMatches')!r}")

    report("layersValid is true (exactly 4 layers, 4 required mediaTypes, no dupes)",
           result.get("layersValid") is True, f"layersValid={result.get('layersValid')!r}")

    report("verification.attestationVerified is False (no real signature on this test push) and "
           "policyPassed mirrors it",
           result.get("verification", {}).get("attestationVerified") is False
           and result.get("verification", {}).get("policyPassed") is False,
           f"verification={result.get('verification')!r}")

    report("reports has all 4 kinds, each a {reportLookup, attestationLookup} pair",
           set(result.get("reports", {}).keys())
           == {"sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"}
           and all({"reportLookup", "attestationLookup"} <= set(pair.keys())
                    for pair in result.get("reports", {}).values()),
           f"reports keys: {list(result.get('reports', {}).keys())}")

    schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
    present_schema = schema["$defs"]["presentEvidenceSet"]
    full_schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "allOf": [present_schema],
                   "$defs": schema["$defs"]}
    registry = build_registry()
    validator = jsonschema.Draft202012Validator(full_schema, registry=registry)
    errors = sorted(validator.iter_errors(result), key=str)
    report("the whole result validates against presentEvidenceSet exactly",
           not errors, "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:8]))

    absent_result = read_evidence_set_lookup(
        registry_ref, "this-tag-was-never-pushed", subject_digest,
        expected_source_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
    )
    report("a missing evidence-set tag reports absent",
           absent_result.get("status") == "absent", f"absent_result={absent_result!r}")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python evidence-set-lookup.test.py`
Expected: fails in the `_load("evidence-set-lookup")` call (module does not exist).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/evidence-set-lookup.py
"""Composes evidence-set-report.py + evidence-set-attestation.py + the carrier's own provenance
attestation into presentEvidenceSet's full shape -- the last of the 4 lookup types, completing
evidenceSetLookup (2 of the 10 required top-level lookups: monolithEvidenceSet, frontendEvidenceSet).
"""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
read_object_lookup = _oci_read.read_object_lookup

_attest_verify = _load("attest-verify")
verify_attestation = _attest_verify.verify_attestation
AttestationCheckError = _attest_verify.AttestationCheckError

_evidence_set_report = _load("evidence-set-report")
read_evidence_set_report = _evidence_set_report.read_evidence_set_report

_evidence_set_attestation = _load("evidence-set-attestation")
read_evidence_set_attestation = _evidence_set_attestation.read_evidence_set_attestation

_evidence_set_envelope = _load("evidence-set-envelope")
LAYER_MEDIA_TYPES = _evidence_set_envelope.LAYER_MEDIA_TYPES

_envelope = _load("envelope")

__all__ = ["read_evidence_set_lookup"]

_MANIFEST_SIZE_CAP = 64 * 1024
_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")


def read_evidence_set_lookup(registry_ref: str, evidence_set_tag: str, subject_digest: str,
                              expected_source_repo: str, expected_signer_workflow: str,
                              username: str = None, password: str = None) -> dict:
    queried_ref = f"{registry_ref}:{evidence_set_tag}"
    manifest_result = fetch_manifest(registry_ref, evidence_set_tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not (manifest_result["sizeVerified"] and manifest_result["digestVerified"]
            and manifest_result["raw"] is not None):
        object_lookup = read_object_lookup(registry_ref, evidence_set_tag, username=username,
                                            password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}
        return {"status": "error", "queriedRef": queried_ref, "detail": "manifest fetch unverifiable"}

    import canonical
    try:
        manifest = canonical.strict_loads(manifest_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        return {"status": "error", "queriedRef": queried_ref, "detail": f"manifest did not parse: {exc}"}

    carrier_digest = _envelope.marker_digest(manifest)

    layers = manifest.get("layers", [])
    layer_media_types = [layer.get("mediaType") for layer in layers]
    required_media_types = set(LAYER_MEDIA_TYPES.values())
    layers_valid = (len(layers) == 4 and set(layer_media_types) == required_media_types
                     and len(layer_media_types) == len(set(layer_media_types)))

    subject = manifest.get("subject", {})
    subject_matches = subject.get("digest") == subject_digest

    try:
        carrier_verification_result = verify_attestation(
            f"oci://{registry_ref}:{evidence_set_tag}", expected_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow,
            expected_predicate_type=_envelope.PREDICATE_TYPES["evidenceSet"],
            expected_source_digest=carrier_digest,
        )
    except AttestationCheckError:
        carrier_verification_result = {
            "attestationVerified": False, "signerRepository": expected_source_repo,
            "signerWorkflow": expected_signer_workflow, "sourceRevision": carrier_digest,
        }

    verification = {
        "attestationVerified": carrier_verification_result["attestationVerified"],
        "subjectDigest": carrier_digest,
        "signerRepository": carrier_verification_result["signerRepository"],
        "signerWorkflow": carrier_verification_result["signerWorkflow"],
        "sourceRevision": carrier_verification_result["sourceRevision"],
        "predicateType": _envelope.PREDICATE_TYPES["evidenceSet"],
        "policyPassed": carrier_verification_result["attestationVerified"],
    }

    reports = {}
    for kind in _KINDS:
        report_lookup = read_evidence_set_report(registry_ref, evidence_set_tag, kind, subject_digest,
                                                   username=username, password=password)
        attestation_lookup = read_evidence_set_attestation(
            registry_ref, evidence_set_tag, kind, subject_digest,
            source_revision=carrier_digest, expected_source_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow,
        )
        reports[kind] = {"reportLookup": report_lookup, "attestationLookup": attestation_lookup}

    return {
        "status": "present",
        "queriedRef": queried_ref,
        "carrierDigest": carrier_digest,
        "verification": verification,
        "subjectMatches": subject_matches,
        "layersValid": layers_valid,
        "reports": reports,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python evidence-set-lookup.test.py`
Expected: `passed=7 failed=0`. This test runs all 4 collectors, one full evidence-set push, one carrier
manifest fetch, 4 report fetches, and 4 attestation checks — expect it to be the slowest test in the
whole collector/publish suite so far, not a hang.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/evidence-set-lookup.py .github/scripts/evidence-set-lookup.test.py
git commit -m "feat(ci): compose read_evidence_set_lookup -- Phase 1 of the publish job is complete"
```

---

## Explicitly out of scope for this plan

- Phase 2 (the "expected" block, assembling all 10 lookups, calling `publish-decision.sh`, the full
  orchestration loop).

## Self-Review Notes

- Spec coverage: `presentEvidenceSet`'s full required shape is built and schema-validated for real in
  Task 2, completing `evidenceSetLookup` — the 4th and last of the 4 lookup types this whole Phase 1 has
  been building toward.
- Placeholder scan: no TBD/TODO. The new `PREDICATE_TYPES["evidenceSet"]` constant's safety is verified
  by an explicit grep-and-check step (Task 1 Step 1), not assumed safe.
- Type consistency: `read_evidence_set_lookup`'s parameter names (`registry_ref, evidence_set_tag,
  subject_digest, expected_source_repo, expected_signer_workflow`) match the naming already established
  across `evidence-set-report.py`/`evidence-set-attestation.py` for consistency.
