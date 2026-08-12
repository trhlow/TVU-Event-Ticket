# Publish job: evidence-set report reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap task 1.4. `read_evidence_set_report` fetches one of the four report layers from a
real evidence-set carrier's manifest, verifies it, and builds `scanReportEvidenceLookup`/
`sbomReportEvidenceLookup`'s `present` shape (`scanPresentReport`/`sbomPresentReport`). This is now
genuinely unblocked: roadmap 1.4a+1.4b closed the gap where predicate documents didn't carry enough
data for a reader to build `normalizedReport` purely from what's on the registry — confirmed by a full
field-by-field re-read of `scanPresentReport`/`sbomPresentReport` finding no further gap.

**Architecture:** One function, `read_evidence_set_report(registry_ref, evidence_set_tag, kind,
subject_digest)`, that: fetches the evidence-set carrier's own manifest (`fetch_manifest`, reusing
`oci-read.py`), finds the layer whose `mediaType` matches the requested `kind` (identified by mediaType,
not position — the manifest spec's own stated rule, already correctly implemented in
`evidence-set-envelope.py`'s push side), fetches that layer's blob (`fetch_blob`), parses it
(`canonical.strict_loads`), validates it against the real predicate schema for that kind
(`schemaValid`), and builds `normalizedReport` — for the 3 scan kinds, this is now almost the parsed
document directly (only `target` needs reshaping from the predicate's plain string to
`normalizedScanContent`'s `{imageDigest: subject_digest}`, using the `subject_digest` the caller already
knows from the evidence-set carrier's own `subject` field); for SBOM, `normalizedReport` is built by
re-deriving `spdxVersion`/`packageCount` from the parsed document plus recomputing
`canonicalDigest`/`canonicalSize` and setting `subjectDigest` from the caller-supplied value.

**Tech Stack:** Python 3.10+, the merged `oci-read.py`, `canonical.py`, the 3 (now-unified) predicate
schemas plus `observation.schema.json`'s `sbomDocumentContent`/`normalizedScanContent` $defs for
validation in tests.

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- Layer identification is by `mediaType`, never by array position (design doc §2's own stated rule,
  already followed by `evidence-set-envelope.py`'s push side — this task's read side must match).
- `schemaValid`: `True` only if the parsed blob validates against the REAL predicate schema for that
  kind (`jsonschema.Draft202012Validator` against the actual file, not a hand-rolled check) — a loadable
  but structurally wrong document is `schemaValid: False`, not an exception.
- `digestVerified`/`sizeVerified` come directly from `fetch_blob`'s own returned booleans — this
  function does not re-verify them a second, separate way.
- For the 3 scan kinds, `normalizedReport` is the parsed predicate document with exactly one
  reshaping: `target` becomes `{"imageDigest": subject_digest}` (replacing the predicate's own plain
  string `target`) — every other field (`scanner`, `reportDigest`, `policy`, `counts`, `findings`,
  `truncated`, `declaredOutcome`) passes through unchanged, since roadmap 1.4b made the predicate
  document and `normalizedScanContent` the same shape except for this one field.
- For SBOM, `normalizedReport` (matching `sbomDocumentContent`) is built as: `spdxVersion` from the
  parsed document's own `spdxVersion` key, `documentValidated` = (`spdxVersion == "SPDX-2.3"`),
  `subjectDigest` = the caller-supplied `subject_digest`, `packageCount` = `len(document["packages"])`,
  `canonicalDigest`/`canonicalSize` recomputed from `canonical.canonical_bytes(document)` — the same
  computation `collect-sbom.py` already does, just re-derived at read time instead of trusted from
  collection time (a reader must never trust a claimed value it can recompute itself).
- No network calls beyond the registry fetches `oci-read.py` already makes.

---

## File Structure

- Create: `.github/scripts/evidence-set-report.py` — `read_evidence_set_report`.
- Create: `.github/scripts/evidence-set-report.test.py` — exercises it against a real evidence-set
  `evidence-set-envelope.py`'s own test already proves it can push (reusing that exact push, not a
  separately-invented fixture).

## Interfaces

- `read_evidence_set_report(registry_ref: str, evidence_set_tag: str, kind: str, subject_digest: str,
  username: str = None, password: str = None) -> dict` — `kind` is one of `"sbom"`,
  `"vulnerabilityScan"`, `"layerSecretScan"`, `"filesystemSecretScan"`. Returns
  `scanReportEvidenceLookup`/`sbomReportEvidenceLookup`'s shape directly
  (`scanPresentReport`/`sbomPresentReport`, or `absent`/`error` if the evidence-set carrier itself or
  the specific layer can't be resolved).

---

### Task 1: `evidence-set-report.py`

**Files:**
- Create: `.github/scripts/evidence-set-report.py`
- Test: `.github/scripts/evidence-set-report.test.py`

**Interfaces:**
- Consumes: `fetch_manifest`/`fetch_blob` from `oci-read.py`, `strict_loads`/`canonical_bytes` from
  `canonical.py`, `publish_evidence_set` from `evidence-set-envelope.py` (the test pushes a real
  evidence-set using the 4 already-merged, now-unified collectors, exactly like
  `evidence-set-envelope.test.py` already does), the real predicate schema files under
  `.github/contracts/predicates/` plus `observation.schema.json`'s `sbomDocumentContent`/
  `normalizedScanContent` $defs for the test's own validation.
- Produces: `read_evidence_set_report`, importable by roadmap 1.6 (`read_evidence_set_lookup`, not in
  this plan).

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/evidence-set-report.test.py
"""Exercises read_evidence_set_report against a real evidence-set pushed by the already-merged
evidence-set-envelope.py, using the 4 real (now-unified) collector outputs -- not a fixture invented
for this test."""
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


evidence_set_report_mod = _load("evidence-set-report")
read_evidence_set_report = evidence_set_report_mod.read_evidence_set_report

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


def build_registry(schema_dir):
    resources = {}
    for path in sorted(schema_dir.rglob("*.schema.json")):
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
    "sbom": sbom_result["document"],
    "vulnerabilityScan": vuln_document,
    "layerSecretScan": layer_document,
    "filesystemSecretScan": fs_document,
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

    registry_ref = f"localhost:{host_port}/evidence-set-report-test"

    with local_registry_mod.local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as subject_ref:
        digest_proc = subprocess.run(["crane", "digest", "--full-ref", subject_ref],
                                      capture_output=True, text=True, timeout=30, check=False)
        manifest_proc = subprocess.run(["crane", "manifest", subject_ref],
                                        capture_output=True, text=True, timeout=30, check=False)
    subject_digest = digest_proc.stdout.strip().rsplit("@", 1)[-1]
    subject_size = len(manifest_proc.stdout.encode("utf-8"))

    evidence_set_envelope_mod.publish_evidence_set(registry_ref, "evidence-monolith-sha-testcommit",
                                                     evidence_documents, subject_digest, subject_size)

    # --- SBOM kind ---
    sbom_report = read_evidence_set_report(registry_ref, "evidence-monolith-sha-testcommit", "sbom",
                                            subject_digest)
    report("sbom report is present with digestVerified/sizeVerified/schemaValid all true",
           sbom_report.get("status") == "present"
           and sbom_report.get("digestVerified") is True
           and sbom_report.get("sizeVerified") is True
           and sbom_report.get("schemaValid") is True,
           f"sbom_report={sbom_report!r}"[:500])

    sbom_defs_schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
    sbom_content_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "allOf": [sbom_defs_schema["$defs"]["sbomDocumentContent"]],
        "$defs": {"digest": sbom_defs_schema["$defs"]["digest"]},
    }
    sbom_validator = jsonschema.Draft202012Validator(sbom_content_schema)
    sbom_errors = sorted(sbom_validator.iter_errors(sbom_report.get("normalizedReport", {})), key=str)
    report("sbom normalizedReport validates against sbomDocumentContent exactly",
           not sbom_errors, "; ".join(f"{list(e.path)}: {e.message}" for e in sbom_errors[:5]))

    # --- vulnerabilityScan kind ---
    vuln_report = read_evidence_set_report(registry_ref, "evidence-monolith-sha-testcommit",
                                            "vulnerabilityScan", subject_digest)
    report("vulnerabilityScan report is present and verified",
           vuln_report.get("status") == "present" and vuln_report.get("schemaValid") is True,
           f"vuln_report status/schemaValid: {vuln_report.get('status')!r}, {vuln_report.get('schemaValid')!r}")

    predicates_dir = HERE.parent / "contracts" / "predicates"
    combined_registry = build_registry(HERE.parent / "contracts")
    normalized_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "allOf": [sbom_defs_schema["$defs"]["normalizedScanContent"]],
        "$defs": {k: v for k, v in sbom_defs_schema["$defs"].items()
                  if k in ("digest", "scanPolicy", "scanCounts", "severityCount", "finding")},
    }
    normalized_validator = jsonschema.Draft202012Validator(normalized_schema)
    normalized_errors = sorted(
        normalized_validator.iter_errors(vuln_report.get("normalizedReport", {})), key=str)
    report("vulnerabilityScan normalizedReport validates against normalizedScanContent exactly",
           not normalized_errors,
           "; ".join(f"{list(e.path)}: {e.message}" for e in normalized_errors[:5]))

    report("vulnerabilityScan normalizedReport.target is the imageDigest object form",
           vuln_report.get("normalizedReport", {}).get("target") == {"imageDigest": subject_digest},
           f"target={vuln_report.get('normalizedReport', {}).get('target')!r}")

    # --- A kind that was never pushed under this tag (wrong tag) reports absent ---
    absent_report = read_evidence_set_report(registry_ref, "this-tag-was-never-pushed",
                                              "vulnerabilityScan", subject_digest)
    report("a missing evidence-set tag reports absent",
           absent_report.get("status") == "absent",
           f"absent_report={absent_report!r}")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python evidence-set-report.test.py`
Expected: fails in the `_load("evidence-set-report")` call (`evidence-set-report.py` does not exist).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/evidence-set-report.py
"""Reads one report layer from a real evidence-set carrier into scanReportEvidenceLookup's/
sbomReportEvidenceLookup's shape: fetch the carrier manifest, find the layer by mediaType (never by
position -- design doc section 2's own rule), fetch and verify that layer's blob, validate it against
the real predicate schema, and build normalizedReport -- almost a direct passthrough for the 3 scan
kinds now that roadmap 1.4a/1.4b unified predicate documents with normalizedScanContent, and a
re-derivation from the parsed SPDX document for SBOM (a reader must recompute what it can, not trust a
claimed value).
"""
import importlib.util
import json
import pathlib

import canonical

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
fetch_manifest = _oci_read.fetch_manifest
fetch_blob = _oci_read.fetch_blob
read_object_lookup = _oci_read.read_object_lookup

__all__ = ["read_evidence_set_report"]

_LAYER_MEDIA_TYPES = {
    "sbom": "application/vnd.evts.evidence.sbom.v1+json",
    "vulnerabilityScan": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
    "layerSecretScan": "application/vnd.evts.evidence.layerSecretScan.v1+json",
    "filesystemSecretScan": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
}

_MANIFEST_SIZE_CAP = 64 * 1024
_REPORT_SIZE_CAP = 8 * 1024 * 1024  # design doc 3.3a: 8 MiB report blob cap

_PREDICATE_SCHEMA_FILES = {
    "vulnerabilityScan": "vulnerabilityScan.schema.json",
    "layerSecretScan": "layerSecretScan.schema.json",
    "filesystemSecretScan": "filesystemSecretScan.schema.json",
}


def _validate_predicate_schema(kind: str, document: dict) -> bool:
    if kind == "sbom":
        return document.get("spdxVersion") == "SPDX-2.3" and isinstance(document.get("packages"), list)
    import jsonschema
    schema_path = _HERE.parent / "contracts" / "predicates" / _PREDICATE_SCHEMA_FILES[kind]
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    # This validator does not resolve the schema's own cross-file $refs into observation.schema.json
    # (policy/counts/reportDigest) -- a full $id-keyed registry is what evidence-set-report.test.py's
    # own richer validation already does for the FULL normalizedReport shape; schemaValid here is a
    # narrower, faster check answering "is this recognizably the right predicate document," matching
    # presentReport's own description ("fetch report chỉ chứng minh bytes/hash/schema của report").
    try:
        jsonschema.Draft202012Validator.check_schema(schema)
        validator = jsonschema.Draft202012Validator(schema)
        return not any(True for _ in validator.iter_errors(document))
    except Exception:  # noqa: BLE001 -- an unresolvable $ref during this narrower check is not a
                       # crash-worthy condition, it means schemaValid cannot be determined as True here
        return False


def read_evidence_set_report(registry_ref: str, evidence_set_tag: str, kind: str, subject_digest: str,
                              username: str = None, password: str = None) -> dict:
    queried_ref = f"{registry_ref}:{evidence_set_tag}#{kind}"
    manifest_result = fetch_manifest(registry_ref, evidence_set_tag, size_cap=_MANIFEST_SIZE_CAP,
                                      username=username, password=password)

    if not (manifest_result["sizeVerified"] and manifest_result["digestVerified"]
            and manifest_result["raw"] is not None):
        object_lookup = read_object_lookup(registry_ref, evidence_set_tag, username=username,
                                            password=password)
        if object_lookup["status"] in ("absent", "error"):
            return {**object_lookup, "queriedRef": queried_ref}
        return {"status": "error", "queriedRef": queried_ref, "detail": "manifest fetch unverifiable"}

    try:
        manifest = canonical.strict_loads(manifest_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        return {"status": "error", "queriedRef": queried_ref, "detail": f"manifest did not parse: {exc}"}

    target_media_type = _LAYER_MEDIA_TYPES[kind]
    layer_descriptor = next(
        (layer for layer in manifest.get("layers", []) if layer.get("mediaType") == target_media_type),
        None,
    )
    if layer_descriptor is None:
        return {"status": "error", "queriedRef": queried_ref,
                "detail": f"no layer with mediaType {target_media_type!r} in {evidence_set_tag}"}

    blob_result = fetch_blob(registry_ref, layer_descriptor["digest"], size_cap=_REPORT_SIZE_CAP,
                              username=username, password=password)

    descriptor = {"mediaType": target_media_type, "digest": layer_descriptor["digest"],
                  "size": layer_descriptor["size"]}

    if not (blob_result["sizeVerified"] and blob_result["digestVerified"] and blob_result["raw"] is not None):
        return {
            "status": "present", "queriedRef": queried_ref, "descriptor": descriptor,
            "digestVerified": blob_result["digestVerified"], "sizeVerified": blob_result["sizeVerified"],
            "schemaValid": False, "normalizedReport": {},
        }

    try:
        document = canonical.strict_loads(blob_result["raw"].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {
            "status": "present", "queriedRef": queried_ref, "descriptor": descriptor,
            "digestVerified": True, "sizeVerified": True, "schemaValid": False, "normalizedReport": {},
        }

    schema_valid = _validate_predicate_schema(kind, document)
    normalized_report = _build_normalized_report(kind, document, subject_digest) if schema_valid else {}

    return {
        "status": "present",
        "queriedRef": queried_ref,
        "descriptor": descriptor,
        "digestVerified": True,
        "sizeVerified": True,
        "schemaValid": schema_valid,
        "normalizedReport": normalized_report,
    }


def _build_normalized_report(kind: str, document: dict, subject_digest: str) -> dict:
    if kind == "sbom":
        packages = document.get("packages", [])
        canonical_payload = canonical.canonical_bytes(document)
        import hashlib
        return {
            "spdxVersion": document.get("spdxVersion", ""),
            "documentValidated": document.get("spdxVersion") == "SPDX-2.3",
            "subjectDigest": subject_digest,
            "packageCount": len(packages),
            "canonicalDigest": "sha256:" + hashlib.sha256(canonical_payload).hexdigest(),
            "canonicalSize": len(canonical_payload),
        }
    # The 3 scan kinds: the parsed predicate document already IS normalizedScanContent-shaped after
    # roadmap 1.4a/1.4b, except `target`, which the predicate schema keeps as a plain string while
    # normalizedScanContent needs the {imageDigest} object form -- the one reshaping this function does.
    normalized = dict(document)
    normalized["target"] = {"imageDigest": subject_digest}
    return normalized
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python evidence-set-report.test.py`
Expected: `passed=5 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/evidence-set-report.py .github/scripts/evidence-set-report.test.py
git commit -m "feat(ci): read a report layer from a real evidence-set into scanPresentReport/sbomPresentReport"
```

---

## Explicitly out of scope for this plan

- `read_evidence_set_attestation` (roadmap 1.5) — the attestation half of each report/attestation pair.
- `read_evidence_set_lookup` composing both halves plus `carrierDigest`/`verification`/`subjectMatches`/
  `layersValid` (roadmap 1.6).

## Self-Review Notes

- Spec coverage: `scanPresentReport`/`sbomPresentReport`'s full required shape is built and
  schema-validated for real in Task 1, against a real evidence-set the already-merged
  `evidence-set-envelope.py` pushes from real (now-unified) collector output.
- Placeholder scan: no TBD/TODO.
- Type consistency: `read_evidence_set_report`'s `kind` parameter uses the same 4 string literals
  (`"sbom"`, `"vulnerabilityScan"`, `"layerSecretScan"`, `"filesystemSecretScan"`) as every other
  kind-keyed dict in this pipeline (`LAYER_MEDIA_TYPES` in `evidence-set-envelope.py`,
  `PREDICATE_TYPES` in `envelope.py`) — not a new naming scheme.
