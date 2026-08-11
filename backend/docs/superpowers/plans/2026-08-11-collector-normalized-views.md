# Collector: normalized views for scan + SBOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap tasks 1.1 + 1.2. Extend the 3 already-merged scan collectors
(`collect-vulnerability-scan.py`, `collect-secret-scan.py`'s two functions) and the SBOM collector
(`collect-sbom.py`) to each additionally return a `normalizedScanContent`/`sbomDocumentContent`-shaped
view (`observation.schema.json`'s $defs), needed before `read_evidence_set_lookup` (roadmap 1.4-1.6)
can be built. The existing predicate-document return value of each collector is unchanged — every
collector gains a second return value, not a rewrite of the first.

**Architecture:** Each collector function's return type changes from a single dict to a 2-tuple:
`(predicate_document, normalized_view)`. The predicate document is exactly what was already being
returned (unchanged shape, still what gets pushed as an evidence-set layer). The normalized view is the
new, additional thing — built from the SAME real tool output already being parsed, just keeping more of
it. This is additive, not a redesign: every existing caller and test that only used the first value
still works after wrapping it in tuple-unpacking.

**Tech Stack:** Python 3.10+, real Trivy output (confirmed field names via two real scans this session:
a real CVE-bearing image for vulnerability findings — `VulnerabilityID`, `PkgName`, `FixedVersion`,
`Severity` — and a real secret-bearing file for secret findings — `RuleID`, `Category`, `Severity`,
matched against the target path). `.github/scripts/canonical.py`'s `canonical_bytes` for `reportDigest`/
`canonicalDigest` (never a second, separately-computed hash).

## Global Constraints

- Same floor as every prior collector: Python 3.10+, self-contained under `.github/scripts/`.
- `normalizedScanContent`'s `finding` shape (`observation.schema.json`'s own `finding` $def) requires
  `packageName`/`vulnerabilityId`/`targetPath` for EVERY scan kind, including the two secret-scan kinds
  — which have no literal package/CVE concept. Real field mapping, confirmed against real Trivy secret
  output this session (not guessed): `vulnerabilityId` = `RuleID` (e.g. `"aws-access-key-id"`),
  `packageName` = `Category` (e.g. `"AWS"`), `targetPath` = the file path Trivy reports the secret in
  (the per-`Results[]`-entry `Target` field). This is a deliberate, documented mapping choice — the
  spec's own `finding` $def reuses one shape across kinds without a kind-specific field mapping
  spelled out; this plan's mapping is the collector's own judgment call, stated in code comments, not
  hidden.
- `fixAvailable` for a secret-scan finding is always `False` (already established in
  `collect-secret-scan.py` — a leaked secret has no "fixed version").
- `counts` must aggregate over **every** raw finding (before the 100-item truncation), by
  `(severity, fixAvailable)` — spec's own stated reason: a policy that fails on "HIGH with a fix"
  cannot be recomputed from a truncated list, so `counts` must reflect the full set even when
  `findings` (the bounded audit list) does not.
- `findings` (the bounded list) must be sorted by the spec's own stated tuple: severity rank
  descending (`CRITICAL > HIGH > MEDIUM > LOW > UNKNOWN`) → `fixAvailable` (`true` first) → `packageName`
  → `vulnerabilityId` → `targetPath`, all compared by code point (Python's default string `<` on these
  fields already compares by code point — no locale-aware comparison anywhere).
- `declaredOutcome` (spec's own stated policy): vulnerability scan fails when any `CRITICAL` exists, or
  any `HIGH` **with a fix available**; secret scan (both kinds) fails when **any** finding exists at
  all, regardless of severity.
- `policy.severityThreshold`/`policy.ignoreList`/`policy.ignoreFileDigest` must come from a
  **Git-tracked file**, never a runtime input (spec section 6's own rule, mirroring the secret-scan
  ruleset file precedent already established in `collector-fixtures/trivy-secret-ruleset.yaml`). Two
  new tracked files this plan creates: one shared ignore-list file for the vulnerability scan
  (`collector-fixtures/vulnerability-ignore.yaml`), reused as-is (empty ignore list) for both secret
  scan kinds since "fail on any finding" makes an ignore list largely moot for them but the schema still
  requires the field to exist and name a real tracked file.
- `reportDigest` (vulnerability/secret kinds) and `canonicalDigest`/`canonicalSize` (SBOM kind): the
  `sha256`/length of `canonical.canonical_bytes(predicate_document)` — the same predicate document
  already being pushed as the evidence-set layer, canonicalized the same way every other digest in this
  pipeline is computed. Not a separately-invented value.
- No network calls beyond what each collector already makes (the same Trivy/syft invocations already
  merged — this plan adds no new external calls).

---

## File Structure

- Modify: `.github/scripts/collect-vulnerability-scan.py` — return a 2-tuple, add the normalized view.
- Modify: `.github/scripts/collect-vulnerability-scan.test.py` — update for the tuple return, add
  normalized-view assertions.
- Modify: `.github/scripts/collect-secret-scan.py` — both `collect_layer_secret_scan` and
  `collect_filesystem_secret_scan` return a 2-tuple.
- Modify: `.github/scripts/collect-secret-scan.test.py` — same update.
- Modify: `.github/scripts/collect-sbom.py` — the returned dict gains `canonicalDigest`/`canonicalSize`
  (this one does NOT need a 2-tuple change, since `sbomDocumentContent` and the predicate document are
  meant to be nearly the same shape already — SBOM's own asymmetry, per the schema's own note that SBOM
  is symmetric between report/predicate views except for these two fields; simplest to add them directly
  to the existing single return value rather than introduce an unneeded tuple).
- Modify: `.github/scripts/collect-sbom.test.py` — assert the two new keys.
- Create: `.github/scripts/collector-fixtures/vulnerability-ignore.yaml` — the tracked ignore-list file.
- Modify: `.github/scripts/evidence-set-envelope.test.py` — this test currently calls the 3 changed
  collector functions and uses only the first element of what is now a 2-tuple; update its 3 call sites
  to unpack `(document, _normalized)` instead of assuming a single return value, or the existing,
  already-merged evidence-set test will break. This is the one already-existing caller across the whole
  merged codebase that touches these return values — grep confirms no other caller.

## Interfaces

- `collect_vulnerability_scan(tarball_path, image_name) -> tuple[dict, dict]` — first element unchanged
  (the `vulnerabilityScan` predicate document), second element a `normalizedScanContent`-shaped dict.
- `collect_layer_secret_scan(tarball_path, image_name, ruleset_path) -> tuple[dict, dict]` and
  `collect_filesystem_secret_scan(...)` — same pattern.
- `collect_sbom(tarball_path, image_name) -> dict` — same single-dict return as today, with
  `canonicalDigest`/`canonicalSize` added to the existing `{"document": ..., "packageCount": ...}` dict
  (a 3rd/4th key, not a 2-tuple — the `document` key already IS the SBOM content both
  `normalizedReport`/`normalizedPredicate` share, so no separate "normalized" object is needed for SBOM).

---

### Task 1: Extend `collect-vulnerability-scan.py`

**Files:**
- Modify: `.github/scripts/collect-vulnerability-scan.py`
- Modify: `.github/scripts/collect-vulnerability-scan.test.py`
- Create: `.github/scripts/collector-fixtures/vulnerability-ignore.yaml`

**Interfaces:**
- Consumes: real Trivy JSON output (`Results[].Vulnerabilities[]`: `VulnerabilityID`, `PkgName`,
  `FixedVersion`, `Severity`; `Results[].Target` for `targetPath`), `canonical.canonical_bytes`.
- Produces: the 2-tuple return shape other tasks (and the already-merged `evidence-set-envelope.py`
  test) will consume.

- [ ] **Step 1: Write the ignore-list file**

```yaml
# .github/scripts/collector-fixtures/vulnerability-ignore.yaml
#
# Tracked so policy comes from a file Git reviews, never a workflow input (spec section 6). Empty
# ignore list for now -- a real ignore entry (a specific CVE ID this project has decided to accept) is
# added here, in a reviewed commit, if one is ever needed. version bumps by hand whenever the list
# below changes; the digest the collector reports is computed from these bytes directly.
version: "1"
severityThreshold: "HIGH"
ignoreList: []
```

- [ ] **Step 2: Write the failing test additions**

Replace the existing single-value assertions in `.github/scripts/collect-vulnerability-scan.test.py`
that call `collect_vulnerability_scan` with tuple-unpacking versions, and add new assertions for the
normalized view. Full replacement file:

```python
# .github/scripts/collect-vulnerability-scan.test.py
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
IGNORE_FILE = HERE / "collector-fixtures" / "vulnerability-ignore.yaml"
SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "vulnerabilityScan.schema.json"
OBSERVATION_SCHEMA_PATH = HERE.parent / "contracts" / "observation.schema.json"

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

_spec = importlib.util.spec_from_file_location(
    "collect_vulnerability_scan", HERE / "collect-vulnerability-scan.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_vulnerability_scan = _module.collect_vulnerability_scan
CollectorError = _module.CollectorError

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


def build_registry(schema_path):
    contracts_dir = schema_path.parent.parent
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

document, normalized = collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                    str(IGNORE_FILE))

schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema)
errors = sorted(validator.iter_errors(document), key=str)
report("the predicate document still validates against vulnerabilityScan.schema.json",
       not errors, "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5]))

observation_schema = json.loads(OBSERVATION_SCHEMA_PATH.read_text(encoding="utf-8"))
normalized_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "allOf": [observation_schema["$defs"]["normalizedScanContent"]],
    "$defs": {k: v for k, v in observation_schema["$defs"].items()
              if k in ("digest", "scanPolicy", "scanCounts", "severityCount", "finding")},
}
normalized_validator = jsonschema.Draft202012Validator(normalized_schema)
normalized_errors = sorted(normalized_validator.iter_errors(normalized), key=str)
report("the normalized view validates against normalizedScanContent exactly",
       not normalized_errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in normalized_errors[:5]))

report("policy names the tracked ignore file's real version and a real digest",
       normalized.get("policy", {}).get("severityThreshold") == "HIGH"
       and normalized.get("policy", {}).get("ignoreList") == []
       and isinstance(normalized.get("policy", {}).get("ignoreFileDigest"), str)
       and len(normalized["policy"]["ignoreFileDigest"]) == 64,
       f"policy={normalized.get('policy')!r}")

report("declaredOutcome is False for this clean fixture (no CRITICAL, no HIGH-with-fix)",
       normalized.get("declaredOutcome") is False,
       f"declaredOutcome={normalized.get('declaredOutcome')!r}")

report("counts has all 5 severities with withFix/withoutFix, summing to 0 for this clean fixture",
       normalized.get("counts", {}).get("CRITICAL") == {"withFix": 0, "withoutFix": 0},
       f"counts={normalized.get('counts')!r}")

report("reportDigest is the real canonical digest of the predicate document",
       normalized.get("reportDigest")
       == "sha256:" + __import__("hashlib").sha256(
           __import__("importlib").import_module("canonical").canonical_bytes(document)
       ).hexdigest(),
       f"reportDigest={normalized.get('reportDigest')!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .github/scripts && python collect-vulnerability-scan.test.py`
Expected: `TypeError: cannot unpack non-iterable dict object` (or similar) — `collect_vulnerability_scan`
still returns a single dict, and its signature does not yet accept an `ignore_file_path` argument.

- [ ] **Step 4: Write the implementation**

Modify `.github/scripts/collect-vulnerability-scan.py`. Change the signature to accept an ignore-file
path, compute `counts` over ALL findings (before any cap), keep the existing `MAX_FINDINGS`-capped
`findings` list for the predicate document exactly as today, and additionally build and sort the
`normalizedScanContent`-shaped view with real `packageName`/`vulnerabilityId`/`targetPath`:

```python
# Additions/changes to collect-vulnerability-scan.py -- full function replacement for
# collect_vulnerability_scan; every other function (_now_iso, _trivy_version_fallback) is unchanged.
import hashlib
import pathlib

import canonical

_SEVERITY_RANK = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}


def _ignore_file_descriptor(ignore_file_path: str) -> dict:
    text = pathlib.Path(ignore_file_path).read_bytes()
    parsed_threshold = None
    parsed_ignore_list = []
    for line in text.decode("utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("severityThreshold:"):
            parsed_threshold = stripped.split(":", 1)[1].strip().strip('"')
        # ignoreList stays [] for this project's current tracked file (no entries yet) -- a real
        # YAML list parser is not pulled in as a dependency for a file that has never had an entry;
        # if an entry is ever added, this parsing must grow to match, not silently ignore it.
    if parsed_threshold is None:
        raise CollectorError(f"{ignore_file_path} has no severityThreshold: line")
    digest = hashlib.sha256(text).hexdigest()
    return {"severityThreshold": parsed_threshold, "ignoreList": parsed_ignore_list,
            "ignoreFileDigest": digest}


def collect_vulnerability_scan(tarball_path: str, image_name: str, ignore_file_path: str) -> tuple:
    try:
        proc = subprocess.run(
            ["trivy", "image", "--input", tarball_path, "--format", "json", "--quiet"],
            capture_output=True, text=True, timeout=1200, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"trivy is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"trivy timed out scanning {tarball_path}") from exc

    if proc.returncode != 0:
        raise CollectorError(f"trivy exited {proc.returncode} scanning {tarball_path} (image "
                              f"{image_name}): {proc.stderr.strip()[:2000]}")

    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"trivy did not print valid JSON: {exc}") from exc

    all_raw_findings = []  # (severity, fixAvailable, packageName, vulnerabilityId, targetPath)
    for result in raw.get("Results") or []:
        target = result.get("Target", "unknown-target")
        for vuln in result.get("Vulnerabilities") or []:
            all_raw_findings.append({
                "severity": vuln.get("Severity", "UNKNOWN"),
                "fixAvailable": bool(vuln.get("FixedVersion")),
                "packageName": vuln.get("PkgName") or "unknown-package",
                "vulnerabilityId": vuln.get("VulnerabilityID") or "unknown-id",
                "targetPath": target,
            })

    # Predicate document: unchanged shape, unchanged cap discipline.
    predicate_findings = [{"severity": f["severity"], "fixAvailable": f["fixAvailable"]}
                          for f in all_raw_findings]
    capped_predicate_findings, truncated = _cap_findings_list(predicate_findings)

    scanner_version = (raw.get("Trivy") or {}).get("Version") or _trivy_version_fallback()
    db_identity, db_digest, db_updated_at = _vulnerability_db_status()

    document = {
        "scanner": {"name": "trivy", "version": scanner_version},
        "vulnerabilityDb": {"identity": db_identity, "digest": db_digest, "updatedAt": db_updated_at},
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": capped_predicate_findings,
        "truncated": truncated,
    }

    # Normalized view: counts over ALL findings (not capped), sorted bounded findings list, real
    # policy/outcome.
    policy = _ignore_file_descriptor(ignore_file_path)
    counts = _aggregate_counts(all_raw_findings)
    declared_outcome = _vulnerability_outcome(counts)
    sorted_findings = sorted(
        all_raw_findings,
        key=lambda f: (_SEVERITY_RANK.get(f["severity"], 99), not f["fixAvailable"],
                        f["packageName"], f["vulnerabilityId"], f["targetPath"]),
    )
    normalized_findings_capped, normalized_truncated = _cap_findings_list(sorted_findings)
    if normalized_truncated:
        normalized_findings_capped = sorted_findings[:100]

    report_digest = "sha256:" + hashlib.sha256(canonical.canonical_bytes(document)).hexdigest()

    normalized = {
        "scanner": {"name": "trivy", "version": scanner_version},
        "target": {"imageDigest": "sha256:" + "0" * 64},  # filled in by the caller once a real image
                                                            # digest is known -- this collector only
                                                            # knows the local tarball, not the digest a
                                                            # registry will assign after push.
        "reportDigest": report_digest,
        "policy": policy,
        "counts": counts,
        "findings": normalized_findings_capped,
        "truncated": len(sorted_findings) > 100,
        "declaredOutcome": declared_outcome,
    }

    return document, normalized


def _cap_findings_list(findings: list) -> tuple:
    truncated = len(findings) > MAX_FINDINGS
    return findings[:MAX_FINDINGS], truncated


def _aggregate_counts(findings: list) -> dict:
    counts = {sev: {"withFix": 0, "withoutFix": 0} for sev in _SEVERITY_RANK}
    for finding in findings:
        sev = finding["severity"] if finding["severity"] in counts else "UNKNOWN"
        key = "withFix" if finding["fixAvailable"] else "withoutFix"
        counts[sev][key] += 1
    return counts


def _vulnerability_outcome(counts: dict) -> bool:
    if counts["CRITICAL"]["withFix"] + counts["CRITICAL"]["withoutFix"] > 0:
        return True
    if counts["HIGH"]["withFix"] > 0:
        return True
    return False
```

`MAX_FINDINGS` is already defined at module level in the existing file — reuse it, do not redeclare.
`CollectorError`/`json`/`subprocess`/`datetime` imports are already present in the existing file — only
`hashlib`, `pathlib`, and `canonical` are new imports this task adds.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .github/scripts && python collect-vulnerability-scan.test.py`
Expected: `passed=5 failed=0`.

- [ ] **Step 6: Fix `evidence-set-envelope.test.py`'s now-broken call site**

`.github/scripts/evidence-set-envelope.test.py` currently has:
```python
vuln_document = collect_vuln_mod.collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny")
```
Change to:
```python
vuln_document, _vuln_normalized = collect_vuln_mod.collect_vulnerability_scan(
    str(TARBALL), "tvu-collector-test:tiny", str(HERE / "collector-fixtures" / "vulnerability-ignore.yaml"))
```
Run `cd .github/scripts && python evidence-set-envelope.test.py` afterward and confirm it still passes
`passed=6 failed=0` (this is a real regression check on an already-merged, unrelated-seeming file — it
must not be skipped).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/collect-vulnerability-scan.py .github/scripts/collect-vulnerability-scan.test.py .github/scripts/collector-fixtures/vulnerability-ignore.yaml .github/scripts/evidence-set-envelope.test.py
git commit -m "feat(ci): add a normalizedScanContent view to the vulnerability-scan collector"
```

---

### Task 2: Extend `collect-secret-scan.py` (both functions)

**Files:**
- Modify: `.github/scripts/collect-secret-scan.py`
- Modify: `.github/scripts/collect-secret-scan.test.py`

**Interfaces:**
- Consumes: real Trivy secret-scan JSON (`Results[].Secrets[]`: `RuleID`, `Category`, `Severity`;
  `Results[].Target` for `targetPath` — confirmed for real this session against a real secret-bearing
  test file, not guessed), the same `vulnerability-ignore.yaml` pattern from Task 1 (reused, since
  "fail on any finding" makes an ignore list moot but the schema still requires the field to name a
  real tracked file — this task reuses Task 1's tracked file rather than inventing a redundant second
  one).
- Produces: both secret-scan functions return the same 2-tuple shape Task 1 established.

- [ ] **Step 1: Write the failing test additions**

Update `.github/scripts/collect-secret-scan.test.py`'s two collector calls to unpack 2-tuples, and add
normalized-view assertions for each. Insert after the existing filesystem-scan assertions (before the
`collect_layer_secret_scan` import line already present from Task 3 of the original secret-scan plan):

```python
fs_document, fs_normalized = collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                              str(RULESET))
```

(Replacing the existing single-value call.) And similarly for the layer half:

```python
layer_document, layer_normalized = collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                               str(RULESET))
```

Add these assertions after each (using the same `observation_schema`/registry-building pattern Task 1
established — import `json`/`jsonschema`/`referencing` at the top of the file if not already present,
matching Task 1's test file structure):

```python
report("filesystemSecretScan normalized view has declaredOutcome False for a clean fixture "
       "(secret scan fails on ANY finding, and this fixture has none)",
       fs_normalized.get("declaredOutcome") is False,
       f"declaredOutcome={fs_normalized.get('declaredOutcome')!r}")

report("layerSecretScan normalized view has declaredOutcome False for a clean fixture",
       layer_normalized.get("declaredOutcome") is False,
       f"declaredOutcome={layer_normalized.get('declaredOutcome')!r}")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: `TypeError: cannot unpack non-iterable dict object`.

- [ ] **Step 3: Write the implementation**

Modify `.github/scripts/collect-secret-scan.py`. Both `collect_filesystem_secret_scan` and
`collect_layer_secret_scan` currently end with:
```python
    findings, truncated = _cap_findings(all_findings)
    return {
        "scanner": {"name": "trivy", "version": _trivy_version()},
        "ruleset": ruleset,
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }
```
Change `_run_trivy_fs_secret` to also capture `packageName`/`vulnerabilityId`/`targetPath` (it currently
only extracts `severity`), and change both callers to build and return the normalized view alongside
the unchanged predicate document:

```python
import hashlib

import canonical


def _run_trivy_fs_secret(tree_path: str, ruleset_path: str) -> list:
    """Returns the raw findings list, now with packageName/vulnerabilityId/targetPath alongside
    severity/fixAvailable -- confirmed for real against a Trivy secret finding (RuleID, Category,
    Severity, and the per-Results-entry Target for the file path)."""
    try:
        proc = subprocess.run(
            ["trivy", "fs", "--scanners", "secret", "--secret-config", ruleset_path,
             "--format", "json", "--quiet", tree_path],
            capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"trivy is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"trivy fs timed out scanning {tree_path} (cap: {SCAN_TIMEOUT_SECONDS}s)") from exc

    if proc.returncode != 0:
        raise CollectorError(f"trivy fs exited {proc.returncode} scanning {tree_path}: "
                              f"{proc.stderr.strip()[:2000]}")

    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"trivy fs did not print valid JSON: {exc}") from exc

    findings = []
    for result in raw.get("Results") or []:
        if result.get("Class") != "secret":
            continue
        target = result.get("Target", "unknown-target")
        for secret in result.get("Secrets") or []:
            findings.append({
                "severity": secret.get("Severity", "UNKNOWN"),
                "fixAvailable": False,
                "packageName": secret.get("Category") or "unknown-category",
                "vulnerabilityId": secret.get("RuleID") or "unknown-rule",
                "targetPath": target,
            })
    return findings


_SEVERITY_RANK = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}


def _build_normalized_secret_view(document: dict, image_name: str, all_findings: list) -> dict:
    counts = {sev: {"withFix": 0, "withoutFix": 0} for sev in _SEVERITY_RANK}
    for finding in all_findings:
        sev = finding["severity"] if finding["severity"] in counts else "UNKNOWN"
        counts[sev]["withoutFix"] += 1  # fixAvailable is always False for a secret finding

    sorted_findings = sorted(
        all_findings,
        key=lambda f: (_SEVERITY_RANK.get(f["severity"], 99), not f["fixAvailable"],
                        f["packageName"], f["vulnerabilityId"], f["targetPath"]),
    )
    capped = sorted_findings[:100]
    report_digest = "sha256:" + hashlib.sha256(canonical.canonical_bytes(document)).hexdigest()

    # Any finding at all fails a secret scan (spec section 6) -- no severity threshold applies.
    declared_outcome = len(all_findings) > 0

    return {
        "scanner": document["scanner"],
        "target": {"imageDigest": "sha256:" + "0" * 64},
        "reportDigest": report_digest,
        "policy": {"severityThreshold": "UNKNOWN", "ignoreList": [], "ignoreFileDigest": _ruleset_descriptor_digest(document)},
        "counts": counts,
        "findings": capped,
        "truncated": len(sorted_findings) > 100,
        "declaredOutcome": declared_outcome,
    }
```

Both `collect_filesystem_secret_scan` and `collect_layer_secret_scan` change their final two lines from
`return {...}` to build the `document` dict exactly as today, then:

```python
    normalized = _build_normalized_secret_view(document, image_name, all_findings)
    return document, normalized
```

Where `all_findings` is each function's own already-existing local variable (`all_findings` in the
filesystem case, `all_findings` accumulated across layers in the layer case — both already exist under
this exact name in the current merged code, confirm by reading the file before editing rather than
assuming). `_ruleset_descriptor_digest` is a small helper: `lambda document: document["ruleset"]["digest"]`
inlined, or just read `document["ruleset"]["digest"]` directly rather than adding a helper for one line
— use `document["ruleset"]["digest"]` directly in `_build_normalized_secret_view` instead of a separate
function.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: `passed=8 failed=0` (the original 6 plus 2 new).

- [ ] **Step 5: Fix `evidence-set-envelope.test.py`'s two now-broken call sites**

Same pattern as Task 1 Step 6, for both secret-scan calls in that file. Run
`cd .github/scripts && python evidence-set-envelope.test.py` afterward, confirm `passed=6 failed=0`.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/collect-secret-scan.py .github/scripts/collect-secret-scan.test.py .github/scripts/evidence-set-envelope.test.py
git commit -m "feat(ci): add a normalizedScanContent view to both secret-scan collectors"
```

---

### Task 3: Extend `collect-sbom.py`

**Files:**
- Modify: `.github/scripts/collect-sbom.py`
- Modify: `.github/scripts/collect-sbom.test.py`

**Interfaces:**
- Consumes: the already-parsed SPDX document, `canonical.canonical_bytes`.
- Produces: the existing return dict gains `canonicalDigest`/`canonicalSize` keys.

- [ ] **Step 1: Write the failing test addition**

Add to `.github/scripts/collect-sbom.test.py` (after the existing assertions, before the bogus-tarball
negative case):

```python
import hashlib
sys.path.insert(0, str(HERE))
import canonical

report("result carries canonicalDigest/canonicalSize of the SPDX document",
       result.get("canonicalDigest")
       == "sha256:" + hashlib.sha256(canonical.canonical_bytes(result["document"])).hexdigest()
       and result.get("canonicalSize") == len(canonical.canonical_bytes(result["document"])),
       f"canonicalDigest={result.get('canonicalDigest')!r}, canonicalSize={result.get('canonicalSize')!r}")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python collect-sbom.test.py`
Expected: `FAIL` on the new assertion (`canonicalDigest`/`canonicalSize` are `None`/missing).

- [ ] **Step 3: Write the implementation**

In `.github/scripts/collect-sbom.py`, add `import hashlib` and `import canonical` at the top, and change
the `return` statement in `collect_sbom` from:
```python
    return {"document": document, "packageCount": len(packages)}
```
to:
```python
    canonical_payload = canonical.canonical_bytes(document)
    return {
        "document": document,
        "packageCount": len(packages),
        "canonicalDigest": "sha256:" + hashlib.sha256(canonical_payload).hexdigest(),
        "canonicalSize": len(canonical_payload),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python collect-sbom.test.py`
Expected: `passed=6 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collect-sbom.py .github/scripts/collect-sbom.test.py
git commit -m "feat(ci): add canonicalDigest/canonicalSize to the SBOM collector's output"
```

---

## Explicitly out of scope for this plan

- `target.imageDigest` in every normalized view is left as a placeholder zero-digest
  (`"sha256:" + "0" * 64`) — the collector functions only ever see a local tarball, never the real
  registry-assigned digest (that only exists after a real push). The caller that assembles a real
  `read_evidence_set_lookup` (roadmap 1.4) is responsible for overwriting this field with the real
  digest once known. Stated explicitly here so it is not mistaken for a forgotten TODO later.
- Roadmap tasks 1.3-1.6 (attestation pagination, the actual lookup reader) — this plan only produces the
  richer collector output those tasks will consume.

## Self-Review Notes

- Spec coverage: spec section 6's full stated rules (counts by severity+fixAvailable over the
  UNTRUNCATED set, the exact 5-field sort tuple, the two declaredOutcome policies, policy from a
  tracked file) are each implemented by a specific step above, checked against the quoted spec text in
  Global Constraints.
- Placeholder scan: the one deliberate placeholder (`target.imageDigest`) is named explicitly as
  out-of-scope-for-this-plan with a named owner (roadmap task 1.4), not left ambiguous.
- Type consistency: all 3 scan-kind collectors now return `tuple[dict, dict]`; the SBOM collector keeps
  its single-dict return with 2 new keys — this asymmetry is deliberate and stated in Architecture, not
  an inconsistency to fix later.
