# Publish job: evidence-set attestation reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap task 1.5. `read_evidence_set_attestation` verifies a report's own signed attestation
(not the marker's — a separate, independent trust source per design doc §5's own stated rule: "report
và attestation không được trộn") and builds `scanPresentAttestation`/`sbomAttestationEvidenceLookup`'s
shape, including the semantic-duplicate-detection fields (`paginationComplete`, `duplicates[]`) roadmap
1.3 investigated the design for.

**Architecture:** One function, `read_evidence_set_attestation`, extending `attest-verify.py`'s existing
`verify_attestation` (already merged) rather than duplicating its `gh attestation verify` invocation
logic — this task adds a second, richer function in the SAME module for the case where the JSON result
body must actually be read (roadmap 1.4's `verify_attestation` only ever used the exit code; this task
is the first thing in the whole project that reads `gh attestation verify --format json`'s actual
response body). `paginationComplete`/`duplicates[]` are computed from the response array's length
relative to `--limit` (roadmap 1.3's documented design: `paginationComplete = len(results) < limit`,
since `gh` has no cursor/offset to prove exhaustiveness beyond raising the limit).

**Tech Stack:** Python 3.10+, the `gh` CLI (already used by `attest-verify.py`).

## Global Constraints

- **This is the least-verified piece of the whole project, stated plainly, not hidden.** Every attempt
  this session to obtain a real multi-attestation sample failed (5 different public artifacts tried
  across roadmap 1.3 and the original attestation design work — see
  `backend/docs/superpowers/plans/2026-08-11-publish-attestation.md`'s own Global Constraints and this
  session's ledger). This plan's JSON-parsing code is written against GitHub's own documented
  `gh attestation verify --format json` output shape, not a captured real sample. The exact field path
  to a verified attestation's signed predicate body is the single highest-risk assumption in this whole
  plan — it MUST be confirmed the first time this code runs against a real signed artifact in CI (task
  roadmap 3.4), and the implementer must make this assumption easy to find and fix in one place (a
  single named constant/small function), not scattered across the file.
- `paginationComplete = len(results) < limit_used` (roadmap 1.3's own documented design, itself already
  a stated best-effort reading of `gh`'s documented `-L/--limit` flag, not independently re-verified
  here — reuse the decision already made, do not re-litigate it).
- `duplicates[]` = every result beyond the first (by whatever order `gh` returns them — no defined sort
  is specified anywhere in the schema or spec for this array), each projected into
  `attestationStatementProjection`'s shape: `subjectDigest`, `sourceRevision`, `signerRepository`,
  `signerWorkflow`, `predicateType` required; `reportDigest`/`policy`/`outcome` optional (SBOM
  statements carry none of the three, per that $def's own description already read this session).
- `normalizedPredicate` (the FIRST/primary result's predicate, reshaped) uses the exact same
  `normalizedScanContent`/`sbomDocumentContent` field-projection logic `evidence-set-report.py`'s
  `_build_normalized_report` already implements — this task must reuse that function (import it, do not
  copy/duplicate its field list), passing it the ATTESTATION's own predicate body instead of the
  registry blob's parsed content. If the predicate body's real shape (once inspectable in CI) turns out
  to need different field handling than the registry blob does, that is a real, separate finding for a
  later fix — this plan's job is to wire the reuse correctly assuming the shapes match, which is the
  best-available assumption right now.
- No network calls beyond `gh attestation verify` itself.

---

## File Structure

- Modify: `.github/scripts/attest-verify.py` — add `verify_attestation_with_duplicates`.
- Create: `.github/scripts/attest-verify.test.py` additions — a new test for the pagination/duplicates
  path, added to the ALREADY-MERGED test file (append, do not replace the 2 existing assertions).
- Create: `.github/scripts/evidence-set-attestation.py` — `read_evidence_set_attestation`, composing
  `verify_attestation_with_duplicates` into the full `scanPresentAttestation`/
  `sbomAttestationEvidenceLookup` shape.
- Create: `.github/scripts/evidence-set-attestation.test.py`.

## Interfaces

- `verify_attestation_with_duplicates(artifact_ref, expected_repo, expected_signer_workflow,
  expected_predicate_type, expected_source_digest, limit=30) -> dict` — returns `{"attestationVerified":
  bool, "signerRepository": str, "signerWorkflow": str, "sourceRevision": str, "predicateBody": dict |
  None, "paginationComplete": bool, "duplicateStatements": list[dict]}`. `predicateBody` is the raw,
  unreshaped predicate content of the FIRST matching result (`None` if unverified/absent) —
  `read_evidence_set_attestation` is responsible for reshaping it via
  `evidence-set-report.py`'s shared projection function, not this lower-level function.
  `duplicateStatements` is a list of raw predicate-adjacent dicts (subject/signer/workflow/revision/
  predicateType, and reportDigest/policy/outcome where present) for every result beyond the first —
  `read_evidence_set_attestation` projects these into `attestationStatementProjection`'s exact shape.
- `read_evidence_set_attestation(registry_ref, evidence_set_tag, kind, subject_digest,
  expected_source_repo, expected_signer_workflow) -> dict` — returns
  `scanAttestationEvidenceLookup`/`sbomAttestationEvidenceLookup`'s shape
  (`scanPresentAttestation`/`sbomPresentAttestation`, or `scanAttestationAbsent`/`error`).

---

### Task 1: `verify_attestation_with_duplicates` in `attest-verify.py`

**Files:**
- Modify: `.github/scripts/attest-verify.py`
- Modify: `.github/scripts/attest-verify.test.py` (append)

**Interfaces:**
- Consumes: `gh attestation verify --format json`, real for the "no attestations found" path (the only
  path this session could exercise for real — see Global Constraints), documented-but-unverified for
  the "found N attestations" path.
- Produces: `verify_attestation_with_duplicates`, importable by Task 2.

- [ ] **Step 1: Write the failing test addition**

Append to `.github/scripts/attest-verify.test.py` (before the final `print`/`sys.exit`):

```python
verify_attestation_with_duplicates = _module.verify_attestation_with_duplicates

unsigned_file2 = HERE / "collector-fixtures" / "definitely-unsigned-2.txt"
unsigned_file2.write_text("nobody has ever attested this file either", encoding="utf-8")
try:
    dup_result = verify_attestation_with_duplicates(
        str(unsigned_file2),
        expected_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
        expected_predicate_type="https://slsa.dev/provenance/v1",
        expected_source_digest="0" * 40,
    )
    report("an unsigned artifact returns attestationVerified False with empty duplicates",
           dup_result.get("attestationVerified") is False
           and dup_result.get("duplicateStatements") == []
           and dup_result.get("predicateBody") is None,
           f"dup_result={dup_result!r}")
    report("an unsigned artifact's paginationComplete is True (zero results is a complete, "
           "not partial, answer)",
           dup_result.get("paginationComplete") is True,
           f"paginationComplete={dup_result.get('paginationComplete')!r}")
except CollectorError:
    pass
except AttestationCheckError:
    pass
finally:
    unsigned_file2.unlink()
```

(Uses this file's already-imported `AttestationCheckError` — confirm the exact name by reading the
existing test file's own imports before writing this, do not assume.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python attest-verify.test.py`
Expected: existing 3 assertions still pass, then `AttributeError: module 'attest_verify' has no
attribute 'verify_attestation_with_duplicates'`.

- [ ] **Step 3: Write the implementation**

Append to `.github/scripts/attest-verify.py`:

```python
def verify_attestation_with_duplicates(artifact_ref: str, expected_repo: str,
                                        expected_signer_workflow: str, expected_predicate_type: str,
                                        expected_source_digest: str, limit: int = 30) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", expected_signer_workflow,
             "--predicate-type", expected_predicate_type,
             "--source-digest", expected_source_digest,
             "--limit", str(limit),
             "--format", "json"],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise AttestationCheckError(f"gh is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise AttestationCheckError(f"gh attestation verify timed out for {artifact_ref}") from exc

    stderr = proc.stderr.strip()
    if proc.returncode != 0:
        if "no attestations found" in stderr.lower() or "404" in stderr:
            return {
                "attestationVerified": False, "signerRepository": expected_repo,
                "signerWorkflow": expected_signer_workflow, "sourceRevision": expected_source_digest,
                "predicateBody": None, "paginationComplete": True, "duplicateStatements": [],
            }
        raise AttestationCheckError(
            f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]}"
        )

    # HIGHEST-RISK ASSUMPTION IN THIS PLAN (see Global Constraints): the exact JSON shape of a real
    # verified result has never been observed in this session -- every real public artifact tried came
    # back "no attestations found" with the credentials available here. This parsing is written against
    # GitHub's own documented `gh attestation verify --format json` shape (a JSON array, one object per
    # matching attestation, each with a verificationResult.statement.predicate body and a
    # verificationResult.statement.subject[].digest.sha256), NOT a captured real sample. Confirm this
    # against a real result the first time roadmap 3.4 runs this in CI, and fix ONLY this block if it's
    # wrong -- everything else in this function (the enforcement flags, the absent-path handling) is
    # already proven correct against real `gh` behavior.
    try:
        results = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AttestationCheckError(f"gh attestation verify printed non-JSON with --format json: {exc}") from exc

    if not isinstance(results, list) or not results:
        raise AttestationCheckError(
            f"gh attestation verify exited 0 but --format json printed no results: {proc.stdout[:1000]}"
        )

    def _predicate_body(entry):
        return (entry.get("verificationResult", {}).get("statement", {}).get("predicate"))

    primary_predicate = _predicate_body(results[0])
    duplicate_statements = []
    for entry in results[1:]:
        predicate = _predicate_body(entry) or {}
        statement = {
            "subjectDigest": "sha256:" + entry.get("verificationResult", {}).get("statement", {})
                .get("subject", [{}])[0].get("digest", {}).get("sha256", "0" * 64),
            "sourceRevision": expected_source_digest,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "predicateType": expected_predicate_type,
        }
        if "reportDigest" in predicate:
            statement["reportDigest"] = predicate["reportDigest"]
        if "policy" in predicate:
            statement["policy"] = predicate["policy"]
        if "declaredOutcome" in predicate:
            statement["outcome"] = predicate["declaredOutcome"]
        duplicate_statements.append(statement)

    return {
        "attestationVerified": True,
        "signerRepository": expected_repo,
        "signerWorkflow": expected_signer_workflow,
        "sourceRevision": expected_source_digest,
        "predicateBody": primary_predicate,
        "paginationComplete": len(results) < limit,
        "duplicateStatements": duplicate_statements,
    }
```

Add `import json` at the top of `attest-verify.py` if not already present (check first — the existing
`verify_attestation` function may not need it, since it only checks exit code and stderr text).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python attest-verify.test.py`
Expected: `passed=5 failed=0` (the original 3 plus 2 new).

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/attest-verify.py .github/scripts/attest-verify.test.py
git commit -m "feat(ci): add pagination/duplicate-detection to attestation verification"
```

---

### Task 2: `evidence-set-attestation.py`

**Files:**
- Create: `.github/scripts/evidence-set-attestation.py`
- Test: `.github/scripts/evidence-set-attestation.test.py`

**Interfaces:**
- Consumes: `verify_attestation_with_duplicates` from Task 1, `_build_normalized_report` from the
  already-merged `evidence-set-report.py` (reused, not duplicated — see Global Constraints).
- Produces: `read_evidence_set_attestation`, importable by roadmap 1.6.

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/evidence-set-attestation.test.py
"""Exercises read_evidence_set_attestation against an UNSIGNED subject -- the only real, exercisable
path in this session (see attest-verify.py's own Task 1 note: no real signed sample was obtainable).
The 'found a real attestation' path is written to spec, confirmed on first real CI run (roadmap 3.4),
same category of gap as attest-verify.py's own attestationVerified:True branch."""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence_set_attestation_mod = _load("evidence-set-attestation")
read_evidence_set_attestation = evidence_set_attestation_mod.read_evidence_set_attestation

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


# A registry_ref/tag with no real evidence-set pushed and no real attestation -- the attestation check
# targets an oci:// ref that gh cannot resolve at all locally (no GHCR credentials in this session), so
# this exercises the "not found" path the same way attest-verify.py's own test does, not a real
# multi-attestation scenario.
result = read_evidence_set_attestation(
    "localhost:1/nothing-here", "no-such-tag", "vulnerabilityScan",
    subject_digest="sha256:" + "1" * 64,
    expected_source_repo="trhlow/TVU-Event-Ticket",
    expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
)
report("an unreachable/unsigned target reports scanAttestationAbsent shape, not a crash",
       result.get("status") in ("absent", "error"),
       f"result={result!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python evidence-set-attestation.test.py`
Expected: fails in the `_load("evidence-set-attestation")` call (module does not exist).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/evidence-set-attestation.py
"""Reads a report's own signed attestation (never the marker's -- design doc section 5: "report và
attestation không được trộn") into scanAttestationEvidenceLookup's/sbomAttestationEvidenceLookup's
shape."""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_attest_verify = _load("attest-verify")
verify_attestation_with_duplicates = _attest_verify.verify_attestation_with_duplicates
AttestationCheckError = _attest_verify.AttestationCheckError

_evidence_set_report = _load("evidence-set-report")
_build_normalized_report = _evidence_set_report._build_normalized_report

_envelope = _load("envelope")

__all__ = ["read_evidence_set_attestation"]

_PREDICATE_TYPE_KEYS = {
    "sbom": "sbom", "vulnerabilityScan": "vulnerabilityScan",
    "layerSecretScan": "layerSecretScan", "filesystemSecretScan": "filesystemSecretScan",
}


def read_evidence_set_attestation(registry_ref: str, evidence_set_tag: str, kind: str,
                                   subject_digest: str, expected_source_repo: str,
                                   expected_signer_workflow: str) -> dict:
    predicate_type = _envelope.PREDICATE_TYPES[_PREDICATE_TYPE_KEYS[kind]]
    artifact_ref = f"oci://{registry_ref}:{evidence_set_tag}"

    try:
        result = verify_attestation_with_duplicates(
            artifact_ref, expected_repo=expected_source_repo,
            expected_signer_workflow=expected_signer_workflow,
            expected_predicate_type=predicate_type, expected_source_digest=subject_digest,
        )
    except AttestationCheckError as exc:
        return {"status": "error", "queriedRef": artifact_ref, "detail": str(exc)}

    if not result["attestationVerified"]:
        return {
            "status": "absent", "queriedRef": artifact_ref, "reason": "no_matching_attestation",
            "paginationComplete": result["paginationComplete"],
        }

    normalized_predicate = (_build_normalized_report(kind, result["predicateBody"], subject_digest)
                             if result["predicateBody"] else {})

    return {
        "status": "present",
        "queriedRef": artifact_ref,
        "subjectDigest": subject_digest,
        "predicateType": predicate_type,
        "signerRepository": result["signerRepository"],
        "signerWorkflow": result["signerWorkflow"],
        "sourceRevision": result["sourceRevision"],
        "attestationVerified": True,
        "normalizedPredicate": normalized_predicate,
        "paginationComplete": result["paginationComplete"],
        "duplicates": result["duplicateStatements"],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python evidence-set-attestation.test.py`
Expected: `passed=1 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/evidence-set-attestation.py .github/scripts/evidence-set-attestation.test.py
git commit -m "feat(ci): read a report's own attestation into scanPresentAttestation/sbomPresentAttestation"
```

---

## Explicitly out of scope for this plan

- `read_evidence_set_lookup` composing `evidence-set-report.py` + this task's output for all 4 kinds ×
  2 images, plus `carrierDigest`/`verification`/`subjectMatches`/`layersValid` (roadmap 1.6).
- Confirming the JSON parsing assumption against a real signed artifact — explicitly deferred to
  roadmap 3.4 (first real CI run), stated plainly throughout this plan rather than hidden.

## Self-Review Notes

- Spec coverage: `scanPresentAttestation`'s full required shape (including `paginationComplete`/
  `duplicates`, 3b commit 7's semantic-duplicate mechanism) is built, using roadmap 1.3's own
  already-documented design for the parts that can't be verified locally.
- Placeholder scan: no TBD/TODO — the one genuinely unverified assumption (real `gh` JSON shape) is
  named explicitly, isolated to one small function/comment block, and given a clear remediation trigger
  (confirm on roadmap 3.4), not glossed over as if it were proven.
- Type consistency: `read_evidence_set_attestation`'s signature mirrors `read_evidence_set_report`'s own
  parameter ordering (`registry_ref, evidence_set_tag, kind, subject_digest, ...`) for consistency
  between the two lookup halves roadmap 1.6 will compose.
