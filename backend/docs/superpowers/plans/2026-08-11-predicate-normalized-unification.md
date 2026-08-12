# Predicate/normalized unification (roadmap 1.4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish what 1.4a started. After 1.4a's `findings[]` enrichment, comparing the 3 scan predicate
schemas' full `required` list against `normalizedScanContent`'s full `required` list (both read directly
from the real schema files, not from memory) shows the gap was only partially closed:

```
predicate required:            scanner, vulnerabilityDb/ruleset, target, timestamp, findings, truncated
normalizedScanContent required: scanner, target, policy, counts, findings, truncated, declaredOutcome, reportDigest
```

`policy`, `counts`, `declaredOutcome`, `reportDigest` are still missing from all 3 predicate schemas'
top level. Since the collectors already compute all four (roadmap 1.1, already merged, into a SEPARATE
"normalized view" return value that never gets pushed), the predicate document and the normalized view
are — after this plan — the same shape. This plan merges them: the 3 collectors go back to returning a
single dict (undoing the 2-tuple split 1.1 introduced), because a 2-tuple of two identical shapes is not
a real distinction, it is duplicate computation of the same document.

**Architecture:** Add `policy`/`counts`/`declaredOutcome`/`reportDigest` to the 3 scan predicate
schemas' top level (reusing `observation.schema.json`'s `scanPolicy`/`scanCounts` `$defs` via
cross-file `$ref`, the same pattern the predicate schemas already use for `digest`). Simplify each
collector's `collect_*` function to build ONE dict that is simultaneously the pushed predicate document
and the normalized-view shape, removing the now-redundant second computation. Every caller that
currently unpacks a 2-tuple (from roadmap 1.1's own change) reverts to using a single dict.

**Tech Stack:** JSON Schema (Draft 2020-12), Python 3.10+.

## Global Constraints

- `reportDigest`'s own value is decorative on the report side (per `normalizedScanContent`'s own
  description, already read this session: "Only the attestation side's value is read by the decision's
  binding check ... the report side carries the same field for shape symmetry"). It cannot be a literal
  self-hash of the full document (that would be circular — the digest of a document that contains its
  own digest). Compute it as the `sha256` of `canonical.canonical_bytes` of the document **without** the
  `reportDigest` key present (i.e., compute the digest of every other field first, then add
  `reportDigest` as the last key) — this is the only non-circular construction, and it is what the
  collector already effectively does today for the (soon-to-be-removed) separate normalized view, just
  needs to become the single document's own value.
- `policy`/`counts` reuse `observation.schema.json`'s `$defs/scanPolicy` and `$defs/scanCounts` via
  `{"$ref": "../observation.schema.json#/$defs/scanPolicy"}` (mirroring how these predicate schemas
  already `$ref` `../observation.schema.json#/$defs/digest` for other fields — check the exact existing
  `$ref` path convention in the file before adding a new one, do not invent a different relative path).
- Every fixture in `.github/contracts/predicates-fixtures/valid/` and `invalid/` needs the 4 new
  top-level fields added (except where a fixture specifically tests one of these fields being absent/
  wrong — none of the current 11 fixtures do, confirmed by grepping for `policy`/`counts`/
  `declaredOutcome`/`reportDigest` across the corpus before starting; if this grep finds a hit, read
  that fixture's own filename/intent before touching it, the same way 1.4a preserved
  `vulnerability-scan-finding-missing-fixavailable.json`'s own violation).
- Every caller of the 3 changed collector functions that currently does `document, normalized =
  collect_x(...)` reverts to `document = collect_x(...)` — grep `.github/scripts/*.py` and
  `.github/scripts/*.test.py` for calls to `collect_vulnerability_scan`/`collect_layer_secret_scan`/
  `collect_filesystem_secret_scan` to find every call site before starting (expected:
  `evidence-set-envelope.py`... no, `evidence-set-envelope.py` itself doesn't call collectors directly,
  only its TEST does — confirm this by grepping rather than assuming, since getting this wrong means a
  caller silently breaks).
- Full corpus re-validation required, same discipline as 1.4a: `predicates-schema.test.sh`,
  `collect-vulnerability-scan.test.py`, `collect-secret-scan.test.py`, `evidence-set-envelope.test.py`
  (the critical regression check), plus the sibling sweep (`manifest-agreement.test.sh`,
  `contract-agreement.test.sh`, `contract-agreement.report.test.sh`, `evidence-set-schema.test.sh`) —
  compare against the known baseline (documented in `.superpowers/sdd/progress.md`'s own entries from
  1.4a: `manifest-agreement.test.sh` 23/2, `contract-agreement.test.sh` 3/33, `contract-agreement.report.test.sh`
  6/1, all pre-existing environment artifacts, not regressions — use the same throwaway-worktree-at-
  baseline-commit technique 1.4a's own agent used if any count differs from this, don't assume a
  mismatch is automatically fine).

---

## File Structure

- Modify: `.github/contracts/predicates/vulnerabilityScan.schema.json`,
  `layerSecretScan.schema.json`, `filesystemSecretScan.schema.json`
- Modify: every fixture under `.github/contracts/predicates-fixtures/{valid,invalid}/` (11 files total,
  confirm exact count by listing the directory)
- Modify: `.github/scripts/collect-vulnerability-scan.py`, `collect-vulnerability-scan.test.py`
- Modify: `.github/scripts/collect-secret-scan.py`, `collect-secret-scan.test.py`
- Modify: `.github/scripts/evidence-set-envelope.test.py` (the one real caller unpacking tuples today)

## Interfaces

- `collect_vulnerability_scan(tarball_path, image_name, ignore_file_path) -> dict` — single dict,
  matching BOTH the predicate schema and `normalizedScanContent` (now the same shape).
- `collect_filesystem_secret_scan(tarball_path, image_name, ruleset_path) -> dict`,
  `collect_layer_secret_scan(...) -> dict` — same simplification.

---

### Task 1: Extend the 3 predicate schemas fully

**Files:**
- Modify: `.github/contracts/predicates/vulnerabilityScan.schema.json`,
  `layerSecretScan.schema.json`, `filesystemSecretScan.schema.json`

- [ ] **Step 1: Read one file fully first to find the exact existing `$ref` convention**

Read `.github/contracts/predicates/vulnerabilityScan.schema.json` completely (it is short). Find how it
already references `observation.schema.json` for the `digest` `$def` (e.g. inside
`vulnerabilityDb.properties.digest`) — copy that exact relative path string for the two new `$ref`s this
task adds.

- [ ] **Step 2: Add the 4 fields to each schema's top level**

For all 3 files, add to `required`: `"policy", "counts", "declaredOutcome", "reportDigest"` (appended to
the existing list, order does not matter for `required` arrays but keep it readable), and add to
`properties`:
```json
        "reportDigest": { "$ref": "../observation.schema.json#/$defs/digest" },
        "policy": { "$ref": "../observation.schema.json#/$defs/scanPolicy" },
        "counts": { "$ref": "../observation.schema.json#/$defs/scanCounts" },
        "declaredOutcome": { "type": "boolean" }
```
(Use the exact relative path confirmed in Step 1, which may differ from this example if the file's own
convention differs — do not guess, read first.)

- [ ] **Step 3: Commit**

```bash
git add .github/contracts/predicates/vulnerabilityScan.schema.json .github/contracts/predicates/layerSecretScan.schema.json .github/contracts/predicates/filesystemSecretScan.schema.json
git commit -m "fix(contracts): predicate documents need policy/counts/declaredOutcome/reportDigest too"
```

Do not run tests yet — Task 2 updates fixtures this will otherwise break.

---

### Task 2: Update the fixture corpus (round 2)

**Files:**
- Modify: every fixture under `.github/contracts/predicates-fixtures/{valid,invalid}/` that does not
  already have the 4 new fields.

- [ ] **Step 1: Add the 4 new fields to every fixture**

For each `valid/*.json` fixture, add realistic values:
```json
  "reportDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  "policy": {"severityThreshold": "HIGH", "ignoreList": [], "ignoreFileDigest": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},
  "counts": {"CRITICAL": {"withFix": 0, "withoutFix": 0}, "HIGH": {"withFix": 1, "withoutFix": 0}, "MEDIUM": {"withFix": 0, "withoutFix": 0}, "LOW": {"withFix": 0, "withoutFix": 0}, "UNKNOWN": {"withFix": 0, "withoutFix": 0}},
  "declaredOutcome": true
```
(Adjust `counts` to genuinely match whatever `findings` array that specific fixture already has — e.g.
for `valid/vulnerability-scan.json`'s one `HIGH`+`fixAvailable:true` finding, `counts.HIGH.withFix`
must be `1` and every other cell `0`, and `declaredOutcome` must be `true` per the spec's own rule
(`HIGH` with a fix = fail) — do not paste the same numbers into every fixture, compute them from what
each fixture's own `findings` array actually contains.)

For each `invalid/*.json` fixture, add the same 4 fields with internally-consistent values (matching
its own `findings`) UNLESS the fixture's violation IS about one of these 4 fields — none currently are,
confirmed in Global Constraints, so every invalid fixture gets consistent values for these 4 fields,
keeping the fixture invalid for only its own already-named reason.

- [ ] **Step 2: Run the predicate schema test suite**

Run: `PYTHON_BIN=python bash predicates-schema.test.sh` (from `.github/scripts/`). Expected:
`passed=14 failed=0`.

- [ ] **Step 3: Commit**

```bash
git add .github/contracts/predicates-fixtures/
git commit -m "fix(contracts): update predicate fixtures for policy/counts/declaredOutcome/reportDigest"
```

---

### Task 3: Simplify the 3 collectors back to a single dict

**Files:**
- Modify: `.github/scripts/collect-vulnerability-scan.py`, `.github/scripts/collect-vulnerability-scan.test.py`
- Modify: `.github/scripts/collect-secret-scan.py`, `.github/scripts/collect-secret-scan.test.py`
- Modify: `.github/scripts/evidence-set-envelope.test.py`

- [ ] **Step 1: Read the current merged code of all 3 functions**

Read `collect_vulnerability_scan`, `collect_filesystem_secret_scan`, `collect_layer_secret_scan` in
full as they exist right now (post-1.4a) — each currently builds a `document` dict (the predicate,
now already carrying the enriched `findings` from 1.4a) and a separate `normalized` dict (carrying
`policy`/`counts`/`declaredOutcome`/`reportDigest`/`findings`(sorted)/`truncated`/`scanner`/`target`)
and returns `(document, normalized)`.

- [ ] **Step 2: Merge into one dict per function**

The single returned dict must satisfy the now-extended predicate schema (which is now identical in
shape to `normalizedScanContent`). Use the `normalized` dict's own field values as the source of truth
for `policy`/`counts`/`declaredOutcome`/`reportDigest`/`findings` (sorted, matching the spec's own
5-field tuple order already implemented in 1.1 — the OLD `document`'s own `findings` was capped from
`all_raw_findings` in original insertion order, not sorted; the NEW single dict's `findings` must use
the SORTED order, since that is what the schema's witness discipline expects and what the normalized
view already computed correctly) and `target`/`scanner` from whichever of the two matches the predicate
schema's own field name expectations exactly (`target` as the plain string `image_name` for the
predicate side vs. `{"imageDigest": ...}` for the normalized side — READ THE SCHEMA to confirm which
shape `target` needs to be now that both were meant to unify: the predicate schema's `target` property
is `{"type": "string", "minLength": 1}` per the original file, while `normalizedScanContent`'s `target`
is `{"imageDigest": digest}` — this is a genuine remaining shape conflict between the two `target`
definitions that Task 1 must resolve by NOT `$ref`-ing `target` into the unified schema, keeping the
predicate schema's own simple string `target` as the authoritative shape, and treating this collector
merge as "produce the predicate schema's `target` string, not `normalizedScanContent`'s `target`
object" — reconcile this explicitly rather than silently picking one; if Task 1's implementer finds this
conflict, they must choose the predicate schema's plain-string `target` and update Task 1's own `$ref`
list to exclude `target`, keeping the existing plain-string `target` property untouched, then this
Task 3 note is already consistent).

Recompute `reportDigest` last (over the document with every OTHER field already final, per Global
Constraints' anti-circularity rule).

- [ ] **Step 3: Update each collector's docstring/return type**

Change `-> tuple` back to `-> dict` in each function signature, remove now-dead helper functions if any
(e.g. if a helper existed solely to build the now-removed second dict).

- [ ] **Step 4: Fix the test files**

Each collector's own `.test.py` currently unpacks `document, normalized = collect_x(...)` — revert to
`document = collect_x(...)`, and merge the normalized-view assertions (already present from 1.1) to
check the SAME `document` dict instead of a separate `normalized` variable (the assertions' content
does not need to change, only which variable they read from).

`evidence-set-envelope.test.py`'s 3 call sites (added/modified across roadmap 1.1 and 1.4a) revert from
`vuln_document, _vuln_normalized = collect_vulnerability_scan(...)` (and the 2 secret-scan equivalents)
back to single-value assignment.

- [ ] **Step 5: Run every affected test**

Run `collect-vulnerability-scan.test.py` (expect the same count as before this task, since the
assertions are unchanged, only their source variable), `collect-secret-scan.test.py`,
`evidence-set-envelope.test.py` (expect `passed=6 failed=0`, the critical regression check).

- [ ] **Step 6: Full sibling-suite sweep**

Same suites as 1.4a's own Task 3 Step 4. Compare against the baseline documented in
`.superpowers/sdd/progress.md`'s 1.4a entry; use a throwaway worktree at the pre-this-plan commit to
verify any count that doesn't match is pre-existing, the same technique 1.4a's agent used.

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/collect-vulnerability-scan.py .github/scripts/collect-vulnerability-scan.test.py .github/scripts/collect-secret-scan.py .github/scripts/collect-secret-scan.test.py .github/scripts/evidence-set-envelope.test.py
git commit -m "refactor(ci): unify predicate document and normalized view into one shape"
```

---

## Explicitly out of scope for this plan

- SBOM: no predicate schema exists for it, and none is needed — `sbomDocumentContent`'s fields
  (`spdxVersion`, `documentValidated`, `subjectDigest`, `packageCount`, `canonicalDigest`,
  `canonicalSize`) are all derivable by re-parsing the raw SPDX document a reader fetches back
  (`spdxVersion` and `packageCount` are already in the document; `documentValidated` is recomputed by
  checking `spdxVersion == "SPDX-2.3"` at read time; `canonicalDigest`/`canonicalSize` are recomputed
  from the document's own bytes; `subjectDigest` comes from the caller's own already-known image
  digest, not from the document itself). This needs no schema change — confirmed by comparing
  `collect-sbom.py`'s current output against `sbomDocumentContent`'s required fields, no gap found.
- Building `read_evidence_set_lookup` itself (roadmap 1.4, resumes once this plan closes the gap it
  found for the second and, per this plan's own thorough field-by-field comparison, final time).

## Self-Review Notes

- Spec coverage: this plan closes the FULL gap between predicate schemas and `normalizedScanContent`,
  confirmed by a complete field-by-field comparison (not just the one field roadmap 1.4a happened to
  need) — `required` lists for both are quoted verbatim in this plan's own Goal section.
- Placeholder scan: no TBD/TODO. The `target` shape conflict Task 3 Step 2 identifies is resolved
  explicitly with a stated decision (keep the predicate schema's plain-string `target`), not left open.
- Type consistency: all 3 collectors return `dict` (not `tuple`) after this plan, reverting roadmap
  1.1's tuple split now that it is confirmed unnecessary — every caller updated to match, listed
  explicitly in File Structure.
