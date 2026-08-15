# Predicate findings enrichment (roadmap 1.4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a real gap found while designing `read_evidence_set_lookup` (roadmap 1.4): the 3 scan
predicate schemas' `findings[]` only require `{severity, fixAvailable}`, but
`observation.schema.json`'s `normalizedScanContent.finding` (used by BOTH `reportLookup`'s
`normalizedReport` and `attestationLookup`'s `normalizedPredicate`) requires `packageName`/
`vulnerabilityId`/`targetPath` too. Since the predicate document IS the report blob pushed to the
evidence-set (confirmed: no other schema describes report-layer content — design doc section 2 only
pins the layer's `mediaType`, not a separate content shape), a reader fetching that blob back from the
registry cannot reconstruct a valid `normalizedReport` from what predicate schemas currently allow to
be pushed. Extend the 3 predicate schemas, the fixture corpus that already validates them, and the
already-merged collectors that build them (stop stripping the 3 fields the collectors already compute
internally — this is unblocking already-collected data, not collecting anything new).

**Architecture:** Add 3 required properties to each of the 3 scan predicate schemas' `findings[].items`.
Update every fixture in `predicates-fixtures/` to keep validating as intended (a `valid/` fixture needs
real values for the new fields; an `invalid/` fixture that tests one specific violation needs the new
fields added too, so it keeps failing for exactly the one reason it is meant to prove, not
coincidentally for a second, unrelated reason). Change the 3 collectors' predicate-document construction
from `{"severity": ..., "fixAvailable": ...}` (stripping) to the full enriched finding dict they already
build for the normalized view — this is deleting a stripping step, not adding new logic.

**Tech Stack:** JSON Schema (Draft 2020-12, matching every other contract file), Python 3.10+ for the
collector changes.

## Global Constraints

- Same floor as every prior schema change in this project: `additionalProperties: false` stays in
  force — the 3 new fields join `required`, they do not relax anything.
- `packageName`/`vulnerabilityId`/`targetPath` types match `observation.schema.json`'s own `finding`
  $def exactly: all three `{"type": "string", "minLength": 1}` — copy the constraint, not just the key
  names.
- Every fixture in `.github/contracts/predicates-fixtures/valid/` and `.github/contracts/predicates-fixtures/invalid/`
  that has a `findings` array must be updated so each finding entry carries all 5 fields. An `invalid/`
  fixture must keep testing exactly the one violation its filename names — verify this by construction
  (add the 3 new fields with valid values, touching nothing else in a fixture whose violation is
  unrelated to findings shape; for the two `findings`-shape-related invalid fixtures already in the
  corpus — `vulnerability-scan-finding-missing-fixavailable.json` and the two `hits-cap-without-truncated`
  fixtures — add the 3 new fields too, so they still fail for exactly their own named reason, not
  coincidentally for a second reason the new required fields would otherwise introduce).
- The 3 collectors (`collect-vulnerability-scan.py`, `collect-secret-scan.py`'s two functions) already
  compute `packageName`/`vulnerabilityId`/`targetPath` internally for the normalized view (roadmap 1.1,
  already merged) — this task does not add any new data collection, it only stops throwing this data
  away when building the predicate document that gets pushed.
- After this change, `evidence-set-envelope.test.py` (already merged, pushes real predicate documents
  from real collectors) is a genuine end-to-end regression check — its own schema validation against
  `release-evidence-set.schema.json` does not check `findings[]` shape (that schema only cares about the
  4-layer manifest structure), but its content now flows through with the enriched shape; confirm no
  other already-merged test asserts the OLD sparse shape as an exact-match expectation (grep for
  `"findings"` across all already-merged `.test.py` files before touching schema, to find every affected
  caller up front rather than discovering them one at a time).
- Full corpus re-validation required after the schema change, given this touches an already-CI-verified
  contract area (3b epic): re-run `predicates-schema.test.sh` (expect 14/0, same count as before — this
  is a compatible extension of the schema, not a removal, so no fixture that passed before should
  newly fail except the ones this plan explicitly updates), and spot-check that
  `.github/contracts/fixtures/` (the observation-level corpus) contains no embedded predicate document
  bodies that would need the same update (expected: it doesn't — observation-level `evidence.<kind>`
  entries only carry `digest`/`predicateType`/`passed`, never the predicate body itself, confirmed by
  reading `observation.schema.json`'s `scanEvidenceEntry`/`sbomEvidenceEntry` $defs earlier this
  session — but grep to confirm this assumption holds on the real fixture files, not just the schema).

---

## File Structure

- Modify: `.github/contracts/predicates/vulnerabilityScan.schema.json`
- Modify: `.github/contracts/predicates/layerSecretScan.schema.json`
- Modify: `.github/contracts/predicates/filesystemSecretScan.schema.json`
- Modify: `.github/contracts/predicates-fixtures/valid/vulnerability-scan.json`,
  `layer-secret-scan.json`, `filesystem-secret-scan.json`
- Modify: `.github/contracts/predicates-fixtures/invalid/*.json` (all 8 files with a `findings` key)
- Modify: `.github/scripts/collect-vulnerability-scan.py` (stop stripping)
- Modify: `.github/scripts/collect-secret-scan.py` (stop stripping, both functions)
- Modify: `.github/scripts/collect-vulnerability-scan.test.py`, `collect-secret-scan.test.py` — the
  predicate-document schema-validation assertions already present in these files will now also cover
  the 3 new required fields automatically (no test code change needed there, since they already
  validate the returned `document` against the real schema — just confirm this after the schema change,
  do not skip re-running).

## Interfaces

No new functions. This plan changes: (1) 3 schema files' `required`/`properties` for `findings[].items`,
(2) fixture file contents, (3) 6 lines total across 2 already-merged collector files (the dict literal
each collector builds for its predicate document's `findings`).

---

### Task 1: Extend the 3 predicate schemas

**Files:**
- Modify: `.github/contracts/predicates/vulnerabilityScan.schema.json`
- Modify: `.github/contracts/predicates/layerSecretScan.schema.json`
- Modify: `.github/contracts/predicates/filesystemSecretScan.schema.json`

- [ ] **Step 1: Edit each schema's `findings[].items`**

In all 3 files, change:
```json
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["severity", "fixAvailable"],
          "properties": {
            "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
            "fixAvailable": { "type": "boolean" }
          }
        }
```
to:
```json
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["severity", "fixAvailable", "packageName", "vulnerabilityId", "targetPath"],
          "properties": {
            "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
            "fixAvailable": { "type": "boolean" },
            "packageName": { "type": "string", "minLength": 1 },
            "vulnerabilityId": { "type": "string", "minLength": 1 },
            "targetPath": { "type": "string", "minLength": 1 }
          }
        }
```
(Read each file first to confirm the exact current indentation/formatting before editing, matching this
repo's established style of preserving surrounding formatting exactly.)

- [ ] **Step 2: Commit**

```bash
git add .github/contracts/predicates/vulnerabilityScan.schema.json .github/contracts/predicates/layerSecretScan.schema.json .github/contracts/predicates/filesystemSecretScan.schema.json
git commit -m "fix(contracts): predicate findings need packageName/vulnerabilityId/targetPath for normalizedReport"
```

Do not run the full test suite yet — Task 2 updates the fixtures this schema change will otherwise
break; running tests between Task 1 and Task 2 is expected to show real, temporary failures and is not
a signal to revert.

---

### Task 2: Update the fixture corpus

**Files:**
- Modify: `.github/contracts/predicates-fixtures/valid/vulnerability-scan.json`
- Modify: `.github/contracts/predicates-fixtures/valid/layer-secret-scan.json`
- Modify: `.github/contracts/predicates-fixtures/valid/filesystem-secret-scan.json`
- Modify: `.github/contracts/predicates-fixtures/invalid/*.json` — every file with a `findings` key
  (confirm the exact list by grepping, do not assume the list in this plan is exhaustive if the repo
  has changed since this plan was written)

- [ ] **Step 1: Update the 3 valid fixtures**

For `valid/vulnerability-scan.json`, change the one finding entry from:
```json
    { "severity": "HIGH", "fixAvailable": true }
```
to:
```json
    { "severity": "HIGH", "fixAvailable": true, "packageName": "openssl", "vulnerabilityId": "CVE-2024-0001", "targetPath": "ghcr.io/owner/name/monolith (debian 12.5)" }
```
(Realistic-looking values, matching this fixture's existing style of plausible-but-fake data — check the
fixture's existing `target`/`scanner` fields for the established naming convention before choosing
values, so the new fields read consistently with what's already there.)

For `valid/layer-secret-scan.json` and `valid/filesystem-secret-scan.json`: read each file first (their
finding shape may differ slightly, e.g. secret-scan findings might already have zero entries in the
`findings` array if the fixture represents a clean scan — in that case, no per-finding edit is needed at
all, since an empty array has no items to fail the new `required` list; only add fields if the fixture's
`findings` array is non-empty).

- [ ] **Step 2: Update every invalid fixture with a `findings` key**

Run `grep -rl '"findings"' .github/contracts/predicates-fixtures/invalid/` to get the real, current
list. For each match, read the file, and add the 3 new fields to every finding entry with valid-looking
values UNLESS the fixture's own point is specifically about a finding's shape being wrong (in which case
check whether adding the 3 new fields changes what's being tested — for
`vulnerability-scan-finding-missing-fixavailable.json`, the point is "fixAvailable is missing", so add
`packageName`/`vulnerabilityId`/`targetPath` alongside the existing single `severity` field, keeping
`fixAvailable` absent — the fixture keeps testing exactly its own named violation, now with the other
4 fields present so it is not ALSO invalid for a second, accidental reason).

- [ ] **Step 3: Run the predicate schema test suite**

Run: `cd .github/scripts && python-bin.sh`-sourced `PYTHON_BIN=python bash predicates-schema.test.sh`
(or however this project's established invocation works — check the file's own header for the exact
command, matching how every other `*.test.sh` in this repo is invoked this session).
Expected: `passed=14 failed=0` — the same count as before this plan started (a compatible extension, no
fixture should newly fail except transiently between Task 1 and this step, which is now resolved).

- [ ] **Step 4: Commit**

```bash
git add .github/contracts/predicates-fixtures/
git commit -m "fix(contracts): update predicate fixtures for the enriched findings shape"
```

---

### Task 3: Stop stripping the fields in the collectors

**Files:**
- Modify: `.github/scripts/collect-vulnerability-scan.py`
- Modify: `.github/scripts/collect-secret-scan.py`

- [ ] **Step 1: Confirm the exact current stripping lines**

Read `.github/scripts/collect-vulnerability-scan.py`'s `collect_vulnerability_scan` function (added in
roadmap task 1.1, already merged) — it currently has a line building `predicate_findings` by stripping
each `all_raw_findings` entry down to `{"severity": ..., "fixAvailable": ...}` before capping. Read
`.github/scripts/collect-secret-scan.py`'s equivalent stripping step (added in the same roadmap task,
inside whichever helper builds the predicate document's `findings` from the enriched `all_findings`
list) — confirm the exact current code by reading the file, not by trusting this plan's paraphrase of
it (roadmap 1.1's own subagent report already noted this exact stripping step was added deliberately at
the time, specifically because the OLD predicate schema forbade the extra fields — that constraint no
longer holds after Task 1/2 of this plan).

- [ ] **Step 2: Remove the stripping**

In `collect-vulnerability-scan.py`, change:
```python
    predicate_findings = [{"severity": f["severity"], "fixAvailable": f["fixAvailable"]}
                           for f in all_raw_findings]
    capped_predicate_findings, truncated = _cap_findings_list(predicate_findings)
```
to:
```python
    capped_predicate_findings, truncated = _cap_findings_list(all_raw_findings)
```
(`all_raw_findings` already has the full 5-field shape — the predicate document's `findings` can now be
exactly the capped version of it, no separate stripped copy needed.)

In `collect-secret-scan.py`, make the equivalent change wherever the predicate document's `findings` is
currently built from a stripped copy of the enriched finding list — read the file first to find the
exact current line, since Task 2 of the original secret-scan-enrichment work (roadmap 1.1) may have
structured this slightly differently between the filesystem and layer functions.

- [ ] **Step 3: Run the collector test suites**

Run: `cd .github/scripts && python collect-vulnerability-scan.test.py` — expect `passed=6 failed=0`
(unchanged count; the predicate-document schema-validation assertion already present now implicitly
also proves the 3 new fields are correctly present, since it validates against the real, now-updated
schema).
Run: `cd .github/scripts && python collect-secret-scan.test.py` — expect `passed=8 failed=0`.
Run: `cd .github/scripts && python evidence-set-envelope.test.py` — expect `passed=6 failed=0` (this is
the regression check: it pushes real predicate documents built by these collectors and validates the
resulting evidence-set manifest; confirm it still passes with the richer findings content flowing
through).

- [ ] **Step 4: Full sibling-suite sweep**

Given this touches an already-CI-verified contract area, run the broader local suites this session has
used throughout: `manifest-agreement.test.sh`, `contract-agreement.test.sh`,
`contract-agreement.report.test.sh`, `predicates-schema.test.sh` (again, to be sure), `evidence-set-schema.test.sh`.
All should show the same pass/fail counts as their last known-good state this session (documented in
`.superpowers/sdd/progress.md` if unsure what the baseline is) modulo the known Windows argv-length
artifact already established as expected noise.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collect-vulnerability-scan.py .github/scripts/collect-secret-scan.py
git commit -m "feat(ci): stop stripping packageName/vulnerabilityId/targetPath from pushed predicate documents"
```

---

## Explicitly out of scope for this plan

- Building `read_evidence_set_lookup` itself (roadmap 1.4, resumes after this plan closes the gap it
  found) or `read_marker_lookup`/other observer pieces.
- SBOM's own predicate schema — SBOM has no `findings` concept at all (spec section 4: "SPDX makes no
  verdict"), so this gap does not apply to it; no change needed there.

## Self-Review Notes

- Spec coverage: this plan closes exactly the gap found (normalizedScanContent's finding shape vs. the
  predicate schemas' narrower shape) with no scope creep into the observer work that discovered it.
- Placeholder scan: no TBD/TODO. Task 3's own uncertainty about secret-scan's exact current code
  structure is resolved by an explicit "read the file first" instruction, not a guess baked into the
  plan.
- Type consistency: the 3 new fields' types/constraints (`string`, `minLength: 1`) are copied verbatim
  from `observation.schema.json`'s own `finding` $def, not reinvented.
