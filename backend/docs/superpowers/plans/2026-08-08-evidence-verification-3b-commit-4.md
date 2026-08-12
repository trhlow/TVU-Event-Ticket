# 3b commit 4 — "give each evidence two lookups of its own" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `reportLookup` and `attestationLookup` their own real, independently-typed shapes
(spec §5), replacing commit 2's shared `objectLookup` placeholder, and extend the decision's
retryable-error scan to reach the 16 report/attestation lookups nested inside the two evidence-set
lookups.

**Architecture:** Two new schema unions (`reportEvidenceLookup`, `attestationEvidenceLookup`) with
their own `present` shapes and, for the attestation half, its own `absent` shape (pagination-complete
empty list, not a 404). `decide()` gains a small enumerated scan (`nested_evidence_failures()`) run
before the top-level error gate, and `evidence_set_problems()` gains checks on the new boolean
outcome fields. Every existing fixture that used the old shared shape is migrated by a single
Python script, since one function (`present_evidence_set()` in the test harness) and one shared JSON
shape (repeated identically across 17 static fixtures) account for all of it.

**Tech Stack:** Same as commits 1-3 — JSON Schema draft 2020-12, `jsonschema`/`referencing`, Python
3.10+ decision script, bash test harnesses.

## Global Constraints

- `additionalProperties: false` at every object level, matching house style.
- Every new schema keyword must have a fixture proving it is load-bearing.
- Do not touch `.github/contracts/predicates/*.schema.json` (commit 3's schemas) — not wired in
  here, per the design doc's Decision 2 (no spec text assigns that wiring to this commit).
- Do not give `normalizedReport`/`normalizedPredicate` real shape — loosely typed until commit 5
  (spec §6).
- Do not enforce the full attestation-selection tuple in `attestationAbsent.queried` — loosely typed
  until commit 7 (spec §8).
- `policyPassed` does NOT appear on `presentAttestation` — that field is marker/evidence-set-carrier
  scoped; a report's own policy pass/fail is decided in commit 5, not asserted by the collector here.
- No new top-level lookup, no change to `REQUIRED_LOOKUPS`/`lookups` in `observation.schema.json` —
  this commit only changes what's nested inside the existing two `*EvidenceSet` lookups.

---

## File Structure

- `.github/contracts/observation.schema.json` — **modify**. `reportAttestationPair`'s two fields
  retyped; `reportEvidenceLookup`, `presentReport`, `attestationEvidenceLookup`,
  `presentAttestation`, `attestationAbsent` `$defs` added.
- `.github/scripts/publish-decision.sh` — **modify**. `EVIDENCE_REPORT_KINDS` constant and
  `nested_evidence_failures()` added; `decide()`'s top-level error scan extended;
  `evidence_set_problems()`'s reports loop extended with the four new boolean-outcome checks.
- `.github/contracts/fixtures/` (17 files) — **modify**, via a migration script (Task 3).
- `.github/scripts/publish-decision.test.sh` — **modify**. `present_evidence_set()`'s shared pair
  literal migrated (fixes all default-case tests at once); the one `attestationLookup`-set-to-absent
  case migrated to the new `attestationAbsent` shape; new witness cases added (Task 4).
- `.github/scripts/publish-decision.mutations.py` — **modify**. New mutation rules for the four new
  boolean checks and for `nested_evidence_failures()`.
- `.github/workflows/ci.yml` — **not touched**. No new suite; existing suites already run.
- `.superpowers/sdd/progress.md` — **modify**. Ledger entry.

## Interfaces

- Consumes: `#/$defs/digest`, `#/$defs/sha1`, `#/$defs/absent`, `#/$defs/error` (all pre-existing).
- Produces: `reportEvidenceLookup`, `attestationEvidenceLookup` `$defs`, consumed by
  `reportAttestationPair` (already in the schema, commit 2). `nested_evidence_failures(lookups)` —
  new function, called once from `decide()`, returns `list[tuple[str, dict]]` in the same shape as
  the existing top-level `failures` list (name, lookup-dict), so it can simply be concatenated.
- `EVIDENCE_REPORT_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")`
  — new module-level constant in `publish-decision.sh`, reused by both `nested_evidence_failures()`
  and (already, unchanged) `evidence_set_problems()`'s own loop, which currently hardcodes the same
  four-tuple inline — Task 2 also replaces that inline tuple with this constant so there is one
  spelling of the four kinds, not two.

---

### Task 1: Schema — two new lookup unions

**Files:**
- Modify: `.github/contracts/observation.schema.json`

**Interfaces:**
- Consumes: `#/$defs/digest`, `#/$defs/sha1`, `#/$defs/absent`, `#/$defs/error`.
- Produces: `#/$defs/reportEvidenceLookup`, `#/$defs/attestationEvidenceLookup`.

- [ ] **Step 1: Replace `reportAttestationPair`'s two fields and add the five new `$defs`**

In `.github/contracts/observation.schema.json`, find:

```json
    "reportAttestationPair": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reportLookup", "attestationLookup"],
      "properties": {
        "reportLookup": { "$ref": "#/$defs/objectLookup" },
        "attestationLookup": { "$ref": "#/$defs/objectLookup" }
      }
    }
```

Replace it with:

```json
    "reportAttestationPair": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reportLookup", "attestationLookup"],
      "properties": {
        "reportLookup": { "$ref": "#/$defs/reportEvidenceLookup" },
        "attestationLookup": { "$ref": "#/$defs/attestationEvidenceLookup" }
      }
    },

    "reportEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/presentReport" },
        { "$ref": "#/$defs/absent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "presentReport": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 4 (spec section 5): what a report lookup proves -- descriptor bytes/hash/schema, nothing about signer or source revision. That half is attestationEvidenceLookup's job.",
      "required": ["status", "queriedRef", "descriptor", "digestVerified", "sizeVerified", "schemaValid", "normalizedReport"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "descriptor": {
          "type": "object",
          "additionalProperties": false,
          "required": ["mediaType", "digest", "size"],
          "properties": {
            "mediaType": { "type": "string", "minLength": 1 },
            "digest": { "$ref": "#/$defs/digest" },
            "size": { "type": "integer", "minimum": 0 }
          }
        },
        "digestVerified": { "type": "boolean" },
        "sizeVerified": { "type": "boolean" },
        "schemaValid": { "type": "boolean" },
        "normalizedReport": {
          "type": "object",
          "description": "Loosely typed until commit 5 (spec section 6) gives it real shape."
        }
      }
    },

    "attestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/presentAttestation" },
        { "$ref": "#/$defs/attestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "presentAttestation": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 4 (spec section 5): what an attestation lookup proves -- signer, source revision, predicate type, verify-bundle outcome. Not policyPassed: whether a report's findings pass policy is recomputed by the decision in commit 5, not asserted by the collector at lookup time.",
      "required": ["status", "queriedRef", "subjectDigest", "predicateType", "signerRepository", "signerWorkflow", "sourceRevision", "attestationVerified", "normalizedPredicate"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "predicateType": { "type": "string", "minLength": 1 },
        "signerRepository": { "type": "string", "minLength": 1 },
        "signerWorkflow": { "type": "string", "minLength": 1 },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "attestationVerified": { "type": "boolean" },
        "normalizedPredicate": {
          "type": "object",
          "description": "Loosely typed until commit 5 (spec section 6) gives it real shape."
        }
      }
    },

    "attestationAbsent": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 4 (spec section 5): the GitHub Attestations API answers 'not found' with a 200 and an empty list after full pagination, not a 404 -- asserting observedCode: 404 here would assert an HTTP status nobody received. paginationComplete is what turns 'gave up partway' into 'searched, and found nothing'. queried is loosely typed -- the full tuple (repository, workflow, sourceRevision, subjectDigest, predicateType, and a report digest for the three scan kinds) is enforced by commit 7 (spec section 8); today it only has to record what was searched for.",
      "required": ["status", "reason", "paginationComplete", "queried"],
      "properties": {
        "status": { "const": "absent" },
        "reason": { "const": "no_matching_attestation" },
        "paginationComplete": { "const": true },
        "queried": {
          "type": "object",
          "required": ["repository", "workflow", "sourceRevision", "subjectDigest", "predicateType"],
          "properties": {
            "repository": { "type": "string", "minLength": 1 },
            "workflow": { "type": "string", "minLength": 1 },
            "sourceRevision": { "$ref": "#/$defs/sha1" },
            "subjectDigest": { "$ref": "#/$defs/digest" },
            "predicateType": { "type": "string", "minLength": 1 }
          }
        }
      }
    }
```

- [ ] **Step 2: Confirm the schema is still well-formed JSON**

Run: `python -c "import json; json.load(open('.github/contracts/observation.schema.json', encoding='utf-8')); print('ok')"`

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add .github/contracts/observation.schema.json
git commit -m "contract(ci): give each evidence two lookups of its own (1/5)

Two new independent unions -- reportEvidenceLookup, attestationEvidenceLookup
-- replacing commit 2's shared objectLookup placeholder, per spec section 5.
Every existing fixture using the old shape is now schema-invalid; commit 3
of this series migrates the corpus. Not run against any suite yet."
```

---

### Task 2: Decision logic — `nested_evidence_failures()` and the new boolean checks

**Files:**
- Modify: `.github/scripts/publish-decision.sh`

**Interfaces:**
- Consumes: `#/$defs/reportEvidenceLookup`, `#/$defs/attestationEvidenceLookup` (Task 1).
- Produces: `nested_evidence_failures(lookups)`, `EVIDENCE_REPORT_KINDS`.

This task alone leaves the fixture corpus and `publish-decision.test.sh` broken against the schema
(Task 1's change) — expected, fixed in Task 3.

- [ ] **Step 1: Add `EVIDENCE_REPORT_KINDS` and `nested_evidence_failures()`, and use the constant in `evidence_set_problems()`**

Find, in `.github/scripts/publish-decision.sh`:

```python
    reports = lookup.get("reports")
    if type(reports) is not dict:
        problems.append(f"{where}.reports is missing")
        return problems
    for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):
```

Replace the `for kind in (...)` line with `for kind in EVIDENCE_REPORT_KINDS:` (the tuple moves to
the new module-level constant added in this step — one spelling of the four kinds, not two).

Immediately before `def evidence_set_problems(lookup, obs, where):`, add:

```python
EVIDENCE_REPORT_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")


```

Then, immediately before `def decide(obs):`, add:

```python
def nested_evidence_failures(lookups):
    """The 16 report/attestation lookups nested inside the two evidence-set lookups, named and
    enumerated explicitly rather than discovered by recursing on every object with a `status` key --
    section 5's own constraint, because a recursive walk would also match status-shaped objects that
    mean something else entirely. Gated on the evidence-set's own lookup being present: an absent or
    errored evidence-set has no `reports` key to walk into at all. Also defensive against a
    structurally malformed `reports` or pair -- a missing `reports` key or a pair that is not an
    object is evidence_set_problems()'s own CONFLICT to report, not a crash this scan should cause
    before that code ever runs (found by running this against the existing 'reports is missing' and
    'a report pair is not an object' fixtures before writing this plan -- both crashed the first,
    unguarded version with a TypeError)."""
    failures = []
    for image in IMAGES:
        evidence_set = lookups[f"{image}EvidenceSet"]
        if evidence_set["status"] != "present":
            continue
        reports = evidence_set.get("reports")
        if type(reports) is not dict:
            continue
        for kind in EVIDENCE_REPORT_KINDS:
            pair = reports.get(kind)
            if type(pair) is not dict:
                continue
            for half in ("reportLookup", "attestationLookup"):
                lookup = pair.get(half)
                if type(lookup) is dict and lookup.get("status") == "error":
                    failures.append((f"{image}EvidenceSet.reports.{kind}.{half}", lookup))
    return failures


```

- [ ] **Step 2: Wire the extension into `decide()`'s error scan**

Find:

```python
    failures = [(name, lookups[name]) for name in sorted(lookups)
                if lookups[name]["status"] == "error"]
    if failures:
```

Replace with:

```python
    failures = [(name, lookups[name]) for name in sorted(lookups)
                if lookups[name]["status"] == "error"]
    failures += nested_evidence_failures(lookups)
    if failures:
```

Also update the comment immediately above the first line (currently ending "...One error behaves
exactly as before, which is why no case caught this.") by appending, as a new paragraph inside the
same comment block:

```python
    #
    # Extended (3b commit 4, spec section 5) to the 16 report/attestation lookups nested inside the
    # two evidence-set lookups: a nested error must reach this same gate before evidence_set_
    # problems() ever sees it, or a lookup that merely failed to run becomes indistinguishable from
    # one that ran and found nothing -- UNKNOWN vs. CONFLICT, a retry vs. a person's problem.
```

- [ ] **Step 3: Extend `evidence_set_problems()`'s reports loop with the four new boolean checks**

Find:

```python
        report_lookup = pair.get("reportLookup")
        if type(report_lookup) is not dict or report_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.reportLookup is not present; adopt requires "
                            f"every report to already exist, not a partial set")
        attestation_lookup = pair.get("attestationLookup")
        if type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.attestationLookup is not present; adopting "
                            f"without every kind's attestation would sign on trust rather than "
                            f"verify it")
```

Replace with:

```python
        report_lookup = pair.get("reportLookup")
        if type(report_lookup) is not dict or report_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.reportLookup is not present; adopt requires "
                            f"every report to already exist, not a partial set")
        elif not (report_lookup.get("digestVerified") is True
                  and report_lookup.get("sizeVerified") is True
                  and report_lookup.get("schemaValid") is True):
            # Section 5: "fetched but wrong schema is CONFLICT, not merely a lookup that ran." A
            # reportLookup can be status:present (the fetch succeeded) while any of these three
            # outcomes is false (the bytes it fetched didn't verify) -- two different facts the old
            # shared objectLookup this replaces could not distinguish at all.
            problems.append(f"{where}.reports.{kind}.reportLookup fetched but not verified: "
                            f"digestVerified={report_lookup.get('digestVerified')!r}, "
                            f"sizeVerified={report_lookup.get('sizeVerified')!r}, "
                            f"schemaValid={report_lookup.get('schemaValid')!r}")
        attestation_lookup = pair.get("attestationLookup")
        if type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.attestationLookup is not present; adopting "
                            f"without every kind's attestation would sign on trust rather than "
                            f"verify it")
        elif attestation_lookup.get("attestationVerified") is not True:
            problems.append(f"{where}.reports.{kind}.attestationLookup.attestationVerified is "
                            f"{attestation_lookup.get('attestationVerified')!r}, must be boolean true")
```

- [ ] **Step 4: Confirm the script is still valid Python**

Run: `python -c "import ast; ast.parse(open('.github/scripts/publish-decision.sh', encoding='utf-8').read().split(chr(39)*3, 1)[1].rsplit(chr(39)*3, 1)[0])" 2>&1 | head -5`

(This extracts the Python heredoc from the bash wrapper the same way the file itself is structured
-- if this exact extraction doesn't apply cleanly, instead just run
`bash .github/scripts/publish-decision.test.sh 2>&1 | head -20` and confirm the failure, if any, is a
fixture/schema mismatch from Task 1, not a Python `SyntaxError` — a `SyntaxError` means this step's
edit is malformed and must be fixed before continuing.)

Expected: no `SyntaxError`. `FAIL` lines from fixture/schema mismatches are expected and fixed in
Task 3.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/publish-decision.sh
git commit -m "contract(ci): give each evidence two lookups of its own (2/5)

nested_evidence_failures() extends decide()'s retryable-error scan to
the 16 report/attestation lookups nested in the two evidence-set
lookups, enumerated explicitly and gated on presence, matching section
5's own constraint against a recursive status-key walk. evidence_set_
problems() now also checks digestVerified/sizeVerified/schemaValid/
attestationVerified, closing the gap where a lookup could be
status:present but its fetch or verification actually failed. Not run
against any suite yet -- Task 3 migrates the fixture corpus this needs."
```

---

### Task 3: Migrate the existing fixture corpus

**Files:**
- Modify: 17 files under `.github/contracts/fixtures/` (see list below).
- Modify: `.github/scripts/publish-decision.test.sh` (`present_evidence_set()` and one
  `attestationLookup`-absent case).

**Interfaces:**
- Consumes: Task 1's schema, Task 2's decision code.
- Produces: a corpus that validates against the new schema and still proves what it always proved
  (per-fixture rule unchanged).

The 17 files: `invalid-semantics/{a-migration-failed,attestation-not-verified,duplicate-installed-rank,evidence-did-not-pass,evidence-vouches-for-another-image,inventory-checksum-copied,marker-signed-by-another-workflow,policy-did-not-pass}.json`,
`invalid-structure/{evidence-missing-layer-secret-scan,evidence-set-extra-field,evidence-set-missing-subject-matches,evidence-set-pair-missing-attestation-lookup,evidence-set-reports-missing-a-kind,migration-without-installed-rank,raw-schema-version-is-a-string}.json`,
`valid/{prepared-only,published}.json`. Confirmed by grep before writing this plan: every one of
these sets `reportLookup`/`attestationLookup` to the old `{status:"present", queriedRef, digest}`
shape, always `status:"present"` (none of the 17 use `absent` for either field) — a single
transformation rule covers all of them.

- [ ] **Step 1: Run to confirm the corpus is now broken by Tasks 1-2's schema change**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -25`

Expected: multiple `FAIL` lines, one per fixture using the old shape (up to all 17), each citing a
schema mismatch under `reports.<kind>.reportLookup` or `.attestationLookup`. This was verified
against a scratch worktree before writing this plan; do not proceed past this step assuming the
count without checking it — if the failures don't match expectations (e.g. more or fewer than 17,
or a different error shape), stop and diagnose before continuing.

- [ ] **Step 2: Write and run the migration script**

```python
import json
import pathlib

root = pathlib.Path(".")
fixtures_dir = root / ".github" / "contracts" / "fixtures"


def migrate_pair(pair):
    changed = False
    rl = pair.get("reportLookup")
    if isinstance(rl, dict) and rl.get("status") == "present" and "digest" in rl and "descriptor" not in rl:
        digest = rl["digest"]
        pair["reportLookup"] = {
            "status": "present",
            "queriedRef": rl["queriedRef"],
            "descriptor": {"mediaType": "application/vnd.evts.evidence.report.v1+json", "digest": digest, "size": 1024},
            "digestVerified": True,
            "sizeVerified": True,
            "schemaValid": True,
            "normalizedReport": {},
        }
        changed = True
    al = pair.get("attestationLookup")
    if isinstance(al, dict) and al.get("status") == "present" and "digest" in al and "subjectDigest" not in al:
        digest = al["digest"]
        pair["attestationLookup"] = {
            "status": "present",
            "queriedRef": al["queriedRef"],
            "subjectDigest": digest,
            "predicateType": "https://tvu.example/report-attestation",
            "signerRepository": "owner/name",
            "signerWorkflow": ".github/workflows/publish.yml",
            "sourceRevision": "0" * 40,
            "attestationVerified": True,
            "normalizedPredicate": {},
        }
        changed = True
    return changed


def walk(doc):
    changed = False
    for image_key in ("monolithEvidenceSet", "frontendEvidenceSet"):
        es = doc.get("lookups", {}).get(image_key)
        if not isinstance(es, dict) or es.get("status") != "present":
            continue
        reports = es.get("reports")
        if not isinstance(reports, dict):
            continue
        for kind, pair in reports.items():
            if isinstance(pair, dict):
                if migrate_pair(pair):
                    changed = True
    return changed


total_changed = 0
for path in sorted(fixtures_dir.rglob("*.json")):
    if path.name == "expectations.json":
        continue
    doc = json.loads(path.read_text(encoding="utf-8"))
    if walk(doc):
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        total_changed += 1
        print("migrated", path.relative_to(root))

print(f"total files migrated: {total_changed}")
```

Save this as a temporary script (e.g. `/tmp/migrate_pairs.py` or the project scratchpad) and run it
from the repo root with `python <path-to-script>.py`.

Expected: `total files migrated: 17`, one `migrated ...` line per file listed above.

- [ ] **Step 3: Run to verify the migrated corpus passes**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -35`

Expected: `passed=32 failed=0`. This exact count was confirmed in a scratch worktree before writing
this plan (`PUBLISH_DECISION_BASH` set explicitly, since the default `bash` resolution can fail with
a WSL relay error on some Windows setups running from a non-default path — if you see
`decision exited 1: ... WSL ... execvpe(/bin/bash) failed`, re-run with
`PUBLISH_DECISION_BASH=/usr/bin/bash bash .github/scripts/contract-agreement.test.sh` instead; this
is an environment artifact, not a defect in the migration).

- [ ] **Step 4: Migrate `publish-decision.test.sh`'s `present_evidence_set()` builder**

Find:

```bash
present_evidence_set() {
  local repo="$1" digest="$2"
  local pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'","digest":"'"$digest"'"},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'","digest":"'"$digest"'"}}'
  cat <<EOF
```

Replace with:

```bash
present_evidence_set() {
  local repo="$1" digest="$2"
  local pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "descriptor":{"mediaType":"application/vnd.evts.evidence.report.v1+json","digest":"'"$digest"'","size":1024},
                 "digestVerified":true,"sizeVerified":true,"schemaValid":true,"normalizedReport":{}},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "subjectDigest":"'"$digest"'","predicateType":"https://tvu.example/report-attestation",
                 "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                 "sourceRevision":"'"$SHA"'","attestationVerified":true,"normalizedPredicate":{}}}'
  cat <<EOF
```

This single change fixes every `assert_decision` case in the file that relies on the default
`present_mono_es`/`present_front_es` values (nearly all of them), since both are computed once from
this function.

- [ ] **Step 5: Migrate the one `attestationLookup`-set-to-absent case**

Find (in the "adopt refused: one kind is missing its attestation" case):

```bash
     "$(damaged_evidence_set 'doc["reports"]["sbom"]["attestationLookup"] = {"status": "absent", "observedCode": 404, "queriedRef": "x:sha-x"}' "$present_mono_es")")" \
```

Replace with:

```bash
     "$(damaged_evidence_set 'doc["reports"]["sbom"]["attestationLookup"] = {"status": "absent", "reason": "no_matching_attestation", "paginationComplete": True, "queried": {"repository": "owner/name/monolith", "workflow": ".github/workflows/publish.yml", "sourceRevision": "0"*40, "subjectDigest": "sha256:" + "5"*64, "predicateType": "https://tvu.example/report-attestation"}}' "$present_mono_es")")" \
```

(`damaged_evidence_set` runs this as a Python statement via `exec()` against the loaded fixture dict
`doc` — `True` and `"0"*40` are Python syntax, not bash; this mirrors the file's own existing
`damaged_evidence_set` calls elsewhere, e.g. `doc["verification"]["subjectDigest"] = ...`.)

- [ ] **Step 6: Run the full suite to verify GREEN at the prior baseline**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -10`

Expected: `passed=204 failed=0` — the exact pre-existing baseline (no fixture's proven rule changed;
this task adds zero new cases, only migrates existing ones). Confirmed in a scratch worktree before
writing this plan; the first attempt without Step 4's builder migration crashed several "3b commit
2" section cases with a Python `TypeError` inside `nested_evidence_failures()` on two specific
fixtures ("reports is missing", "a report pair is not an object") — if you see that traceback, it
means Task 2 Step 1's defensive `type(...) is not dict` guards were dropped; re-check that step's
code before re-running.

- [ ] **Step 7: shellcheck**

Run: `shellcheck .github/scripts/publish-decision.test.sh .github/scripts/publish-decision.sh`

Expected: no warnings.

- [ ] **Step 8: Commit**

```bash
git add .github/contracts/fixtures/ .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): give each evidence two lookups of its own (3/5)

Migrates the 17 existing fixtures and publish-decision.test.sh's
present_evidence_set() builder onto the new reportEvidenceLookup/
attestationEvidenceLookup shapes -- one migration script for the
static fixtures (all 17 used the identical old shape), one builder
edit for the dynamic test corpus (fixes nearly every assert_decision
case at once), one hand-edit for the single attestationLookup-absent
case. No fixture's proven rule changed. contract-agreement.test.sh
32/0, publish-decision.test.sh 204/0 (unchanged baseline)."
```

---

### Task 4: New witness fixtures for the four new guards

**Files:**
- Modify: `.github/scripts/publish-decision.test.sh`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fixtures proving the guards Task 2 added are load-bearing, and proving the
  `nested_evidence_failures()` mechanism reaches UNKNOWN/retryable for a real nested error — none of
  Task 3's migration or the pre-existing corpus exercises either of these; migration only proves the
  *shape* validates, not that the new *checks* fire.

- [ ] **Step 1: Add five new `assert_decision` cases in the existing "3b commit 2: evidence-set adopt, build_new, and CONFLICT" section**

Immediately after the existing `"adopt refused: a report's reportLookup is not present"` case (the
last `damaged_evidence_set`-based CONFLICT case in that section, just before the "evidence-set
lookup error surfaces through the same UNKNOWN gate as any other" case), add:

```bash
# Fix (3b commit 4): reportLookup/attestationLookup can be status:present while the fetch or
# verification it represents actually failed -- the old shared objectLookup this replaces could not
# express that distinction at all.
assert_decision "adopt refused: reportLookup fetched but digest did not verify" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["sbom"]["reportLookup"]["digestVerified"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false
assert_decision "adopt refused: reportLookup fetched but schema was invalid" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["vulnerabilityScan"]["reportLookup"]["schemaValid"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false
assert_decision "adopt refused: attestationLookup present but attestationVerified is false" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["layerSecretScan"]["attestationLookup"]["attestationVerified"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false
# Fix (3b commit 4): the attestation API's own absent shape (pagination-complete empty list) is
# distinct from a report lookup's absent shape (404) -- proven here by using the wrong one.
assert_decision "adopt refused: attestationLookup absent via the wrong shape (404, not pagination)" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["filesystemSecretScan"]["attestationLookup"] = {"status": "absent", "observedCode": 404, "queriedRef": "x:sha-x"}' "$present_mono_es")")" \
  UNKNOWN '[]' false false
```

The fourth case asserts `UNKNOWN`, not `CONFLICT` or a schema-rejection: `assert_decision` pipes the
observation JSON into `publish-decision.sh` regardless of whether it would pass
`observation.schema.json` (the decision script has no schema validator built in — that's
`contract-agreement.test.sh`'s job, run separately). The old 404-shaped `absent` object is missing
`reason`/`paginationComplete`/`queried`, so `attestation_lookup.get("attestationVerified")` in
`evidence_set_problems()` (Task 2, Step 3) reads `None` off a dict that also lacks `status: "present"`
— falling into the existing "attestationLookup is not present" branch, same as any other absent
attestation, which the pre-existing "one kind is missing its attestation" case already asserts as
CONFLICT... **actually verify this by running it**, don't assume: the exact verdict depends on
whether `type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present"`
trips first (it does — `status` is `"absent"`, not `"present"`), so the real, correct expected
verdict is CONFLICT, not UNKNOWN. Use `CONFLICT '[]' false false` for this fourth case, not UNKNOWN
— this note exists so the implementer runs it and confirms rather than trusting either verdict
blind.

- [ ] **Step 2: Add one case proving the nested retryable-scan extension**

Immediately after the four cases from Step 1, add:

```bash
# Fix (3b commit 4): a nested error (not absence) at one of the 16 report/attestation lookups must
# reach the same UNKNOWN/retryable gate as a top-level lookup error, not be folded into CONFLICT by
# evidence_set_problems() treating "errored" the same as "absent."
assert_decision "a nested report-lookup error is UNKNOWN and retryable, not CONFLICT" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["sbom"]["reportLookup"] = {"status": "error", "queriedRef": doc["reports"]["sbom"]["reportLookup"]["queriedRef"], "code": 503}' "$present_mono_es")")" \
  UNKNOWN '[]' false true
```

- [ ] **Step 3: Run the full suite**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -15`

Expected: `passed=210 failed=0` (204 baseline + 6 new cases from Steps 1-2). If Step 1's fourth case's
actual verdict differs from what you predicted, fix the `assert_decision` call to match the real
output — do not force the test to match a guess.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): give each evidence two lookups of its own (4/5)

Six new witness cases: the four new evidence_set_problems() boolean
checks (digestVerified, schemaValid, attestationVerified, and
attestationAbsent's distinct shape vs. a report's 404-shaped absent),
plus one proving a nested report/attestation lookup error reaches
UNKNOWN/retryable through nested_evidence_failures() rather than being
folded into CONFLICT. passed=210 failed=0."
```

---

### Task 5: Mutation rules, full suite sweep, ledger, and push

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: nothing — this is the commit's own completion.

- [ ] **Step 1: Add mutation rules for the new guards**

In `.github/scripts/publish-decision.mutations.py`'s `MUTATIONS` dict, following the exact
`old-string, new-string` tuple pattern every other entry uses (read the file's existing entries for
the exact surrounding-context convention before writing these — each key must be a string unique
enough that `str.replace` finds only the intended occurrence, same discipline the file's own header
comments describe), add mutations that disable:

- the `digestVerified`/`sizeVerified`/`schemaValid` check added in Task 2 Step 3 (target: the
  `elif not (report_lookup.get("digestVerified") is True ...` condition — replace with `elif False:`)
- the `attestationVerified` check added in Task 2 Step 3 (target: the
  `elif attestation_lookup.get("attestationVerified") is not True:` condition — replace with
  `elif False:`)
- `nested_evidence_failures()`'s contribution to the top-level scan (target:
  `failures += nested_evidence_failures(lookups)` — replace with a no-op, e.g. comment it out or
  replace with `failures += []`)

Name these three mutations following the file's existing naming convention (short, snake_case,
describing what becomes unwitnessed if the code is deleted — e.g.
`report_verification_outcomes_ignored`, `attestation_verified_outcome_ignored`,
`nested_evidence_errors_ignored`).

- [ ] **Step 2: Run the targeted mutation check for just these three rules**

Consult `publish-decision.mutations.py`'s own header/usage comment for how to run a subset (commit
2's plan notes the full sweep takes 20+ minutes and should only run once, at the end — the same
applies here). Run only the three new rules first.

Expected: all three `caught`.

- [ ] **Step 3: Full local suite sweep**

Run each of the following and confirm every suite's `passed=N failed=0` is at or above its prior
baseline:

```bash
bash .github/scripts/publish-decision.test.sh
bash .github/scripts/contract-agreement.test.sh
bash .github/scripts/contract-agreement.report.test.sh
bash .github/scripts/manifest-agreement.test.sh
bash .github/scripts/evidence-set-schema.test.sh
bash .github/scripts/predicates-schema.test.sh
bash .github/scripts/common-sh-usage.test.sh
```

Expected: `publish-decision.test.sh` at `passed=210 failed=0` (Task 4's new baseline),
`contract-agreement.test.sh` at `passed=32 failed=0` (unchanged), every other suite unchanged from
its value before this commit (none of their fixtures touch evidence-set report/attestation shapes).

- [ ] **Step 4: Full mutation sweep**

Run the complete `publish-decision.mutations.py` sweep (not just the three new rules).

Expected: every mutation caught, zero survivors. Report the actual total count (do not guess it in
advance) in the commit message and the ledger entry.

- [ ] **Step 5: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings.

- [ ] **Step 6: Update the ledger**

Append to `.superpowers/sdd/progress.md`:

```markdown
## 3b commit 4: give each evidence two lookups of its own

reportLookup and attestationLookup split into two independent unions (reportEvidenceLookup,
attestationEvidenceLookup) per spec section 5, replacing commit 2's shared objectLookup placeholder.
attestationEvidenceLookup gets its own absent shape (pagination-complete empty list, not a 404) --
the GitHub Attestations API and an OCI registry answer "not there" differently, and asserting the
wrong one asserts an observation nobody made. evidence_set_problems() now checks the new
digestVerified/sizeVerified/schemaValid/attestationVerified outcome fields, not just each lookup's
status -- closing the gap where a fetch could succeed but its verification fail and nothing would
notice. decide()'s retryable-error scan extended to the 16 report/attestation lookups nested inside
the two evidence-set lookups, via explicit enumeration gated on each evidence-set's own presence,
per section 5's constraint against a recursive status-key walk (which would also match unrelated
status-shaped objects).

A real bug surfaced during scratch verification before this plan was written: the first, unguarded
version of the nested scan crashed with a TypeError on two pre-existing structurally-malformed
fixtures ("reports is missing", "a report pair is not an object") that evidence_set_problems() is
supposed to catch as CONFLICT -- the scan has to be defensive about the same malformed shapes the
problems-check already tolerates, or it crashes before that check ever runs.

Migration: 17 static fixtures (one migration script, since all 17 used the identical old shape) plus
publish-decision.test.sh's present_evidence_set() builder (one edit fixes nearly every default-case
test) plus one hand-migrated attestationLookup-absent case. No fixture's proven rule changed.

Final: publish-decision.test.sh 210/0 (204 baseline + 6 new witness cases), contract-agreement.
test.sh 32/0 (unchanged). Mutation sweep: [fill in actual count]/[count] caught, zero survivors.

Known, deliberate gaps carried forward (not to be rediscovered as new): normalizedReport/
normalizedPredicate stay loosely typed until commit 5 (spec section 6); attestationAbsent.queried's
tuple is not yet the full section 8 tuple (commit 7's job); commit 3's predicate schemas are not
wired into normalizedPredicate (no spec text assigns this to any commit; would be scope creep here).

Next: 3b commit 5, "make the scan verdict something the decision recomputes" (spec section 6) --
normalizedReport/normalizedPredicate get real shape, counts aggregate by (severity, fixAvailable),
the 101st-finding-still-fails witness, recomputedOutcome compared against three independent sources.
```

- [ ] **Step 7: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py .superpowers/sdd/progress.md
git commit -m "contract(ci): give each evidence two lookups of its own (5/5)

Three new mutation rules for the new boolean checks and the nested-
error scan -- all caught. Full local suite sweep clean at or above
every prior baseline. shellcheck clean over both script directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then
`gh run watch <id> --exit-status`), and separately confirm CI actually exercised the changed suites:

```bash
gh run view <run-id> --log 2>/dev/null | grep -iE "publish-decision\.test|contract-agreement\.test|passed="
```

Expected to see `passed=210 failed=0` and `passed=32 failed=0` attributed to
`publish-decision.test.sh`'s and `contract-agreement.test.sh`'s own output lines in the CI log. If
CI fails for a reason unrelated to this commit's own changes (e.g. a pre-existing frontend dependency
audit failure, as seen on the prior commit in this series), do not treat that as this task's failure
— report it, but the lint/contract portion passing with the exact counts above is what completes this
task.

---

## Self-Review

**Spec coverage** — spec §5 line by line against Tasks 1-4:
- Two independent lookups, two different unions → Task 1.
- `reportLookup`/`attestationLookup` use different `absent` shapes (404 vs. pagination-complete
  empty list) → Task 1's `attestationAbsent`, witnessed by Task 4 Step 1's fourth case.
- Trust boundary: report proves bytes/hash/schema, attestation proves signer/source-revision/verify
  outcome, decision compares them independently → Task 1's `presentReport`/`presentAttestation`
  field split; Task 2 Step 3's checks are what actually compares/enforces them.
- "Fetched but wrong schema ⇒ CONFLICT" → Task 2 Step 3, witnessed by Task 4 Step 1's first three
  cases.
- Don't push an evidence lookup's error up to `finalMarker.status: error` → unaffected by this
  commit (marker error handling untouched); the analogous rule for evidence-set lookups is Task 2's
  retryable-scan extension keeping nested errors on their own gate rather than folding them into
  `evidence_set_problems()`'s CONFLICT path.
- 16 nested lookups, enumerated not recursive, retryable scan extended → Task 2 Steps 1-2, witnessed
  by Task 4 Step 2.
- Retryable only when every error is retryable (pre-existing rule, spec 3a §10) → unaffected;
  `nested_evidence_failures()`'s output feeds the same `all(retryable_failure(...))` check the
  top-level scan already used, so the rule extends for free.

**Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" anywhere in the tasks above; every
fixture and code change is shown in full; Task 5's ledger entry has one explicit `[fill in actual
count]` placeholder, which is intentional (the plan cannot know the mutation sweep's total count
before it runs) and is filled from Task 5 Step 4's real output, not left as a placeholder in the
final commit.

**Type consistency** — `nested_evidence_failures(lookups)` returns the same `list[tuple[str, dict]]`
shape `decide()`'s existing `failures` list already uses, confirmed by Step 2's `failures +=` (not a
type mismatch requiring a merge function). `EVIDENCE_REPORT_KINDS` is defined once (Task 2 Step 1)
and consumed by both `evidence_set_problems()` (existing loop, now using the constant instead of an
inline tuple) and `nested_evidence_failures()` (new), so the four kind names cannot drift between the
two functions. The `damaged_evidence_set` Python-`exec()` calls in Task 4 use `False`/`True` (Python
booleans), matching every pre-existing call of the same helper elsewhere in the file, not JSON
`false`/`true`.
