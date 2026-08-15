# 3b commit 6 — "stop asking a SBOM for a verdict it does not make" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Unlike the immediately preceding plan (3b commit 5), the diffs in this plan were NOT verified**
> **against a live scratch worktree before being written down.** They are derived by direct pattern
> match against commit 5's own already-merged, already-tested code (the scan-kind split) and commit
> 2/4's own already-merged code (the marker evidence loop, the evidence-set report loop), plus the
> implementation-decisions addendum below. Treat every checkpoint number in this plan as a
> **prediction**, not a verified fact — confirm the real number at each Step and report it, the same
> discipline this series has already had to apply after previous plans stated wrong numbers (3b
> commit 2 Task 2, 3b commit 4 Task 4, 3b commit 5 Task 3). Where this plan had to make an
> implementation call the addendum leaves slightly open, it is called out explicitly as a **Plan
> Decision** below, same status as the addendum's own Decisions 1-4 — not yet scratch-verified,
> flag any output that disagrees with it rather than silently reconciling.

**Goal:** Replace SBOM's borrowed, meaningless `passed` claim with `documentValidated` (SPDX is an
inventory predicate, not a verdict), give SBOM's own `normalizedReport`/`normalizedPredicate` real
shape (`sbomDocumentContent`), and wire the reverse-direction binding spec section 4 names: the
attestation's canonicalized signed predicate digest/size must match the SBOM layer's own descriptor.

**Architecture:** Same structural-exclusion approach commit 5 used for scan-only shapes, now for
SBOM: two separate `$defs` (`sbomEvidenceEntry`/`scanEvidenceEntry`, `sbomPerImageEvidence`/
`scanPerImageEvidence`) rather than a conditional on `evidenceEntry`, because a single `$def` cannot
express "documentValidated when sbom, passed otherwise" — it does not know which kind it was
referenced under. `sbomReportAttestationPair` mirrors `scanReportAttestationPair` byte-for-byte in
structure, substituting `sbomDocumentContent` for `normalizedScanContent`. The reverse binding is a
decision-side field comparison only (`sbomDocumentContent.canonicalDigest`/`canonicalSize` against
`presentReport.descriptor.digest`/`size`) — the decision has no bytes and cannot canonicalize
anything itself; it trusts the collector's `canonicalDigest`/`canonicalSize` the same way it already
trusts `layersValid`, `schemaValid`, and every other collector-computed boolean/field in this
contract.

**Plan Decision A — `sbomDocumentContent` is one shared shape for both `normalizedReport` and
`normalizedPredicate`,** matching `normalizedScanContent`'s own precedent (one `$def` referenced from
both `reportLookup.present` and `attestationLookup.present`), carrying six fields: `spdxVersion`,
`documentValidated`, `subjectDigest`, `packageCount`, `canonicalDigest`, `canonicalSize`. The
addendum's Decision 1 lists the first four; Decision 3 adds `canonicalDigest`/`canonicalSize` to
"`sbomDocumentContent`" by name without saying which side(s) carry them. Both sides carry all six
fields (same shape, same required set, matching commit 5's own "content is symmetric" precedent) —
only the **attestation** side's `canonicalDigest`/`canonicalSize` is read by the binding check
(Decision 3: "the *signed predicate* is canonicalized"), because canonicalizing is something only
the attestation-verification step does to the bytes it verified. The report side still carries the
same two fields for shape symmetry, but the decision does not read them from that side — there is
nothing to compare them against on that side.

**Plan Decision B — the binding check lives in `evidence_set_problems()`'s reports loop,** parallel
to commit 5's scan-content branch, not in `marker_problems()`. `evidence_set_problems()` already has
both halves of the pair in scope (`report_lookup`, `attestation_lookup`) at the point commit 5's scan
branch sits, and the check needs exactly those two: `attestation_lookup`'s
`normalizedPredicate.canonicalDigest`/`canonicalSize` against `report_lookup`'s own
`descriptor.digest`/`descriptor.size`. `marker_problems()`'s evidence loop (spec section 2's
per-kind/per-image check) still needs its own SBOM split — `documentValidated` instead of `passed`,
plus `packageCount >= 1` — but that is a *different* check (the marker's own claim, spec section 2)
from the binding (a fact about the evidence-set's own two lookups, spec section 4) — same separation
commit 5 drew between `marker_problems()`'s third-source comparison and `evidence_set_problems()`'s
two-way comparison.

**Tech Stack:** Same as commits 1-5 — JSON Schema draft 2020-12, Python 3.10+ decision script, bash
test harnesses.

## Global Constraints

- `additionalProperties: false` at every object level.
- The three scan kinds (`vulnerabilityScan`, `layerSecretScan`, `filesystemSecretScan`) must not be
  touched by this commit's schema retyping or decision logic — `scanReportAttestationPair`,
  `scanPresentReport`, `scanPresentAttestation`, `normalizedScanContent`, `scan_content_problems()`,
  `recomputed_outcome()` all stay exactly as commit 5 left them.
- `packageCount >= 1` is the "not empty" half of spec section 4's three-part SBOM invariant, checked
  by the decision because it is a number in the document, not a property of bytes the decision never
  sees. `documentValidated` itself covers SPDX-2.3-validity only — do not fold emptiness or subject
  mismatch into that one boolean; each gets its own problem message (addendum Decision 2).
- Do not add `predicate.reportDigest` binding for the three scan kinds, and do not touch
  attestation-selection-tuple enforcement (spec section 8) — both are commit 7's job.
- Do not wire commit 3's predicate schemas (`.github/contracts/predicates/*.schema.json`) into
  `sbomDocumentContent` — no spec text assigns that to this commit.
- **Known environment artifacts on this Windows dev machine, not to be treated as defects and not to**
  **be fixed in this commit** (documented in commit 5's plan; carried forward because this commit's
  fixtures grow the same way commit 5's did):
  - `bash` on PATH resolves to WSL, not Git Bash. Set `PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"`
    (or the local equivalent) before running any suite or the mutation runner.
  - Bare `python3`/`python` on PATH may lack `jsonschema`/`referencing`. Set `PYTHON_BIN` to a real
    interpreter with those installed — `.github/scripts/python-bin.sh` reads `PYTHON_BIN`
    specifically, not `PYTHON`.
  - Once fixtures grow large enough (this commit adds `sbomDocumentContent` payloads to every
    marker-bearing and evidence-set-bearing fixture), `publish-decision.sh` can fail with
    `Argument list too long` from MSYS/git-bash on a large observation — absent on CI's ubuntu
    runners (much higher `ARG_MAX`). If you hit this locally, extract the embedded Python from
    `publish-decision.sh` (between the `<<'PYTHON'` and closing `PYTHON` markers) to a standalone
    `.py` file, change `strict_loads(sys.argv[2])` to
    `strict_loads(open(sys.argv[2], encoding='utf-8').read())`, and invoke it directly with the
    observation written to a file. Do not modify `publish-decision.sh`'s own I/O to work around this.
  - **New this commit, discovered during 3b commit 5's own Task 5:** once enough fixtures are large
    enough to trip the argv artifact, `publish-decision.mutations.py`'s own baseline check refuses to
    run ANY mutation ("the suite is red before any mutation ... fix that first") — by design, correct
    in general, but it means the *real* mutation runner may be permanently unable to produce a result
    on this Windows machine once that happens. If so, do not modify the committed runner. Instead
    write an uncommitted, ad hoc local wrapper (import `publish-decision.mutations.py` as a module,
    reuse its `run_suite`/`MUTATIONS`/`excerpt`, tolerate only the one specific, named argv-artifact
    case as a baseline exception, abort on any other red) for local due diligence before pushing — CI's
    own unmodified run against the real `ARG_MAX` is what actually verifies zero survivors, not the
    local wrapper. See `.superpowers/sdd/progress.md`'s 3b commit 5 Task 5 entry for the exact
    technique already used once.
- **Mutation-isolation discipline, discovered during 3b commit 5's own Task 5 (read before writing**
  **Task 4's witness fixtures):** a fixture that reaches CONFLICT does not automatically prove any
  *specific* guard is load-bearing — if a stronger, unrelated guard already fires on the same
  fixture, deleting the guard you meant to witness changes nothing observable, and its mutation
  survives despite a passing functional suite. Two concrete traps already hit once in this exact
  codebase: (1) damaging a value inside a report/attestation pair that ALSO trips a presence/shape
  guard elsewhere in the same call chain (e.g. `marker_problems()` calls `evidence_set_problems()`
  internally as part of its own `evidenceSetDigest` cross-check — damaging the evidence-set's report
  to test a marker-side guard also trips that internal call's own guards, swamping the one under
  test); (2) two mismatch checks on the same underlying fact where only one direction of disagreement
  is reachable without the other also firing (e.g. `declaredOutcome != recomputed` only isolates from
  `recomputed is False` when `recomputed` is actually `True`). When writing a new witness case in Task
  4, verify by removing the specific guard from a **local, uncommitted copy** of `publish-decision.sh`
  and confirming the suite goes red on exactly that case before trusting the fixture — do not assume
  CONFLICT alone proves isolation.

---

## File Structure

- `.github/contracts/observation.schema.json` — **modify**. New `$defs`: `sbomEvidenceEntry`,
  `scanEvidenceEntry`, `sbomPerImageEvidence`, `scanPerImageEvidence`, `sbomReportAttestationPair`,
  `sbomReportEvidenceLookup`, `sbomPresentReport`, `sbomAttestationEvidenceLookup`,
  `sbomPresentAttestation`, `sbomDocumentContent`. `evidence.sbom` re-pointed to
  `sbomPerImageEvidence`; `evidence.{vulnerabilityScan,layerSecretScan,filesystemSecretScan}`
  re-pointed to `scanPerImageEvidence`. `presentEvidenceSet.reports.sbom` re-pointed to
  `sbomReportAttestationPair`. `perImageEvidence`/`evidenceEntry` removed (nothing references them
  once the above lands). `reportAttestationPair`/`reportEvidenceLookup`/`presentReport`/
  `attestationEvidenceLookup`/`presentAttestation` **stay** — the three scan kinds' loosely-typed
  placeholder days are over (commit 5), but nothing else in the schema still points at the generic
  pair, so check with a search before removing it; if this plan is wrong about that, removing it is a
  Task 1 follow-up, not a blocker.
- `.github/scripts/publish-decision.sh` — **modify**. `marker_problems()`'s per-kind/per-image
  evidence loop splits `passed` (scans) from `documentValidated` + `packageCount` (sbom).
  `evidence_set_problems()`'s reports loop gains an SBOM-only branch: the canonical digest/size
  binding check (Plan Decision B).
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration (rename +
  reshape + envelope digest/size recomputation, per commit 6's own addendum Decision 4 and commit 5's
  Task 3 precedent) + new witness fixtures.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules.
- `.superpowers/sdd/progress.md` — ledger entry.

## Interfaces

- Consumes: `#/$defs/digest`, `#/$defs/hex64` (existing); `EVIDENCE_REPORT_KINDS`, `IMAGES`,
  `canonical_bytes` (existing, from earlier commits).
- Produces: no new Python functions — this commit only branches existing loops by kind, it does not
  need a `recomputed_outcome`-shaped helper (SBOM has no verdict to recompute, spec section 4's whole
  point).
- `sbomDocumentContent`'s six fields, consumed by both `marker_problems()` (reads
  `evidence.sbom.<image>.documentValidated`/... wait — `marker_problems()` reads
  `markerContent.evidence.sbom.<image>`, which is `sbomEvidenceEntry`, NOT `sbomDocumentContent`;
  `sbomDocumentContent` lives only under `presentEvidenceSet.reports.sbom.{reportLookup,
  attestationLookup}.present.{normalizedReport,normalizedPredicate}`, read only by
  `evidence_set_problems()`. Do not conflate `sbomEvidenceEntry` (the marker's own claim: digest,
  subjectDigest, predicateType, documentValidated, packageCount) with `sbomDocumentContent` (the
  evidence-set's collector-normalized document content: spdxVersion, documentValidated, subjectDigest,
  packageCount, canonicalDigest, canonicalSize) — they share three field *names*
  (`documentValidated`, `subjectDigest`, `packageCount`) by coincidence of both describing the same
  underlying SBOM, but they are two different `$defs` at two different places in the observation, and
  `marker_problems()` never reads `sbomDocumentContent` directly.

---

### Task 1: Schema — the SBOM-only entry/pair split and `sbomDocumentContent`

**Files:**
- Modify: `.github/contracts/observation.schema.json`

**Interfaces:**
- Consumes: `#/$defs/digest`, `#/$defs/hex64`, `#/$defs/absent`, `#/$defs/error`,
  `#/$defs/attestationAbsent` (all existing).
- Produces: the ten new `$defs` listed in File Structure.

- [ ] **Step 1: Split `evidenceEntry` into `sbomEvidenceEntry` and `scanEvidenceEntry`**

Find:

```json
    "perImageEvidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["monolith", "frontend"],
      "properties": {
        "monolith": { "$ref": "#/$defs/evidenceEntry" },
        "frontend": { "$ref": "#/$defs/evidenceEntry" }
      }
    },

    "evidenceEntry": {
      "type": "object",
      "additionalProperties": false,
      "description": "Existence, subject, predicate type and outcome. A digest alone proves a file was produced, not that it describes this image or that anything passed.",
      "required": ["digest", "subjectDigest", "predicateType", "passed"],
      "properties": {
        "digest": { "$ref": "#/$defs/digest" },
        "subjectDigest": {
          "$ref": "#/$defs/digest",
          "description": "The image this evidence is about. Must equal the image it is filed under; otherwise a scan of one image vouches for another."
        },
        "predicateType": { "type": "string", "minLength": 1 },
        "passed": {
          "type": "boolean",
          "description": "Read out of the marker, so false is what the registry holds and needs a person. Pinning this to true belongs in a producer-side schema, which describes what may be written; this one describes what was read back."
        }
      }
    },
```

Replace with:

```json
    "sbomPerImageEvidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["monolith", "frontend"],
      "properties": {
        "monolith": { "$ref": "#/$defs/sbomEvidenceEntry" },
        "frontend": { "$ref": "#/$defs/sbomEvidenceEntry" }
      }
    },

    "scanPerImageEvidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["monolith", "frontend"],
      "properties": {
        "monolith": { "$ref": "#/$defs/scanEvidenceEntry" },
        "frontend": { "$ref": "#/$defs/scanEvidenceEntry" }
      }
    },

    "sbomEvidenceEntry": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 6 (spec section 4): SPDX is an inventory predicate, not a verdict -- it has no pass/fail, so this carries documentValidated (did the document validate against SPDX 2.3) instead of scanEvidenceEntry's passed. packageCount is the 'not empty' half of section 4's three-part invariant; the third half (subject = image being released) is subjectDigest below, already checked against the image it is filed under the same way every evidence entry is.",
      "required": ["digest", "subjectDigest", "predicateType", "documentValidated", "packageCount"],
      "properties": {
        "digest": { "$ref": "#/$defs/digest" },
        "subjectDigest": {
          "$ref": "#/$defs/digest",
          "description": "The image this evidence is about. Must equal the image it is filed under; otherwise a SBOM of one image vouches for another."
        },
        "predicateType": { "type": "string", "minLength": 1 },
        "documentValidated": {
          "type": "boolean",
          "description": "Whether the SBOM validated against SPDX 2.3 -- the collector's single computed answer, the same collector-trusted-boolean pattern as layersValid and schemaValid. Does not fold in emptiness or subject mismatch; those are packageCount and subjectDigest, checked separately."
        },
        "packageCount": {
          "type": "integer",
          "minimum": 0,
          "description": "Package count as reported by the collector. Must be >= 1 for the document to count as non-empty (spec section 4); 0 is a valid integer here so the decision can say CONFLICT about it by name rather than the schema silently rejecting the shape."
        }
      }
    },

    "scanEvidenceEntry": {
      "type": "object",
      "additionalProperties": false,
      "description": "Existence, subject, predicate type and outcome. A digest alone proves a file was produced, not that it describes this image or that anything passed. Identical to the pre-commit-6 evidenceEntry this replaces for the three scan kinds -- only sbomEvidenceEntry's shape actually changed.",
      "required": ["digest", "subjectDigest", "predicateType", "passed"],
      "properties": {
        "digest": { "$ref": "#/$defs/digest" },
        "subjectDigest": {
          "$ref": "#/$defs/digest",
          "description": "The image this evidence is about. Must equal the image it is filed under; otherwise a scan of one image vouches for another."
        },
        "predicateType": { "type": "string", "minLength": 1 },
        "passed": {
          "type": "boolean",
          "description": "Read out of the marker, so false is what the registry holds and needs a person. Pinning this to true belongs in a producer-side schema, which describes what may be written; this one describes what was read back."
        }
      }
    },
```

- [ ] **Step 2: Re-point `evidence`'s four kind properties**

Find:

```json
        "sbom": { "$ref": "#/$defs/perImageEvidence" },
        "vulnerabilityScan": { "$ref": "#/$defs/perImageEvidence" },
        "layerSecretScan": { "$ref": "#/$defs/perImageEvidence" },
        "filesystemSecretScan": { "$ref": "#/$defs/perImageEvidence" },
```

Replace with:

```json
        "sbom": { "$ref": "#/$defs/sbomPerImageEvidence" },
        "vulnerabilityScan": { "$ref": "#/$defs/scanPerImageEvidence" },
        "layerSecretScan": { "$ref": "#/$defs/scanPerImageEvidence" },
        "filesystemSecretScan": { "$ref": "#/$defs/scanPerImageEvidence" },
```

- [ ] **Step 3: Re-point `presentEvidenceSet.reports.sbom`**

Find:

```json
            "sbom": { "$ref": "#/$defs/reportAttestationPair" },
            "vulnerabilityScan": { "$ref": "#/$defs/scanReportAttestationPair" },
```

Replace with:

```json
            "sbom": { "$ref": "#/$defs/sbomReportAttestationPair" },
            "vulnerabilityScan": { "$ref": "#/$defs/scanReportAttestationPair" },
```

- [ ] **Step 4: Add the six new `$defs`, immediately after `scanPresentAttestation`'s closing brace and before `normalizedScanContent`**

```json
    "sbomReportAttestationPair": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 6 (spec section 4): the same pairing as scanReportAttestationPair, but for SBOM, which does not share the scan contract -- normalizedReport/normalizedPredicate get sbomDocumentContent instead of normalizedScanContent. Re-points presentEvidenceSet.reports.sbom, replacing the loosely-typed reportAttestationPair placeholder commit 4 left it as.",
      "required": ["reportLookup", "attestationLookup"],
      "properties": {
        "reportLookup": { "$ref": "#/$defs/sbomReportEvidenceLookup" },
        "attestationLookup": { "$ref": "#/$defs/sbomAttestationEvidenceLookup" }
      }
    },

    "sbomReportEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/sbomPresentReport" },
        { "$ref": "#/$defs/absent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "sbomPresentReport": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentReport except normalizedReport has sbomPresentReport's own real shape (sbomDocumentContent) instead of the generic placeholder.",
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
        "normalizedReport": { "$ref": "#/$defs/sbomDocumentContent" }
      }
    },

    "sbomAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/sbomPresentAttestation" },
        { "$ref": "#/$defs/attestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "sbomPresentAttestation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentAttestation except normalizedPredicate has sbomPresentAttestation's own real shape (sbomDocumentContent) instead of the generic placeholder. Its canonicalDigest/canonicalSize are what the reverse-direction binding (spec section 4) compares against this same pair's reportLookup.descriptor.",
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
        "normalizedPredicate": { "$ref": "#/$defs/sbomDocumentContent" }
      }
    },

    "sbomDocumentContent": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 6 (spec section 4): the collector's already-normalized view of a SBOM document or, independently, of the predicate an attestation vouches for -- shared by reportLookup.present.normalizedReport and attestationLookup.present.normalizedPredicate, the same symmetry normalizedScanContent (commit 5) already established for the three scan kinds. No policy, no findings, no counts, no declaredOutcome -- SPDX makes no verdict (section 4's whole point). canonicalDigest/canonicalSize are read only from the attestation side by the decision (section 4's reverse-direction binding: the signed predicate is canonicalized and compared against the SBOM layer's own descriptor) -- both sides carry them for shape symmetry, but only the attestation side's values are meaningful to that check.",
      "required": ["spdxVersion", "documentValidated", "subjectDigest", "packageCount", "canonicalDigest", "canonicalSize"],
      "properties": {
        "spdxVersion": { "type": "string", "minLength": 1 },
        "documentValidated": { "type": "boolean" },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "packageCount": { "type": "integer", "minimum": 0 },
        "canonicalDigest": { "$ref": "#/$defs/digest" },
        "canonicalSize": { "type": "integer", "minimum": 0 }
      }
    },
```

- [ ] **Step 5: Confirm the schema is still well-formed JSON**

Run: `python -c "import json; json.load(open('.github/contracts/observation.schema.json', encoding='utf-8')); print('ok')"`

Expected: `ok`

- [ ] **Step 6: Search for any other reference to the two removed `$defs` before deleting them**

Run (adjust for your shell): `grep -n 'perImageEvidence\|"evidenceEntry"' .github/contracts/observation.schema.json`

Expected: only the definitions themselves (now dead, referenced from nowhere after Step 2). If
anything else still references them, STOP — this plan's assumption that nothing else does was wrong,
and removing them would break that reference; report the actual reference found rather than deleting
anyway.

- [ ] **Step 7: Remove the now-dead `perImageEvidence`/`evidenceEntry` `$defs`**

Delete the two `$def` blocks entirely (the same text Step 1's Find block quoted above, since Step 1
already replaced their *usages* but this step removes the definitions themselves — if Step 1's edit
already removed them because you folded Step 1 and Step 7 together, skip this step and note that in
your report).

- [ ] **Step 8: Confirm the schema is still well-formed JSON, again**

Run the same command as Step 5. Expected: `ok`.

- [ ] **Step 9: Commit**

```bash
git add .github/contracts/observation.schema.json
git commit -m "contract(ci): stop asking a SBOM for a verdict it does not make (1/5)

Six new schema \$defs per spec section 4: sbomReportAttestationPair
etc., mirroring commit 5's scan-only split but for SBOM -- SPDX is an
inventory predicate with no verdict, so sbomDocumentContent carries no
policy/findings/counts/declaredOutcome, instead spdxVersion/
documentValidated/subjectDigest/packageCount/canonicalDigest/
canonicalSize. evidenceEntry splits into sbomEvidenceEntry
(documentValidated + packageCount) and scanEvidenceEntry (passed,
unchanged) -- structural exclusion via additionalProperties:false
rather than a conditional, the same choice this contract has made at
every prior kind-split. Every existing fixture using the old
evidence.sbom.*.passed shape or the loosely-typed sbom report/
attestation placeholder is now schema-invalid; a later commit in this
series migrates the corpus. Not run against any suite yet."
```

---

### Task 2: Decision logic — split the marker evidence loop, add the canonical-binding check

**Files:**
- Modify: `.github/scripts/publish-decision.sh`

**Interfaces:**
- Consumes: `#/$defs/sbomEvidenceEntry`, `#/$defs/sbomDocumentContent` (Task 1).
- Produces: no new top-level functions; both changes are inline branches inside existing loops.

- [ ] **Step 1: Split `marker_problems()`'s per-kind/per-image evidence loop's outcome check**

Find:

```python
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

                if kind in SCAN_REPORT_KINDS:
```

Replace with:

```python
                if kind == "sbom":
                    # 3b commit 6 (spec section 4): SPDX makes no verdict -- documentValidated
                    # replaces passed, and packageCount is the "not empty" half of section 4's
                    # three-part invariant (the third half, subject = image, is the subjectDigest
                    # check just above, already common to every kind).
                    if entry.get("documentValidated") is not True:
                        problems.append(f"{where}.content.evidence.{kind}.{image}."
                                        f"documentValidated is {entry.get('documentValidated')!r}, "
                                        f"must be boolean true")
                    package_count = entry.get("packageCount")
                    if type(package_count) is not int or package_count < 1:
                        problems.append(f"{where}.content.evidence.{kind}.{image}.packageCount is "
                                        f"{package_count!r}, must be a positive integer -- a SBOM "
                                        f"naming zero packages is not evidence of anything")
                elif entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

                if kind in SCAN_REPORT_KINDS:
```

- [ ] **Step 2: Add the SBOM canonical-digest/size binding check to `evidence_set_problems()`'s reports loop**

Find:

```python
            if (report_outcome is not None and attestation_outcome is not None
                    and report_outcome != attestation_outcome):
                # Section 5's whole point: two independent sources, compared, not merged. Agreement
                # on shape does not imply agreement on content.
                problems.append(f"{where}.reports.{kind}: report recomputes to {report_outcome!r}, "
                                f"attestation recomputes to {attestation_outcome!r} -- two "
                                f"independent sources disagree")
    return problems
```

Replace with:

```python
            if (report_outcome is not None and attestation_outcome is not None
                    and report_outcome != attestation_outcome):
                # Section 5's whole point: two independent sources, compared, not merged. Agreement
                # on shape does not imply agreement on content.
                problems.append(f"{where}.reports.{kind}: report recomputes to {report_outcome!r}, "
                                f"attestation recomputes to {attestation_outcome!r} -- two "
                                f"independent sources disagree")

        # 3b commit 6 (spec section 4): SBOM's reverse-direction binding. The decision has no bytes
        # and cannot canonicalize anything itself -- it trusts the collector's already-canonicalized
        # digest/size the same way it already trusts layersValid and schemaValid, and compares that
        # trusted value against the report lookup's own descriptor (the SBOM layer as fetched
        # directly, not vouched for by anyone). Guarded the same way commit 5's scan branch is: both
        # halves must already be present and internally verified, or there is nothing trustworthy to
        # compare.
        if (kind == "sbom"
                and type(report_lookup) is dict and report_lookup.get("status") == "present"
                and type(attestation_lookup) is dict and attestation_lookup.get("status") == "present"):
            descriptor = report_lookup.get("descriptor")
            predicate_content = attestation_lookup.get("normalizedPredicate")
            if type(descriptor) is dict and type(predicate_content) is dict:
                if predicate_content.get("canonicalDigest") != descriptor.get("digest"):
                    problems.append(
                        f"{where}.reports.{kind}: attestation's canonicalDigest is "
                        f"{predicate_content.get('canonicalDigest')!r}, but the SBOM layer's own "
                        f"descriptor digest is {descriptor.get('digest')!r} -- the signed predicate "
                        f"does not name the bytes actually on the layer")
                if predicate_content.get("canonicalSize") != descriptor.get("size"):
                    problems.append(
                        f"{where}.reports.{kind}: attestation's canonicalSize is "
                        f"{predicate_content.get('canonicalSize')!r}, but the SBOM layer's own "
                        f"descriptor size is {descriptor.get('size')!r}")
    return problems
```

- [ ] **Step 3: Confirm no `SyntaxError`**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | head -20`

Expected: `FAIL` lines from the still-unmigrated fixture corpus (Task 3's job), not a Python
`SyntaxError` or a traceback naming an undefined name. If a specific fixture's failure message is a
Python traceback rather than a `FAIL <name>: ...` line in the harness's own format, treat that as a
real bug in this step's code and fix it before proceeding.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/publish-decision.sh
git commit -m "contract(ci): stop asking a SBOM for a verdict it does not make (2/5)

marker_problems()'s evidence loop splits documentValidated + 
packageCount>=1 (sbom) from the existing passed check (the three scan
kinds, unchanged). evidence_set_problems() gains the reverse-direction
binding spec section 4 names: the attestation's canonicalDigest/
canonicalSize (the collector's already-canonicalized signed predicate)
compared against the report lookup's own descriptor digest/size (the
SBOM layer as fetched directly) -- the decision has no bytes and
performs no canonicalization itself, it only compares two
already-computed fields, the same trust class as layersValid/
schemaValid. Not run against any suite yet -- Task 3 migrates the
fixture corpus this needs."
```

---

### Task 3: Migrate the existing fixture corpus

**Files:**
- Modify: fixtures under `.github/contracts/fixtures/` that carry `markerContent.evidence.sbom` or
  `presentEvidenceSet.reports.sbom` (both `finalMarker`/`preparedMarker`-bearing fixtures AND
  evidence-set-bearing fixtures — a superset of commit 5's own Task 3 list, since commit 5 only
  touched the evidence-set side and this commit also touches every marker's own content).
- Modify: `.github/scripts/publish-decision.test.sh` (`marker()` and `present_evidence_set()`
  builders).

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a corpus that validates against the new schema and still proves what it always proved.

- [ ] **Step 1: Run to confirm the corpus is now broken by Tasks 1-2's schema change**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -30`

Expected: `FAIL` for every fixture carrying `reports.sbom` with the old loosely-typed `{}` placeholder,
and (via `publish-decision.test.sh`, run separately) every marker-bearing case still asserting
`evidence.sbom.<image>.passed` rather than `documentValidated`/`packageCount`. List the actual failing
names before continuing rather than assuming this plan's prediction of "which fixtures" is complete —
this plan was not scratch-verified (see the note at the top of this file).

If `contract-agreement.test.sh` fails every case with a WSL relay error, re-run with
`PUBLISH_DECISION_BASH` set per this plan's Global Constraints.

- [ ] **Step 2: Write and run the migration script**

```python
import json
import pathlib
import sys

root = pathlib.Path(".")
fixtures_dir = root / ".github" / "contracts" / "fixtures"
scripts_dir = root / ".github" / "scripts"
sys.path.insert(0, str(scripts_dir))
import envelope  # noqa: E402  (must come after sys.path.insert)


def sbom_document_content(digest, size):
    # A clean, passing default: canonicalDigest/canonicalSize matching the SBOM layer's own
    # descriptor exactly, the same "bare default agrees with itself" precedent commit 5's
    # scan_content() migration helper set.
    return {
        "spdxVersion": "SPDX-2.3",
        "documentValidated": True,
        "subjectDigest": digest,
        "packageCount": 5,
        "canonicalDigest": digest,
        "canonicalSize": size,
    }


def migrate_evidence_set_reports(pair, digest, size):
    changed = False
    rl = pair.get("reportLookup")
    if isinstance(rl, dict) and rl.get("status") == "present" and rl.get("normalizedReport") == {}:
        rl["normalizedReport"] = sbom_document_content(digest, size)
        changed = True
    al = pair.get("attestationLookup")
    if isinstance(al, dict) and al.get("status") == "present" and al.get("normalizedPredicate") == {}:
        al["normalizedPredicate"] = sbom_document_content(digest, size)
        changed = True
    return changed


def migrate_marker_evidence(evidence_sbom):
    # evidence.sbom.{monolith,frontend} -- rename passed -> documentValidated, add packageCount.
    changed = False
    for image_entry in evidence_sbom.values():
        if isinstance(image_entry, dict) and "passed" in image_entry:
            image_entry["documentValidated"] = image_entry.pop("passed")
            image_entry["packageCount"] = 5
            changed = True
    return changed


def walk(doc):
    changed = False
    # Evidence-set side (mirrors commit 5's Task 3 walk).
    for image_key in ("monolithEvidenceSet", "frontendEvidenceSet"):
        es = doc.get("lookups", {}).get(image_key)
        if not isinstance(es, dict) or es.get("status") != "present":
            continue
        reports = es.get("reports")
        if not isinstance(reports, dict):
            continue
        digest = es.get("carrierDigest")
        pair = reports.get("sbom")
        if isinstance(pair, dict):
            # descriptor size is the fixed 1024 the shared present_evidence_set()-style pairs use;
            # if a specific fixture's sbom descriptor carries a different size, read it from the
            # actual reportLookup.descriptor.size instead of assuming 1024 -- confirm against the
            # real fixture before trusting this default.
            report_lookup = pair.get("reportLookup", {})
            descriptor = report_lookup.get("descriptor", {}) if isinstance(report_lookup, dict) else {}
            size = descriptor.get("size", 1024)
            if migrate_evidence_set_reports(pair, digest, size):
                changed = True

    # Marker side -- both finalMarker and preparedMarker, each independently possibly-present.
    for marker_key in ("finalMarker", "preparedMarker"):
        marker = doc.get("lookups", {}).get(marker_key)
        if not isinstance(marker, dict) or marker.get("status") != "present":
            continue
        content = marker.get("content")
        if not isinstance(content, dict):
            continue
        evidence = content.get("evidence")
        if not isinstance(evidence, dict):
            continue
        sbom_evidence = evidence.get("sbom")
        if isinstance(sbom_evidence, dict) and migrate_marker_evidence(sbom_evidence):
            changed = True
            # A marker's envelope has exactly ONE layer -- the canonical JSON of the whole
            # markerContent object, not one layer per evidence kind (confirmed by reading
            # envelope.py directly: envelope_for(content) hashes canonical_bytes(content) once into
            # a single layers[0] entry; there is no per-kind layer anywhere in a marker's own
            # envelope -- that only exists in the evidence-set CARRIER's envelope, a different
            # object this migration does not touch). Changing content.evidence.sbom therefore
            # requires recomputing the WHOLE envelope from the WHOLE content, exactly the same call
            # publish-decision.test.sh's own marker() builder already makes for every dynamically
            # generated case.
            envelope_obj = marker.get("ociEnvelope")
            if isinstance(envelope_obj, dict) and "raw" in envelope_obj:
                raw = envelope.envelope_for(content)
                envelope_obj["raw"] = raw
                new_digest = envelope.marker_digest(raw)
                marker["markerDigest"] = new_digest
                verification = marker.get("verification")
                if isinstance(verification, dict):
                    verification["subjectDigest"] = new_digest

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

**Envelope recomputation, verified directly against `.github/scripts/envelope.py` while writing this**
**plan** (unlike the rest of this plan, this one piece WAS checked against the real source, not
guessed): a marker's `ociEnvelope` carries exactly **one** layer — `envelope_for(content)` hashes
`canonical_bytes(content)` once into a single `layers[0]` entry; there is no per-evidence-kind layer
anywhere in a marker's own envelope (that only exists in the evidence-set *carrier's* envelope, a
different object — `release-evidence-set.schema.json`'s shape, frozen in commit 1 — which this
migration does not touch and which the decision never re-derives, trusting `layersValid` instead).
Changing `content.evidence.sbom` therefore means recomputing the *whole* envelope from the *whole*
content: `envelope.envelope_for(content)` for `ociEnvelope.raw`, `envelope.marker_digest(raw)` for
both `markerDigest` and `verification.subjectDigest` — exactly the two calls
`publish-decision.test.sh`'s own `marker()` builder already makes for every dynamically-generated
case (see `marker()`'s own body: `raw = envelope_module.envelope_for(base["content"]); ...
base["markerDigest"] = envelope_module.marker_digest(raw)`). The migration script above already
contains this real call, not a placeholder — verify it works by running one migrated fixture through
`publish-decision.sh` directly and confirming it does not report an envelope-mismatch problem before
trusting the rest of the run.

Expected total: unknown — this plan does not predict it (deliberately, per the top-of-file note).
Report the real `total files migrated: N` and the real list of fixture names.

- [ ] **Step 3: Run to verify the migrated corpus passes**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -10`

Expected: `passed=32 failed=0` — the exact pre-existing baseline (no fixture's proven rule changed).
If the real number differs, report it rather than forcing this one.

- [ ] **Step 4: Migrate `publish-decision.test.sh`'s `marker()` and `present_evidence_set()` builders**

In `marker()`, find the dict-comprehension building all four kinds' evidence uniformly:

```python
    "evidence": {
      **{
        kind: {"monolith": {"digest": "sha256:" + letter*64, "subjectDigest": mono,
                            "predicateType": "https://tvu.example/" + kind, "passed": True},
               "frontend": {"digest": "sha256:" + letter*63 + "e", "subjectDigest": front,
                            "predicateType": "https://tvu.example/" + kind, "passed": True}}
        for kind, letter in (("sbom", "a"), ("vulnerabilityScan", "b"),
                             ("layerSecretScan", "c"), ("filesystemSecretScan", "d"))
      },
```

Replace with (SBOM's dict built separately, since it needs different keys than the other three):

```python
    "evidence": {
      "sbom": {"monolith": {"digest": "sha256:" + "a"*64, "subjectDigest": mono,
                            "predicateType": "https://tvu.example/sbom",
                            "documentValidated": True, "packageCount": 5},
               "frontend": {"digest": "sha256:" + "a"*63 + "e", "subjectDigest": front,
                            "predicateType": "https://tvu.example/sbom",
                            "documentValidated": True, "packageCount": 5}},
      **{
        kind: {"monolith": {"digest": "sha256:" + letter*64, "subjectDigest": mono,
                            "predicateType": "https://tvu.example/" + kind, "passed": True},
               "frontend": {"digest": "sha256:" + letter*63 + "e", "subjectDigest": front,
                            "predicateType": "https://tvu.example/" + kind, "passed": True}}
        for kind, letter in (("vulnerabilityScan", "b"),
                             ("layerSecretScan", "c"), ("filesystemSecretScan", "d"))
      },
```

In `present_evidence_set()`, find the `sbom` key of the final `reports` object (it currently reuses
the generic `$pair` variable):

```bash
 "reports":{"sbom":$pair,"vulnerabilityScan":$scan_pair,"layerSecretScan":$scan_pair,"filesystemSecretScan":$scan_pair}}
```

Replace with (a new `$sbom_pair` variable, built the same way `$scan_pair` was built in commit 5,
substituting `sbomDocumentContent`'s six fields for `normalizedScanContent`'s):

```bash
 "reports":{"sbom":$sbom_pair,"vulnerabilityScan":$scan_pair,"layerSecretScan":$scan_pair,"filesystemSecretScan":$scan_pair}}
```

and add the `sbom_content`/`sbom_pair` local variable definitions immediately before the existing
`local pair=` line inside `present_evidence_set()`:

```bash
  local sbom_content='{"spdxVersion":"SPDX-2.3","documentValidated":true,"subjectDigest":"'"$digest"'",
               "packageCount":5,"canonicalDigest":"'"$digest"'","canonicalSize":1024}'
  local sbom_pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "descriptor":{"mediaType":"application/vnd.evts.evidence.report.v1+json","digest":"'"$digest"'","size":1024},
                 "digestVerified":true,"sizeVerified":true,"schemaValid":true,"normalizedReport":'"$sbom_content"'},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "subjectDigest":"'"$digest"'","predicateType":"https://tvu.example/report-attestation",
                 "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                 "sourceRevision":"'"$SHA"'","attestationVerified":true,"normalizedPredicate":'"$sbom_content"'}}'
```

(`sbom_content`'s `canonicalDigest`/`canonicalSize` deliberately match the descriptor's own
`digest`/`1024` exactly — a clean default that agrees with itself, matching every other default in
this function per the file's own established precedent.)

- [ ] **Step 5: Run the full suite to verify GREEN**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -10`

Expected: unchanged pass count from before this task (this task adds zero new cases; it only migrates
existing ones). Report the real number — do not assume it matches any number written elsewhere in
this plan or in `.superpowers/sdd/progress.md`'s most recent entry without checking that entry's own
number first (it may itself have been corrected after this plan was written).

If you hit `Argument list too long` on Windows, see this plan's Global Constraints for the extraction
workaround.

- [ ] **Step 6: shellcheck**

Run: `shellcheck .github/scripts/publish-decision.test.sh .github/scripts/publish-decision.sh`

Expected: no *new* warnings versus the pre-existing baseline (this branch has known pre-existing
CRLF/checkout-artifact noise on this Windows machine from `core.autocrlf=true` — compare against
LF-normalized content and the git-blob version of both files, the technique already used earlier in
this series, before concluding anything found is new).

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/fixtures/ .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): stop asking a SBOM for a verdict it does not make (3/5)

Migrates every marker-bearing fixture's evidence.sbom.*.passed to
documentValidated + packageCount, and every evidence-set-bearing
fixture's reports.sbom placeholder to sbomDocumentContent -- plus
publish-decision.test.sh's marker() and present_evidence_set()
builders. Marker content changes required recomputing each affected
fixture's envelope layer digest/size (marker content is hashed into
it) via the same technique commit 5's own migration needed. No
fixture's proven rule changed. contract-agreement.test.sh 32/0,
publish-decision.test.sh <fill in from Step 5>/0 (unchanged baseline)."
```

---

### Task 4: New witness fixtures for the SBOM-specific guards

**Files:**
- Modify: `.github/scripts/publish-decision.test.sh`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fixtures proving every guard Task 2 added is load-bearing, each individually verified to
  isolate its own guard per this plan's Global Constraints mutation-isolation discipline.

Per spec section 10 and the addendum's own "Test coverage" list, this commit needs witnesses for:

1. `documentValidated: false` on a marker's own SBOM evidence entry ⇒ CONFLICT.
2. A SBOM evidence entry's `subjectDigest` naming the other image ⇒ CONFLICT (this may already be
   covered by an existing, kind-agnostic witness from an earlier commit — check
   `publish-decision.test.sh` for an existing "evidence entry describes the other image" case before
   writing a new one; if one already exists and is kind-agnostic, note that in your report instead of
   duplicating it).
3. `packageCount: 0` on a marker's own SBOM evidence entry ⇒ CONFLICT.
4. The evidence-set's SBOM `attestationLookup.normalizedPredicate.canonicalDigest` disagreeing with
   `reportLookup.descriptor.digest` ⇒ CONFLICT.
5. The evidence-set's SBOM `canonicalSize` disagreeing with the descriptor's `size` ⇒ CONFLICT.
6. A SBOM evidence entry carrying `passed` instead of `documentValidated` ⇒ structurally rejected by
   the schema (UNKNOWN via the existing field-set/`additionalProperties:false` gate, not a decision
   guard this commit wrote — witness this at the schema level, in `evidence-set-schema.test.sh` or
   wherever commit 5's equivalent "presentEvidenceSet's own new keywords" witnesses (3b commit 4 Task
   4) live, not in `publish-decision.test.sh`).
7. A scan evidence entry carrying `documentValidated` instead of `passed` ⇒ structurally rejected,
   same category as #6.

- [ ] **Step 1: Add cases 1, 3, 4, 5 to `publish-decision.test.sh`, in a new subsection immediately after the existing 3b-commit-5 section**

Follow the established `damaged_evidence_set`/`marker '{"_content":...}'` patterns already in this
file (see the "3b commit 4"/"3b commit 5" sections for the exact `assert_decision` wrapping style).
This plan does not write the exact case bodies out — unlike Tasks 1-2's schema/decision-logic diffs,
which were direct, low-risk pattern matches against already-merged code, hand-writing four
`assert_decision` bodies without a scratch run risks the same kind of guard-overlap mistake this
plan's Global Constraints section already documents happening twice in this exact codebase. Write
each case, then for each one:

1. Run the real suite and confirm it reports `ok`.
2. Make a **local, uncommitted** copy of `publish-decision.sh` with only the specific guard under
   test removed (comment it out or replace its condition with `if False:`), re-run just that one
   case, and confirm it now reports `FAIL`. Revert the local copy before moving to the next case.
3. Only keep a case whose Step 2 confirmed isolation.

Report each case's real, verified `state`/`actions`/`cleanupDebt`/`retryable` values — do not guess
them from this plan's prose.

- [ ] **Step 2: Add cases 6, 7 as schema-level witnesses**

Find the fixture directory/test file where commit 4's Task 4 added `presentEvidenceSet`'s own new
keyword witnesses (search `.github/contracts/fixtures/` and `evidence-set-schema.test.sh` for
`additionalProperties` or the commit 4 Task 4 commit message's own file list). Add two fixtures there
following that same established pattern: one where a SBOM evidence entry (or, if the witness site is
`presentEvidenceSet.reports.sbom` rather than `markerContent.evidence.sbom`, the equivalent
report/attestation lookup) carries `passed` instead of `documentValidated`, one where a scan entry
carries `documentValidated` instead of `passed`. Both expected to fail schema validation (structurally
rejected by `additionalProperties: false`), reaching UNKNOWN through the existing field-set gate, not
a new decision guard.

- [ ] **Step 3: Run the full suite**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -20` and the schema-level suite(s)
touched by Step 2.

Expected: every new case reports `ok`. Report the final `passed=N failed=0` line exactly, and the
real count of new cases added (this plan predicted "up to 7" but did not verify that number).

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/publish-decision.test.sh .github/contracts/fixtures/
git commit -m "contract(ci): stop asking a SBOM for a verdict it does not make (4/5)

New witness cases for the SBOM-specific guards: documentValidated
false, packageCount zero, canonicalDigest/canonicalSize disagreeing
with the SBOM layer's own descriptor (all decision-level, individually
verified to isolate their own guard by local removal before being
kept), plus two schema-level witnesses (a SBOM entry carrying passed,
a scan entry carrying documentValidated -- both structurally
rejected). passed=<fill in from Step 3>."
```

---

### Task 5: Mutation rules, full suite sweep, ledger, and push

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: nothing — this is the commit's own completion.

- [ ] **Step 1: Add mutation rules for the new logic**

Read `.github/scripts/publish-decision.mutations.py`'s existing `MUTATIONS` dict fully first (same
instruction commit 5's plan gave, and for the same reason: this project's history has repeatedly
corrected the naming/invocation convention, match what's actually there). Add rules that disable, one
at a time:

- the `documentValidated` check in `marker_problems()`'s SBOM branch
- the `packageCount >= 1` check in the same branch
- the `canonicalDigest` comparison in `evidence_set_problems()`'s SBOM branch
- the `canonicalSize` comparison in the same branch

Name these four mutations following the file's existing naming convention.

- [ ] **Step 2: Targeted check of just these four rules**

The real runner has no built-in subset flag (confirmed during 3b commit 5's own Task 5 — its usage
comment does not document one despite an earlier plan's Step 2 pointing at it). Write an ad hoc
script that imports the runner as a module and iterates only these four names, reusing its
`run_suite`/workspace-copy machinery — the same technique already used and documented in
`.superpowers/sdd/progress.md`'s 3b commit 5 Task 5 entry. Do not run the full sweep yet.

Expected: all four `caught`. If any survive, this is very likely the same guard-overlap class of bug
Task 4's Global-Constraints-mandated isolation check should have already caught — go back to Task 4
and re-verify that specific case's isolation before assuming the mutation rule itself is wrong.

- [ ] **Step 3: Full local suite sweep**

```bash
bash .github/scripts/publish-decision.test.sh
bash .github/scripts/contract-agreement.test.sh
bash .github/scripts/contract-agreement.report.test.sh
bash .github/scripts/manifest-agreement.test.sh
bash .github/scripts/evidence-set-schema.test.sh
bash .github/scripts/predicates-schema.test.sh
bash .github/scripts/common-sh-usage.test.sh
```

Expected: every suite at or above its prior baseline. Report the real numbers.

- [ ] **Step 4: Full mutation sweep**

Run the complete `publish-decision.mutations.py` sweep. If the baseline is red on this Windows
machine due to the pre-documented argv-length artifact (see this plan's Global Constraints), use the
tolerant local wrapper technique already established in 3b commit 5's Task 5, and note explicitly
that CI's own unmodified run is the actual verification, not this local one.

Expected: every mutation caught, zero survivors. Report the actual total count.

- [ ] **Step 5: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings versus the pre-existing baseline (compare against LF-normalized content per
this session's established method before concluding anything found is new).

- [ ] **Step 6: Update the ledger**

Append a `## 3b commit 6: stop asking a SBOM for a verdict it does not make` section to
`.superpowers/sdd/progress.md`, following the exact structure of the 3b commit 5 entry immediately
above it in that file: what changed, the two Plan Decisions this plan made (A: shared
`sbomDocumentContent` shape; B: binding check lives in `evidence_set_problems()`), any real
discrepancies found between this plan's predictions and actual output (report honestly — this plan
was explicitly not scratch-verified, unlike its predecessor, so some are likely), final suite/mutation
counts, and known gaps carried forward (commit 7's `reportDigest`/selection-tuple work; commit 3's
predicate schemas still unwired).

- [ ] **Step 7: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py .superpowers/sdd/progress.md
git commit -m "contract(ci): stop asking a SBOM for a verdict it does not make (5/5)

Four new mutation rules for the SBOM-specific guards -- all caught.
Full local suite sweep clean at or above every prior baseline.
shellcheck clean over both script directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then
`gh run watch <id> --exit-status`), and separately confirm CI actually exercised the changed suites
(`gh run view <run-id> --log 2>/dev/null | grep -iE "publish-decision\.test|contract-agreement\.test|passed="`).
If CI fails for a reason unrelated to this commit's own changes (e.g. the pre-existing frontend `npm
audit` finding seen on prior commits in this series), report it but do not treat it as this task's
failure.

---

## Self-Review

**Spec coverage** — spec §4 line by line against Tasks 1-4:
- `content.evidence.sbom.<image>.passed` → `documentValidated` → Task 1's `sbomEvidenceEntry`, Task
  2's `marker_problems()` split, witnessed by Task 4 case 1.
- SBOM's three-part invariant (SPDX 2.3 valid, subject = image, non-empty) → `documentValidated`
  (collector-trusted boolean, Task 2), `subjectDigest` (already-existing generic check, Task 4 case
  2 if not already covered), `packageCount >= 1` (Task 2, witnessed by Task 4 case 3).
- SBOM's own `normalizedReport`/`normalizedPredicate` real shape → Task 1's `sbomDocumentContent`,
  correctly excluding `policy`/`findings`/`counts`/`declaredOutcome` (SPDX makes no verdict).
- Reverse-direction binding (verify attestation → signed predicate → canonicalize → digest/size →
  compare against SBOM layer descriptor) → Task 1's `canonicalDigest`/`canonicalSize` fields (the
  schema-level half: the fields exist), Task 2's binding check (the decision-level half: the
  comparison), witnessed by Task 4 cases 4 and 5. The decision only performs step 5 of spec section
  4's five-step sequence, per this plan's Plan Decision B — steps 1-4 are collector-side and out of
  this decision script's reach, the same class of trust as every collector-computed field in this
  contract.
- Structural exclusion (SBOM entry carrying `passed`, scan entry carrying `documentValidated`) →
  Task 1's two separate `$defs` with `additionalProperties: false`, witnessed by Task 4 cases 6-7.
- Not in scope, correctly excluded: the three scan kinds' `predicate.reportDigest` binding and
  attestation-selection-tuple enforcement (§8, commit 7); commit 3's predicate schemas (still
  unwired, no spec text assigns wiring them to this commit).

**Placeholder scan** — Task 3's migration script's envelope-recomputation step was checked directly
against the real `.github/scripts/envelope.py` while writing this plan (not guessed, and not a
scratch-run substitute — reading the actual 50-line module was enough to confirm the real shape: one
layer, two function calls, matching `marker()`'s own established call pattern) and contains real,
runnable code, not a placeholder. Task 4 does not write exact `assert_decision` case bodies, the one
deliberate exception in this plan — unlike Tasks 1-2's schema/decision-logic diffs (direct,
low-risk pattern matches against already-merged, already-tested code), hand-writing witness case
bodies without a scratch run risks the exact guard-overlap mistake this plan's Global Constraints
section documents happening twice already in this codebase. An explicit, actionable
isolation-verification procedure (remove the guard locally, confirm the specific case goes red, only
then keep it) is substituted for a guessed diff, and named as a deliberate gap rather than hidden
behind vague prose.

**Type consistency** — `sbomEvidenceEntry` (marker-side) and `sbomDocumentContent` (evidence-set
report-side) are two different `$defs`, deliberately not unified despite sharing three field names by
coincidence (documented explicitly in this plan's own Interfaces section, to prevent an implementer
from assuming they are the same shape). `sbomReportAttestationPair`'s structure matches
`scanReportAttestationPair`'s exactly, field-for-field substitution only. `canonicalDigest`/
`canonicalSize` are defined once (Task 1's `sbomDocumentContent`), read from exactly one side
(attestation) by exactly one call site (Task 2's `evidence_set_problems()` branch) — consistent
between where they are defined and where they are consumed.
