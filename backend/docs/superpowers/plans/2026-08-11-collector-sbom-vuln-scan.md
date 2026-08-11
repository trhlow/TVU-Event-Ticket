# Collector: SBOM + vulnerability scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a built container image (as a `docker save` tarball, not a live daemon tag — matches
"the byte that was tested is the byte that ships", design doc §3.0), produce two real, schema-valid
documents: an SPDX 2.3 SBOM and a `vulnerabilityScan` predicate, using the exact tools the predicate
schemas already pin (syft for SBOM format, Trivy for vulnerability scanning — NOT grype, corrected in
`backend/docs/superpowers/specs/2026-08-11-collector-publish-job-design.md` §3.2 after the first draft
picked the wrong tool).

**Architecture:** Two independent Python scripts under `.github/scripts/`, each callable standalone
(`python collect-sbom.py <tarball> <image-name>`), following the existing `envelope.py`/`canonical.py`
pattern of small, directly-importable, directly-testable modules rather than bash-wrapping everything.
Each script shells out to its one tool, parses the tool's real JSON output, and either writes a
schema-valid document to stdout or raises with a clear message. Two matching test files exercise them
against a real, tiny image built locally — no mocked tool output, because a mock can't tell you the
real tool changed its JSON shape.

**Tech Stack:** Python 3.10+ (matches `python-bin.sh`'s floor), `syft` 1.51.0, `trivy` 0.73.0 (both
installed locally via `scoop install syft trivy` — confirm with `syft version` / `trivy --version`
before starting), Docker (for building the tiny test image and producing its tarball), `jsonschema` +
`referencing` (already a dependency of this test suite, see `manifest-agreement.test.sh`'s own import).

## Global Constraints

- `mvn`/backend build is irrelevant here; this is `.github/scripts/`, same directory and Python floor
  as `publish-decision.sh` and friends (Python 3.10+, `PYTHON_BIN` env var overrides `python3` default
  on Windows — see `.github/scripts/python-bin.sh`).
- Every new script must be runnable from a clean checkout with only `.github/scripts/` beside it (the
  mutation runner's own constraint, documented at the top of `manifest-agreement.test.sh`) — do not
  import anything outside `.github/scripts/`.
- `PREDICATE_TYPES["sbom"] = "https://spdx.dev/Document/v2.3"` and
  `PREDICATE_TYPES["vulnerabilityScan"] = "https://evts.id.vn/attestations/vulnerabilityScan/v1"` are
  already defined in `.github/scripts/envelope.py` — import them, do not redeclare the URIs as string
  literals in the new scripts.
- The vulnerabilityScan predicate must validate against
  `.github/contracts/predicates/vulnerabilityScan.schema.json` exactly: `required: [scanner,
  vulnerabilityDb, target, timestamp, findings, truncated]`, `additionalProperties: false`. Every field
  not in that list must not appear.
- `findings` cap: 100 items, then `truncated: true` (design doc §3.3a, spec
  `evidence-verification-contract-design.md:343`). If Trivy reports more than 100 findings, truncate to
  the first 100 by the order Trivy emits them and set `truncated: true`; if 100 or fewer, `truncated:
  false`.
- Canonical JSON writing anywhere a digest is computed over a document must use
  `.github/scripts/canonical.py`'s `canonical_bytes` — never `json.dumps` directly — to stay consistent
  with the digest scheme `publish-decision.sh` already reads.
- No network calls other than the tool invocations themselves (`syft`, `trivy`) and `docker build`/
  `docker save` for the test fixture image. No calls to GHCR, no secrets, no `.env` file.

---

## File Structure

- Create: `.github/scripts/collect-sbom.py` — wraps syft, emits the SPDX document + a `packageCount`.
- Create: `.github/scripts/collect-vulnerability-scan.py` — wraps Trivy, emits the
  `vulnerabilityScan` predicate document.
- Create: `.github/scripts/collect-sbom.test.py` — exercises `collect-sbom.py` against a real tiny
  image.
- Create: `.github/scripts/collect-vulnerability-scan.test.py` — exercises
  `collect-vulnerability-scan.py` against the same image.
- Create: `.github/scripts/collector-fixtures/Dockerfile.tiny-test-image` — a minimal, deterministic
  Dockerfile the tests build locally (not pulled from a registry, so the suite works offline after the
  base image is cached once).

## Interfaces

- `collect-sbom.py` exposes a function `collect_sbom(tarball_path: str, image_name: str) -> dict`
  returning `{"document": <full SPDX JSON dict>, "packageCount": int}`. Raises `CollectorError` (defined
  in the same module) with a human-readable message on any tool failure, non-JSON output, or a
  `spdxVersion` that isn't `SPDX-2.3`.
- `collect-vulnerability-scan.py` exposes `collect_vulnerability_scan(tarball_path: str, image_name:
  str) -> dict` returning a document that validates against
  `.github/contracts/predicates/vulnerabilityScan.schema.json` verbatim. Raises the same
  `CollectorError` shape (each module defines its own `CollectorError` — they do not share a base
  module, matching this directory's existing pattern of small independent files, e.g. `envelope.py` and
  `canonical.py` do not import each other's exception types).
- Both scripts are also runnable as `python collect-sbom.py <tarball> <image-name>`, printing the
  returned dict as canonical JSON to stdout — this is how the assembler script (a later task, not this
  plan) will invoke them as subprocesses if it chooses to, though within-process import is preferred
  where possible.

---

### Task 1: Build a real, tiny, deterministic test image

**Files:**
- Create: `.github/scripts/collector-fixtures/Dockerfile.tiny-test-image`

**Interfaces:**
- Consumes: nothing (this is the fixture the later tasks' tests depend on).
- Produces: a Docker image taggable as `tvu-collector-test:tiny`, and a `docker save` tarball at
  `.github/scripts/collector-fixtures/tiny-test-image.tar` (gitignored — see Step 4).

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# .github/scripts/collector-fixtures/Dockerfile.tiny-test-image
#
# Deliberately not FROM scratch: syft and Trivy both need *some* package manager metadata to have
# anything to report, and an empty SBOM would not exercise packageCount >= 1 or give Trivy a package
# to have a known vulnerability against. alpine:3.18 is old enough to have at least one known CVE in
# its base packages as of 2026, which is what makes this fixture actually exercise the findings path
# instead of only the empty-findings path.
FROM alpine:3.18
RUN echo "tiny fixture image for collector tests" > /fixture-marker.txt
```

- [ ] **Step 2: Build it**

Run: `docker build -t tvu-collector-test:tiny -f .github/scripts/collector-fixtures/Dockerfile.tiny-test-image .github/scripts/collector-fixtures`
Expected: `Successfully tagged tvu-collector-test:tiny` (or the buildkit equivalent final line).

- [ ] **Step 3: Save it to a tarball**

Run: `docker save tvu-collector-test:tiny -o .github/scripts/collector-fixtures/tiny-test-image.tar`
Expected: exits 0, file exists.
Verify: `ls -la .github/scripts/collector-fixtures/tiny-test-image.tar` shows a non-empty file (several
MB — alpine:3.18 base layer).

- [ ] **Step 4: gitignore the tarball, keep the Dockerfile**

The tarball is a multi-MB local build artifact, not source — it must never be committed. Check
`.gitignore` for an existing pattern; if none covers `*.tar` under `.github/scripts/collector-fixtures/`,
add one:

```gitignore
# Local-only: collector test fixture images, rebuilt by the test suite, never committed.
.github/scripts/collector-fixtures/*.tar
```

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collector-fixtures/Dockerfile.tiny-test-image .gitignore
git commit -m "test(ci): add a tiny deterministic image fixture for collector tests"
```

---

### Task 2: `collect-sbom.py` — SBOM via syft

**Files:**
- Create: `.github/scripts/collect-sbom.py`
- Test: `.github/scripts/collect-sbom.test.py`

**Interfaces:**
- Consumes: the tarball from Task 1 (`.github/scripts/collector-fixtures/tiny-test-image.tar`), `syft`
  on PATH.
- Produces: `collect_sbom(tarball_path, image_name) -> dict` as specified above, importable by Task 3's
  assembler (a later plan) and by this task's own test.

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/collect-sbom.test.py
"""Exercises collect-sbom.py against a real image, not a mocked syft. A mock cannot tell you syft
changed its own output shape between versions -- the whole point of this test is to catch that."""
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"

sys.path.insert(0, str(HERE))
from collect_sbom import collect_sbom, CollectorError  # noqa: E402

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run Task 1's docker build/save first)", False,
           f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

result = collect_sbom(str(TARBALL), "tvu-collector-test:tiny")

report("collect_sbom returns a dict with document and packageCount",
       isinstance(result, dict) and "document" in result and "packageCount" in result,
       f"got {result!r}" if not isinstance(result, dict) else "")

document = result.get("document", {})
report("document declares SPDX-2.3",
       document.get("spdxVersion") == "SPDX-2.3",
       f"spdxVersion={document.get('spdxVersion')!r}")

report("packageCount is a positive int (alpine:3.18 has real packages)",
       isinstance(result.get("packageCount"), int) and result["packageCount"] > 0,
       f"packageCount={result.get('packageCount')!r}")

report("document.packages length matches packageCount",
       len(document.get("packages", [])) == result.get("packageCount"),
       f"{len(document.get('packages', []))} != {result.get('packageCount')}")

# Negative case: a tarball that is not a valid docker-archive must raise CollectorError, not crash
# with a bare subprocess traceback -- a caller (the observation assembler) needs a catchable failure.
bogus = HERE / "collector-fixtures" / "not-a-real-tarball.tar"
bogus.write_bytes(b"not a tarball")
try:
    collect_sbom(str(bogus), "does-not-matter")
    report("a bogus tarball raises CollectorError", False, "no exception was raised")
except CollectorError:
    report("a bogus tarball raises CollectorError", True)
except Exception as exc:  # noqa: BLE001
    report("a bogus tarball raises CollectorError", False, f"raised {type(exc).__name__} instead")
finally:
    bogus.unlink()

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python collect-sbom.test.py`
Expected: `ModuleNotFoundError: No module named 'collect_sbom'` (the file is named
`collect-sbom.py` with a hyphen; Python cannot import a hyphenated module name directly — Step 3 must
account for this, see the note in Step 3).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/collect-sbom.py
"""Wraps syft to produce an SPDX 2.3 SBOM from a docker-archive tarball.

Reads from a tarball, not a live image tag, because the tarball is the artifact the CI job already
built and tested (design doc section 3.0: the byte that was tested is the byte that ships) -- pulling
by tag would risk syft resolving a different image than the one under test if the daemon's tag moved
between build and collect.
"""
import json
import subprocess

__all__ = ["collect_sbom", "CollectorError"]


class CollectorError(Exception):
    pass


def collect_sbom(tarball_path: str, image_name: str) -> dict:
    try:
        proc = subprocess.run(
            ["syft", f"docker-archive:{tarball_path}", "-o", "spdx-json"],
            capture_output=True, text=True, timeout=1200, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"syft is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"syft timed out scanning {tarball_path}") from exc

    if proc.returncode != 0:
        raise CollectorError(
            f"syft exited {proc.returncode} scanning {tarball_path} (image {image_name}): "
            f"{proc.stderr.strip()[:2000]}"
        )

    try:
        document = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"syft did not print valid JSON: {exc}") from exc

    if document.get("spdxVersion") != "SPDX-2.3":
        raise CollectorError(
            f"syft produced spdxVersion={document.get('spdxVersion')!r}, expected 'SPDX-2.3' -- "
            f"syft's default SPDX version may have changed; pin it explicitly if so"
        )

    packages = document.get("packages", [])
    if not isinstance(packages, list):
        raise CollectorError(f"SPDX document's 'packages' is {type(packages).__name__}, expected list")

    return {"document": document, "packageCount": len(packages)}


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("usage: collect-sbom.py <tarball-path> <image-name>", file=sys.stderr)
        sys.exit(2)
    result = collect_sbom(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
```

Because the filename has a hyphen, the test cannot `import collect_sbom` directly from a file named
`collect-sbom.py`. Two real options exist; use `importlib` rather than renaming the file, because every
other script in this directory (`publish-decision.sh`, `manifest-agreement.test.sh`) already names
files with hyphens and this plan should not be the one to break that convention:

```python
# Insert this near the top of collect-sbom.test.py, replacing the plain `from collect_sbom import ...`
# line above:
import importlib.util

_spec = importlib.util.spec_from_file_location("collect_sbom", HERE / "collect-sbom.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_sbom, CollectorError = _module.collect_sbom, _module.CollectorError
```

Replace the earlier `from collect_sbom import collect_sbom, CollectorError  # noqa: E402` line with this
block before proceeding to Step 4.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python collect-sbom.test.py`
Expected: `passed=5 failed=0` (or however many `report(...)` calls exist once Step 3's fix lands — count
must match the number of `report()` calls in the test file, all `ok`).

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collect-sbom.py .github/scripts/collect-sbom.test.py
git commit -m "feat(ci): collect an SPDX 2.3 SBOM from a built image via syft"
```

---

### Task 3: `collect-vulnerability-scan.py` — vulnerability scan via Trivy

**Files:**
- Create: `.github/scripts/collect-vulnerability-scan.py`
- Test: `.github/scripts/collect-vulnerability-scan.test.py`

**Interfaces:**
- Consumes: the same tarball as Task 2, `trivy` on PATH,
  `.github/contracts/predicates/vulnerabilityScan.schema.json` for the test's own validation.
- Produces: `collect_vulnerability_scan(tarball_path, image_name) -> dict`.

- [ ] **Step 1: Confirm Trivy's real JSON shape before writing the parser**

Do not guess Trivy's field names. Run it once by hand and read the real output:

Run: `trivy image --input .github/scripts/collector-fixtures/tiny-test-image.tar --format json --quiet > /tmp/trivy-sample.json`
Then inspect `/tmp/trivy-sample.json`'s top-level keys (`Results[].Vulnerabilities[].Severity`,
`.FixedVersion`, and the metadata block naming the DB) — confirm the exact key names and casing your
own eyes see in this run, because this is the "confirm on first runner pass, not learn from output"
discipline the design doc calls out (spec 3a section 7's own rule, reused here). Trivy's JSON has
historically used `Results` (array, one per scanned target) → `Vulnerabilities` (array) → objects with
`Severity` (upper-case string), `FixedVersion` (string, empty when no fix), and a top-level
`Metadata.DB` or similar block for DB identity/timestamp depending on version — **the implementation
below must be written to match what Step 1 actually printed, not to this description**, since Trivy's
schema has changed across versions before. If the real output disagrees with the shapes assumed in
Step 3 below, Step 3's parsing code is what must change, not this note.

- [ ] **Step 2: Write the failing test**

```python
# .github/scripts/collect-vulnerability-scan.test.py
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "vulnerabilityScan.schema.json"

try:
    import jsonschema
except ImportError:
    print("FAIL  jsonschema is not installed; the contract cannot be checked")
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


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run Task 1 first)", False, f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

document = collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny")

schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema)
errors = sorted(validator.iter_errors(document), key=str)
report("document validates against vulnerabilityScan.schema.json exactly",
       not errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5]))

report("every finding has a valid severity enum",
       all(f.get("severity") in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN")
           for f in document.get("findings", [])),
       str([f.get("severity") for f in document.get("findings", [])][:10]))

report("truncated is false when findings <= 100",
       document.get("truncated") is False or len(document.get("findings", [])) >= 100,
       f"truncated={document.get('truncated')!r}, len={len(document.get('findings', []))}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .github/scripts && python collect-vulnerability-scan.test.py`
Expected: `ModuleNotFoundError` or `FileNotFoundError` — `collect-vulnerability-scan.py` does not exist
yet.

- [ ] **Step 4: Write the implementation**

Write `.github/scripts/collect-vulnerability-scan.py` following the same `CollectorError`/subprocess
pattern as Task 2's `collect-sbom.py`, but building the predicate document per
`vulnerabilityScan.schema.json`'s exact required keys (`scanner`, `vulnerabilityDb`, `target`,
`timestamp`, `findings`, `truncated`) from whatever real field names Step 1 confirmed Trivy actually
emits. Skeleton (fill in the `Results`/`Vulnerabilities` field-name details from Step 1's real output,
not from guesswork):

```python
"""Wraps Trivy to produce a vulnerabilityScan predicate document from a docker-archive tarball.

Field names below were confirmed against a real `trivy image --format json` run (see Task 3 Step 1 of
the collector-sbom-vuln-scan plan) before this was written -- Trivy's JSON schema has changed across
versions before, so this must never be adjusted from documentation alone.
"""
import datetime
import json
import subprocess

__all__ = ["collect_vulnerability_scan", "CollectorError"]

MAX_FINDINGS = 100


class CollectorError(Exception):
    pass


def collect_vulnerability_scan(tarball_path: str, image_name: str) -> dict:
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
        raise CollectorError(
            f"trivy exited {proc.returncode} scanning {tarball_path} (image {image_name}): "
            f"{proc.stderr.strip()[:2000]}"
        )

    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"trivy did not print valid JSON: {exc}") from exc

    # TODO(implementer, Task 3 Step 4): replace the field accesses below with the real ones Step 1
    # confirmed. This skeleton's names are a placeholder for the plan document only -- the actual
    # implementation step must not ship with a literal TODO in it (see writing-plans' "No
    # Placeholders" rule); resolve this against Step 1's real captured output before committing.
    all_findings = []
    for result in raw.get("Results") or []:
        for vuln in result.get("Vulnerabilities") or []:
            all_findings.append({
                "severity": vuln.get("Severity", "UNKNOWN"),
                "fixAvailable": bool(vuln.get("FixedVersion")),
            })

    truncated = len(all_findings) > MAX_FINDINGS
    findings = all_findings[:MAX_FINDINGS]

    db_metadata = raw.get("Metadata", {}).get("DB") or {}

    return {
        "scanner": {"name": "trivy", "version": raw.get("SchemaVersion") and _trivy_version()},
        "vulnerabilityDb": {
            "identity": db_metadata.get("Type", "trivy-db"),
            "digest": db_metadata.get("Digest", "sha256:" + "0" * 64),
            "updatedAt": db_metadata.get("UpdatedAt", _now_iso()),
        },
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _trivy_version() -> str:
    proc = subprocess.run(["trivy", "--version"], capture_output=True, text=True, timeout=30,
                           check=False)
    for line in proc.stdout.splitlines():
        if line.startswith("Version:"):
            return line.split(":", 1)[1].strip()
    return "unknown"


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("usage: collect-vulnerability-scan.py <tarball-path> <image-name>", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(collect_vulnerability_scan(sys.argv[1], sys.argv[2])))
```

The implementer must resolve the `TODO` before committing: run Step 1's captured
`/tmp/trivy-sample.json`, look at its actual `Results[].Vulnerabilities[]` (or whatever the real
top-level keys turn out to be), and adjust the field-access lines in `collect_vulnerability_scan` to
match exactly. If Trivy's real output has no `Metadata.DB` block for a `--quiet` local scan (this is
plausible — confirm from the real capture), fall back to running `trivy image --version` in JSON form or
`trivy --version` for scanner identity and derive `vulnerabilityDb.identity`/`digest`/`updatedAt` from
whatever Trivy's DB-status command (`trivy --version` also prints `Vulnerability DB` info in recent
versions — check Step 1's captured output for this too) actually reports for the locally cached DB. Do
not invent a value that was never printed by a real tool.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .github/scripts && python collect-vulnerability-scan.test.py`
Expected: `passed=3 failed=0`. If the schema-validation check fails, read the reported path/message —
it names exactly which required key is missing or which value has the wrong type, e.g. `['scanner']:
'version' is a required property` means `scanner.version` was left `None` because `_trivy_version()`'s
parsing didn't match the real `trivy --version` output on this machine; fix the string parsing, not the
schema.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/collect-vulnerability-scan.py .github/scripts/collect-vulnerability-scan.test.py
git commit -m "feat(ci): collect a vulnerabilityScan predicate from a built image via Trivy"
```

---

## Explicitly out of scope for this plan

- `layerSecretScan`/`filesystemSecretScan` collection (needs `crane`, a separate ruleset file, and the
  byte-cap/timeout machinery from design doc §3.3a) — a follow-up plan, same pattern.
- Flyway inventory collection (needs a throwaway Postgres) — a follow-up plan.
- Assembling a full `observation.json` from all of the above — needs every collector task done first.
- Anything that pushes to GHCR or touches `permissions: packages: write` — slice 5 of the design doc,
  a separate plan after every collector piece above is CI-verified independently.

## Self-Review Notes

- Spec coverage: this plan covers exactly the SBOM and vulnerabilityScan pieces of design doc §3.1/3.2;
  §3.3/3.3a (secret scans) and §3.4 (Flyway) are explicitly deferred above, not silently dropped.
- Placeholder scan: the one literal `TODO` inside Task 3 Step 4's skeleton is intentional and flagged
  in the surrounding prose as a required resolution step before commit, not a plan gap — Trivy's real
  field names cannot be known without running it once, which is exactly what Step 1 has the implementer
  do first. This is different from an unresolved plan placeholder because the plan tells the
  implementer precisely how to resolve it (run the tool, read the real output, adjust the two field
  accesses) rather than leaving "handle this somehow."
- Type consistency: `CollectorError` is defined independently in both `collect-sbom.py` and
  `collect-vulnerability-scan.py` (documented in Interfaces above as deliberate, matching this
  directory's existing no-shared-base-module convention) — a later assembler task must catch both by
  name or by a shared `except Exception` boundary, not assume a single shared exception class.
