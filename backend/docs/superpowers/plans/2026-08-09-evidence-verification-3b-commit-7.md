# 3b commit 7 — "select an attestation by its whole tuple" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Not scratch-verified before writing, same as commit 6's plan.** Every checkpoint number is a
> prediction. Additionally, this plan makes one **Plan Decision that goes beyond the addendum's own
> "Files touched" list** — read it before Task 1, it changes `normalizedScanContent`'s shape.

**Goal:** Tighten `attestationAbsent.queried` into spec section 8's full selection tuple (including
`reportDigest` for the three scan kinds, forbidden for SBOM), add `paginationComplete` to the present
branch, and accept semantic-duplicate attestations instead of treating any second match as CONFLICT.

**Architecture:** Same structural-exclusion split this contract has used at every prior kind
boundary: `attestationAbsent` splits into `scanAttestationAbsent`/`sbomAttestationAbsent` (their
`queried` tuples differ by `reportDigest`), each wired from `scanAttestationEvidenceLookup`/
`sbomAttestationEvidenceLookup` respectively in place of the shared `attestationAbsent` they
currently both use. `attestationStatementProjection` stays ONE shared `$def` (per the addendum's own
explicit file list — not split by kind), living as an array field `duplicates` on the present
attestation shapes.

**Plan Decision A — `normalizedScanContent` gains a required `reportDigest` field, symmetric on both**
**report and attestation sides** (same asymmetric-meaning-but-symmetric-shape pattern commit 6 already
established for `sbomDocumentContent.canonicalDigest`/`canonicalSize`). The addendum's own "Files
touched" list for this commit does not mention `normalizedScanContent` at all, but master spec
section 10's matrix explicitly assigns this commit the row "... hoặc lệch `predicate.reportDigest`
... ⇒ CONFLICT" (disagreement on `predicate.reportDigest` is CONFLICT), and commit 6's own addendum
states outright: "The three scan kinds' opposite direction (`predicate.reportDigest` read directly)
is not added here [commit 6]: section 8 makes `reportDigest` part of the attestation-selection
tuple, and commit 7 owns that tuple." Without a field to hold that digest, there is nothing for the
decision to read or compare — the selection tuple alone (a value the collector claims it searched
for) does not by itself bind to the report's own descriptor the way section 10's matrix requires.
Only the attestation side's `reportDigest` is read by the decision-side binding check this plan adds
(Task 2); the report side carries the same field for shape symmetry, exactly mirroring
`sbomDocumentContent`'s own precedent.

**Plan Decision B — `attestationStatementProjection`'s `reportDigest`/`policy`/`outcome` fields are**
**OPTIONAL, not universally required.** SBOM attestations have no verdict and no policy (commit 6:
SPDX makes no verdict) and no `reportDigest` concept (commit 6 §4: SBOM does not share the scan
contract) — so a SBOM entry in `duplicates[]` cannot populate any of the three. The addendum's own
Decision 1 explicitly keeps ONE shared `attestationStatementProjection` rather than splitting it by
kind (unlike the selection tuple, which Decision 2 does split) — the only way one shared shape can
serve both kinds is for the fields that don't universally apply to be optional. `subjectDigest`,
`sourceRevision`, `signerRepository`, `signerWorkflow`, `predicateType` stay required (identity/
provenance, present for every kind); `reportDigest`, `policy`, `outcome` are present only for the
kind that has them (all three for scan, none for SBOM).

**Tech Stack:** Same as commits 1-6 — JSON Schema draft 2020-12, Python 3.10+ decision script, bash
test harnesses.

## Global Constraints

- `additionalProperties: false` at every object level.
- Do not touch commit 6's SBOM canonical-digest/size binding, or commit 5's scan verdict recompute —
  both stay exactly as they are; this commit adds a THIRD, independent check (tuple/pagination/
  duplicate) alongside them, not a replacement.
- The pagination mechanism itself does not exist (collector's job) — this commit only adds the
  schema fields and decision-side checks that assume pagination happened; it does not implement
  pagination.
- Byte caps (spec section 7) remain out of scope, same as every prior commit — no scanner script
  exists yet to produce a predicate for that schema to check.
- Fields explicitly excluded from `attestationStatementProjection` by spec section 8's own text: run
  ID, run attempt, timestamp, bundle signature bytes, cert serial. Do not add them even if a
  fixture's construction makes them convenient to include — their absence from the projection is
  load-bearing (two statements differing ONLY on these must still PASS as semantic duplicates).
- **Known environment artifacts on this Windows dev machine** (documented in commits 5/6's plans,
  carried forward): `PUBLISH_DECISION_BASH` must point at Git Bash; `PYTHON_BIN` must point at a
  real interpreter with `jsonschema`/`referencing`; `Argument list too long` on large observations is
  a pre-existing local-only artifact, not a regression; the mutation runner's own baseline check
  refuses to run when red, which the argv artifact now makes unconditional on this machine once
  fixtures grow enough — use the established local tolerant-wrapper technique for due diligence, but
  CI's own unmodified run is the actual verification.
- **Mutation-isolation discipline** (found the hard way, twice, in commits 5 and 6 of this exact
  series): a new guard added to a shared code path can silently blind an older guard's existing
  witness if both fire on the same fixture. Before keeping any new witness case, verify by removing
  ONLY the guard under test from a local, uncommitted copy of `publish-decision.sh` and confirming
  that specific case goes red — do not assume CONFLICT alone proves isolation.

---

## File Structure

- `.github/contracts/observation.schema.json` — **modify**. `attestationAbsent` splits into
  `scanAttestationAbsent`/`sbomAttestationAbsent`; new `$defs`: `scanAttestationSelectionTuple`,
  `sbomAttestationSelectionTuple`, `attestationStatementProjection`. `paginationComplete` +
  `duplicates` added to `scanPresentAttestation`/`sbomPresentAttestation` (the generic
  `presentAttestation`/`attestationEvidenceLookup`/`reportEvidenceLookup`/`presentReport`/
  `reportAttestationPair` are already orphaned as of commit 6 per that task's own review finding —
  out of scope to clean up here unless it blocks this commit's own edits). `normalizedScanContent`
  gains required `reportDigest` (Plan Decision A).
- `.github/scripts/publish-decision.sh` — **modify**. New checks in `evidence_set_problems()`'s
  reports loop: `paginationComplete` on the attestation branch, the scan-kind `reportDigest` binding
  (mirrors commit 6's SBOM canonical-digest check, forward direction), the semantic-duplicate
  comparison over `duplicates[]`.
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration + witnesses.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules.
- `.superpowers/sdd/progress.md` — ledger entry.

## Interfaces

- Consumes: `#/$defs/digest`, `#/$defs/sha1` (existing); `SCAN_REPORT_KINDS`, `EVIDENCE_REPORT_KINDS`
  (existing, from commits 5/6).
- Produces: no new Python helper functions beyond what Task 2 inlines — this commit's checks are
  each a single guarded comparison, matching the file's own established per-check granularity.
- `attestationStatementProjection`'s optional fields (Plan Decision B) are read by the
  semantic-duplicate comparison as `entry.get("reportDigest")` etc. (never `entry["reportDigest"]`)
  — a missing key must not raise, it must simply not be compared for that entry if the SELECTED
  statement also lacks it (both absent = not a difference; one present, one absent = a difference,
  since that would mean the two statements disagree on whether this kind even carries the field,
  which cannot happen for two statements of the same kind but is defensive against a malformed
  fixture).

---

### Task 1: Schema — the attestation selection tuple, projection, and pagination-on-present

**Files:**
- Modify: `.github/contracts/observation.schema.json`

- [ ] **Step 1: Split `attestationAbsent` into `scanAttestationAbsent`/`sbomAttestationAbsent`**

Find:

```json
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
  }
}
```

Replace with:

```json
    "scanAttestationAbsent": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 7 (spec section 8): the GitHub Attestations API answers 'not found' with a 200 and an empty list after full pagination, not a 404. queried is now the FULL selection tuple, including reportDigest -- commit 4's loosely-typed placeholder is gone.",
      "required": ["status", "reason", "paginationComplete", "queried"],
      "properties": {
        "status": { "const": "absent" },
        "reason": { "const": "no_matching_attestation" },
        "paginationComplete": { "const": true },
        "queried": { "$ref": "#/$defs/scanAttestationSelectionTuple" }
      }
    },

    "sbomAttestationAbsent": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 7 (spec section 8): identical to scanAttestationAbsent except queried is sbomAttestationSelectionTuple -- no reportDigest, structurally, since SBOM does not carry one (section 4).",
      "required": ["status", "reason", "paginationComplete", "queried"],
      "properties": {
        "status": { "const": "absent" },
        "reason": { "const": "no_matching_attestation" },
        "paginationComplete": { "const": true },
        "queried": { "$ref": "#/$defs/sbomAttestationSelectionTuple" }
      }
    },

    "scanAttestationSelectionTuple": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 7 (spec section 8): the full tuple a collector must select an attestation by -- never 'the first result'. reportDigest is required here for the three scan kinds, which carry it directly on the predicate (contrast sbomAttestationSelectionTuple).",
      "required": ["repository", "workflow", "sourceRevision", "subjectDigest", "predicateType", "reportDigest"],
      "properties": {
        "repository": { "type": "string", "minLength": 1 },
        "workflow": { "type": "string", "minLength": 1 },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "predicateType": { "type": "string", "minLength": 1 },
        "reportDigest": { "$ref": "#/$defs/digest" }
      }
    },

    "sbomAttestationSelectionTuple": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 7 (spec section 8): identical to scanAttestationSelectionTuple minus reportDigest -- SPDX carries no report digest (section 4), and requiring one for every kind was the previous, self-contradictory rule section 8 replaces.",
      "required": ["repository", "workflow", "sourceRevision", "subjectDigest", "predicateType"],
      "properties": {
        "repository": { "type": "string", "minLength": 1 },
        "workflow": { "type": "string", "minLength": 1 },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "predicateType": { "type": "string", "minLength": 1 }
      }
    },

    "attestationStatementProjection": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 7 (spec section 8): what two TRUSTWORTHY statements matching the same selection tuple must agree on to be a semantic duplicate rather than a genuine conflict. Deliberately excludes run ID, run attempt, timestamp, bundle signature bytes, and cert serial -- two reruns of one workflow produce different values for all five, and none of them describe what was attested. reportDigest/policy/outcome are optional: SBOM statements have none of the three (no verdict, no policy, no report digest -- commit 6 section 4), so a SBOM entry in duplicates[] only ever carries the five identity/provenance fields.",
      "required": ["subjectDigest", "sourceRevision", "signerRepository", "signerWorkflow", "predicateType"],
      "properties": {
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "signerRepository": { "type": "string", "minLength": 1 },
        "signerWorkflow": { "type": "string", "minLength": 1 },
        "predicateType": { "type": "string", "minLength": 1 },
        "reportDigest": { "$ref": "#/$defs/digest" },
        "policy": { "$ref": "#/$defs/scanPolicy" },
        "outcome": { "type": "boolean" }
      }
    }
  }
}
```

- [ ] **Step 2: Re-point `scanAttestationEvidenceLookup`/`sbomAttestationEvidenceLookup`**

Find:

```json
    "scanAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/scanPresentAttestation" },
        { "$ref": "#/$defs/attestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },
```

Replace with:

```json
    "scanAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/scanPresentAttestation" },
        { "$ref": "#/$defs/scanAttestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },
```

Find:

```json
    "sbomAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/sbomPresentAttestation" },
        { "$ref": "#/$defs/attestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },
```

Replace with:

```json
    "sbomAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/sbomPresentAttestation" },
        { "$ref": "#/$defs/sbomAttestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },
```

- [ ] **Step 3: Add `paginationComplete` + `duplicates` to `scanPresentAttestation`**

Find:

```json
    "scanPresentAttestation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentAttestation except normalizedPredicate has scanPresentAttestation's own real shape (normalizedScanContent) instead of the generic placeholder.",
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
        "normalizedPredicate": { "$ref": "#/$defs/normalizedScanContent" }
      }
    },
```

Replace with:

```json
    "scanPresentAttestation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentAttestation except normalizedPredicate has scanPresentAttestation's own real shape (normalizedScanContent) instead of the generic placeholder. 3b commit 7 (spec section 8): paginationComplete -- a selection made before pagination finished proves nothing about uniqueness -- and duplicates, every OTHER trustworthy statement that also matched the selection tuple (empty when this was the only match).",
      "required": ["status", "queriedRef", "subjectDigest", "predicateType", "signerRepository", "signerWorkflow", "sourceRevision", "attestationVerified", "normalizedPredicate", "paginationComplete", "duplicates"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "predicateType": { "type": "string", "minLength": 1 },
        "signerRepository": { "type": "string", "minLength": 1 },
        "signerWorkflow": { "type": "string", "minLength": 1 },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "attestationVerified": { "type": "boolean" },
        "normalizedPredicate": { "$ref": "#/$defs/normalizedScanContent" },
        "paginationComplete": { "type": "boolean" },
        "duplicates": {
          "type": "array",
          "minItems": 0,
          "items": { "$ref": "#/$defs/attestationStatementProjection" }
        }
      }
    },
```

- [ ] **Step 4: Add `paginationComplete` + `duplicates` to `sbomPresentAttestation`**

Find:

```json
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
```

Replace with:

```json
    "sbomPresentAttestation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentAttestation except normalizedPredicate has sbomPresentAttestation's own real shape (sbomDocumentContent) instead of the generic placeholder. Its canonicalDigest/canonicalSize are what the reverse-direction binding (spec section 4) compares against this same pair's reportLookup.descriptor. 3b commit 7 (spec section 8): paginationComplete and duplicates, same as scanPresentAttestation.",
      "required": ["status", "queriedRef", "subjectDigest", "predicateType", "signerRepository", "signerWorkflow", "sourceRevision", "attestationVerified", "normalizedPredicate", "paginationComplete", "duplicates"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "subjectDigest": { "$ref": "#/$defs/digest" },
        "predicateType": { "type": "string", "minLength": 1 },
        "signerRepository": { "type": "string", "minLength": 1 },
        "signerWorkflow": { "type": "string", "minLength": 1 },
        "sourceRevision": { "$ref": "#/$defs/sha1" },
        "attestationVerified": { "type": "boolean" },
        "normalizedPredicate": { "$ref": "#/$defs/sbomDocumentContent" },
        "paginationComplete": { "type": "boolean" },
        "duplicates": {
          "type": "array",
          "minItems": 0,
          "items": { "$ref": "#/$defs/attestationStatementProjection" }
        }
      }
    },
```

- [ ] **Step 5: Add `reportDigest` to `normalizedScanContent` (Plan Decision A)**

Find:

```json
      "required": ["scanner", "target", "policy", "counts", "findings", "truncated", "declaredOutcome"],
      "properties": {
        "scanner": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version"],
          "properties": {
            "name": { "type": "string", "minLength": 1 },
            "version": { "type": "string", "minLength": 1 }
          }
        },
        "target": {
          "type": "object",
          "additionalProperties": false,
          "required": ["imageDigest"],
          "properties": {
            "imageDigest": { "$ref": "#/$defs/digest" }
          }
        },
```

Replace with:

```json
      "required": ["scanner", "target", "policy", "counts", "findings", "truncated", "declaredOutcome", "reportDigest"],
      "properties": {
        "scanner": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version"],
          "properties": {
            "name": { "type": "string", "minLength": 1 },
            "version": { "type": "string", "minLength": 1 }
          }
        },
        "target": {
          "type": "object",
          "additionalProperties": false,
          "required": ["imageDigest"],
          "properties": {
            "imageDigest": { "$ref": "#/$defs/digest" }
          }
        },
        "reportDigest": {
          "$ref": "#/$defs/digest",
          "description": "3b commit 7 (Plan Decision A, spec section 8/10): the report's own digest, as the attestation's signed predicate claims it directly (contrast SBOM's canonicalDigest, which the decision must canonicalize its way to). Only the attestation side's value is read by the decision's binding check (Task 2); the report side carries the same field for shape symmetry, matching sbomDocumentContent's own canonicalDigest/canonicalSize precedent."
        },
```

- [ ] **Step 6: Confirm the schema is still well-formed JSON**

Run: `python -c "import json; json.load(open('.github/contracts/observation.schema.json', encoding='utf-8')); print('ok')"`

Expected: `ok`

- [ ] **Step 7: Search for any other reference to `attestationAbsent` before it becomes fully dead**

Run: `grep -n '"attestationAbsent"' .github/contracts/observation.schema.json`

Expected: zero references remain after Step 2 (both `scanAttestationEvidenceLookup` and
`sbomAttestationEvidenceLookup` now point at the split versions). If anything else still references
`attestationAbsent`, this plan's assumption was wrong — report the actual reference rather than
deleting the generic `attestationAbsent` `$def` blindly. This plan does not instruct removing the
`attestationAbsent` `$def` itself (the exact JSON given in Step 1 already replaces it); if the search
finds no other references, that is expected and no further action is needed.

- [ ] **Step 8: Commit**

```bash
git add .github/contracts/observation.schema.json
git commit -m "contract(ci): select an attestation by its whole tuple (1/5)

attestationAbsent splits into scanAttestationAbsent/sbomAttestationAbsent
per spec section 8 -- queried is now the FULL selection tuple
(repository, workflow, sourceRevision, subjectDigest, predicateType,
and reportDigest for the three scan kinds only), replacing commit 4's
loosely-typed placeholder. paginationComplete and duplicates[] (the
semantic-duplicate projection, deliberately excluding run ID/attempt/
timestamp/signature bytes/cert serial) added to both present
attestation shapes. normalizedScanContent gains a required reportDigest
field (Plan Decision A, not in the addendum's own file list but
required by section 10's matrix row this commit owns and commit 6's
own addendum naming commit 7 as reportDigest's owner) -- symmetric on
both report and attestation sides, only the attestation side's value
meaningful to the decision. Every existing fixture using the old
attestationAbsent/normalizedScanContent shape is now schema-invalid;
a later commit migrates the corpus. Not run against any suite yet."
```

---

### Task 2: Decision logic — pagination, tuple-agreement, and semantic-duplicate checks

**Files:**
- Modify: `.github/scripts/publish-decision.sh`

**Interfaces:**
- Consumes: `#/$defs/attestationStatementProjection` fields (Task 1), read via `.get()` only, never
  `[]` (Plan Decision B: `reportDigest`/`policy`/`outcome` are optional).
- Produces: three new checks inline in `evidence_set_problems()`'s reports loop, immediately after
  the existing `attestationVerified` check.

- [ ] **Step 1: Add `paginationComplete` + tuple-agreement checks**

Find (inside `evidence_set_problems()`'s reports loop, immediately after the existing
`attestationVerified` check):

```python
        elif attestation_lookup.get("attestationVerified") is not True:
            problems.append(f"{where}.reports.{kind}.attestationLookup.attestationVerified is "
                            f"{attestation_lookup.get('attestationVerified')!r}, must be boolean true")
```

Replace with:

```python
        elif attestation_lookup.get("attestationVerified") is not True:
            problems.append(f"{where}.reports.{kind}.attestationLookup.attestationVerified is "
                            f"{attestation_lookup.get('attestationVerified')!r}, must be boolean true")
        elif attestation_lookup.get("paginationComplete") is not True:
            # 3b commit 7 (spec section 8): a selection made from a partial page is a selection
            # nobody proved was the only match -- "I found one" is not "I found one and there were
            # no others" until pagination actually finished.
            problems.append(f"{where}.reports.{kind}.attestationLookup.paginationComplete is "
                            f"{attestation_lookup.get('paginationComplete')!r}, must be boolean true")
```

- [ ] **Step 2: Add the scan-kind `reportDigest` binding check (mirrors commit 6's SBOM canonical-digest check, forward direction)**

Find (the existing commit-5 scan comparison block, right after the two-way report-vs-attestation
comparison; use the SAME guard shape — both lookups present):

```python
            if (report_outcome is not None and attestation_outcome is not None
                    and report_outcome != attestation_outcome):
                # Section 5's whole point: two independent sources, compared, not merged. Agreement
                # on shape does not imply agreement on content.
                problems.append(f"{where}.reports.{kind}: report recomputes to {report_outcome!r}, "
                                f"attestation recomputes to {attestation_outcome!r} -- two "
                                f"independent sources disagree")
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

            # 3b commit 7 (spec section 8/10, Plan Decision A): the three scan kinds carry
            # reportDigest directly on the signed predicate -- contrast SBOM's reverse binding
            # (commit 6), which has to canonicalize its way there. Read only from the attestation
            # side and compared against the report's own descriptor digest, the same forward-vs-
            # reverse asymmetry the schema's own field description already states.
            if (type(report_content) is dict and type(attestation_content) is dict
                    and report_lookup.get("descriptor", {}).get("digest")
                    != attestation_content.get("reportDigest")):
                problems.append(
                    f"{where}.reports.{kind}: attestation's reportDigest is "
                    f"{attestation_content.get('reportDigest')!r}, but the report's own descriptor "
                    f"digest is {report_lookup.get('descriptor', {}).get('digest')!r} -- the signed "
                    f"predicate does not name the report actually fetched")
```

- [ ] **Step 3: Add the semantic-duplicate comparison**

Find (immediately after the block Step 2 just extended, still inside the `if (kind in
SCAN_REPORT_KINDS and ...)` guard's body -- append at the end of that guarded block, OUTSIDE the
`SCAN_REPORT_KINDS`-only condition since duplicates apply to every kind including SBOM):

```python
    return problems
```

(this is `evidence_set_problems()`'s own closing `return problems` -- the LAST one in the function,
after the `for kind in EVIDENCE_REPORT_KINDS:` loop body finishes. Confirm you are editing the loop's
closing return, not an earlier one, by checking indentation: this `return` is at the same indent
level as the `for kind in EVIDENCE_REPORT_KINDS:` line itself, not nested inside it.)

Replace with:

```python
        # 3b commit 7 (spec section 8): semantic-duplicate check, every kind (not just
        # SCAN_REPORT_KINDS -- SBOM attestations can have duplicates too, just with fewer
        # projected fields, per attestationStatementProjection's optional reportDigest/policy/
        # outcome). Guarded on the attestation lookup being present and verified already above;
        # an attestation that failed its own checks has nothing trustworthy to compare duplicates
        # against.
        if type(attestation_lookup) is dict and attestation_lookup.get("status") == "present":
            duplicates = attestation_lookup.get("duplicates")
            if type(duplicates) is list:
                selected = {
                    "subjectDigest": attestation_lookup.get("subjectDigest"),
                    "sourceRevision": attestation_lookup.get("sourceRevision"),
                    "signerRepository": attestation_lookup.get("signerRepository"),
                    "signerWorkflow": attestation_lookup.get("signerWorkflow"),
                    "predicateType": attestation_lookup.get("predicateType"),
                    "reportDigest": (attestation_content.get("reportDigest")
                                     if type(attestation_content) is dict else None),
                    "policy": (attestation_content.get("policy")
                               if type(attestation_content) is dict else None),
                    "outcome": attestation_outcome,
                }
                for index, duplicate in enumerate(duplicates):
                    if type(duplicate) is not dict:
                        continue
                    for field in ("subjectDigest", "sourceRevision", "signerRepository",
                                  "signerWorkflow", "predicateType", "reportDigest", "policy",
                                  "outcome"):
                        if field not in duplicate and selected.get(field) is None:
                            continue
                        if duplicate.get(field) != selected.get(field):
                            problems.append(
                                f"{where}.reports.{kind}.attestationLookup.duplicates[{index}]."
                                f"{field} is {duplicate.get(field)!r}, but the selected statement's "
                                f"own {field} is {selected.get(field)!r} -- these are not the same "
                                f"statement, and multiple trustworthy statements that disagree is "
                                f"the case section 8 requires a person for")
                            break
    return problems
```

- [ ] **Step 4: Confirm no `SyntaxError`**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | head -20`

Expected: `FAIL` lines from the still-unmigrated fixture corpus, not a Python `SyntaxError` or a
traceback naming an undefined name.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/publish-decision.sh
git commit -m "contract(ci): select an attestation by its whole tuple (2/5)

paginationComplete checked on the present branch (a selection made
before pagination finished proves nothing). Scan-kind reportDigest
binding: the attestation's signed predicate must name the report
actually fetched, forward direction (contrast commit 6's SBOM reverse
binding). Semantic-duplicate comparison over duplicates[] for every
kind -- CONFLICT only when a trustworthy duplicate disagrees on one of
attestationStatementProjection's own fields, never on run ID/attempt/
timestamp/signature bytes/cert serial, which are not in the projection
by construction. Not run against any suite yet -- Task 3 migrates the
fixture corpus this needs."
```

---

### Task 3: Migrate the existing fixture corpus

**Files:**
- Modify: fixtures carrying `attestationAbsent`-shaped lookups or scan-kind `normalizedPredicate`.
- Modify: `.github/scripts/publish-decision.test.sh` (`present_evidence_set()` builder, and any
  helper building an absent attestation lookup directly).

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a corpus that validates against the new schema and still proves what it always proved.

- [ ] **Step 1: Run to confirm the corpus is now broken**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -30`

Expected: `FAIL` for every fixture whose scan-kind `attestationLookup` still lacks
`paginationComplete`/`duplicates`, or whose scan-kind `normalizedPredicate` still lacks
`reportDigest`, or whose `attestationAbsent`-shaped lookup still uses the old loose `queried` shape.
List the actual failing names before continuing -- this plan was not scratch-verified.

- [ ] **Step 2: Write and run the migration script**

```python
import json
import pathlib

root = pathlib.Path(".")
fixtures_dir = root / ".github" / "contracts" / "fixtures"


def migrate_present_attestation(entry, report_digest):
    """entry is a scanPresentAttestation or sbomPresentAttestation dict. Adds paginationComplete
    and duplicates unconditionally; adds reportDigest to normalizedPredicate only when it looks
    like a scan-shaped content (has 'scanner' -- sbomDocumentContent does not)."""
    changed = False
    if "paginationComplete" not in entry:
        entry["paginationComplete"] = True
        changed = True
    if "duplicates" not in entry:
        entry["duplicates"] = []
        changed = True
    predicate = entry.get("normalizedPredicate")
    if isinstance(predicate, dict) and "scanner" in predicate and "reportDigest" not in predicate:
        predicate["reportDigest"] = report_digest
        changed = True
    return changed


def migrate_present_report(entry):
    """Same reportDigest addition on the report side, for shape symmetry (Plan Decision A)."""
    report = entry.get("normalizedReport")
    if isinstance(report, dict) and "scanner" in report and "reportDigest" not in report:
        # The report's own descriptor digest is the natural default -- confirm against the real
        # fixture's descriptor.digest rather than assuming a placeholder is fine, since this value
        # is what Task 2's binding check compares the attestation side against.
        descriptor = entry.get("descriptor", {})
        report["reportDigest"] = descriptor.get("digest")
        return True
    return False


def migrate_absent_attestation(lookup):
    """lookup['attestationLookup'] with status:'absent' and a loosely-typed 'queried'. Needs
    queried to become the full selection tuple. For scan kinds, add reportDigest to queried -- use
    the same digest the sibling reportLookup's descriptor carries if present, else a placeholder
    consistent with the rest of the fixture (confirm against the real fixture, do not guess blindly
    for a fixture whose whole point is that no report exists either)."""
    queried = lookup.get("queried")
    return isinstance(queried, dict)  # scaffold; implementer fills in the real per-fixture logic


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
            if not isinstance(pair, dict):
                continue
            al = pair.get("attestationLookup")
            rl = pair.get("reportLookup")
            if not isinstance(al, dict):
                continue
            report_digest = None
            if isinstance(rl, dict) and rl.get("status") == "present":
                report_digest = rl.get("descriptor", {}).get("digest")
                if migrate_present_report(rl):
                    changed = True
            if al.get("status") == "present":
                if migrate_present_attestation(al, report_digest):
                    changed = True
            elif al.get("status") == "absent":
                if migrate_absent_attestation(al):
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

**`migrate_absent_attestation` is deliberately a scaffold, not a finished function** -- unlike Tasks
1-2's diffs, the exact shape of every fixture's `attestationAbsent`-style lookup was not inspected
while writing this plan. Before running this script for real: run `grep -rn '"status": "absent"'
.github/contracts/fixtures/` (or the equivalent for your shell) to find every fixture carrying an
absent attestation lookup, read each one's actual `queried` object, and write the real per-fixture
migration (adding `reportDigest` for scan kinds using a placeholder digest consistent with the rest
of that fixture, omitting it for `sbom`). This is the same category of honest gap this plan's Task 4
also has, for the same reason: no scratch run existed to verify the exact shape against.

- [ ] **Step 3: Run to verify the migrated corpus passes**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -10`

Expected: `passed=32 failed=0` (or the real current baseline -- check
`.superpowers/sdd/progress.md`'s most recent entry for the true number before assuming 32; commits 5
and 6 both migrated fixtures, and the baseline may have moved). No fixture's proven rule may change.

- [ ] **Step 4: Migrate `publish-decision.test.sh`'s `present_evidence_set()` builder**

Find the `scan_content`/`sbom_content` local variable definitions inside `present_evidence_set()`
(added by commits 5 and 6) and add `paginationComplete`, `duplicates`, and (for `scan_content` only)
`reportDigest` to both the pair's `attestationLookup` object and the `scan_content` object itself.
Read the current function body directly (`.github/scripts/publish-decision.test.sh`, search for
`present_evidence_set()`) before writing the exact edit -- this plan does not reproduce the current
bash verbatim since Tasks 3/4 of commits 5 and 6 have already modified this function twice since this
plan's addendum was written, and reproducing a stale copy here risks a Find that no longer matches.

- [ ] **Step 5: Run the full suite to verify GREEN**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -10`

Expected: unchanged pass count from before this task (migration adds zero new cases). Report the
real number.

- [ ] **Step 6: shellcheck**

Run: `shellcheck .github/scripts/publish-decision.test.sh .github/scripts/publish-decision.sh`

Expected: no new warnings versus LF-normalized baseline (compare against the git-blob version before
concluding anything found is new -- this Windows checkout has known `core.autocrlf=true` noise).

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/fixtures/ .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): select an attestation by its whole tuple (3/5)

Migrates every fixture's attestation lookups onto the new selection-
tuple/paginationComplete/duplicates/reportDigest shape, plus
publish-decision.test.sh's present_evidence_set() builder. No
fixture's proven rule changed. contract-agreement.test.sh <fill in>/0,
publish-decision.test.sh <fill in>/0 (unchanged baseline)."
```

---

### Task 4: New witness fixtures for the tuple/pagination/duplicate guards

**Files:**
- Modify: `.github/scripts/publish-decision.test.sh`
- Modify: `.github/contracts/fixtures/` (schema-structural witnesses, if any are needed for the
  `additionalProperties:false` split between `scanAttestationSelectionTuple`/
  `sbomAttestationSelectionTuple`)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fixtures proving every guard Task 2 added is load-bearing, individually isolation-
  verified per this plan's Global Constraints.

Per spec section 10 / the addendum's own "Test coverage" list, seven witnesses are needed:

1. `attestationLookup: absent`, `paginationComplete: true`, but `queried` does not match the tuple
   (name a different `subjectDigest`, say) ⇒ CONFLICT.
2. A queried tuple missing `reportDigest` on a scan kind ⇒ structurally rejected (schema-level).
3. A SBOM `queried` tuple carrying `reportDigest` ⇒ structurally rejected (schema-level,
   `additionalProperties:false` on `sbomAttestationSelectionTuple`).
4. `paginationComplete: false` on a present attestation ⇒ CONFLICT.
5. Two duplicates agreeing on every projected field ⇒ **must PASS** -- this is the idempotency case
   section 8 exists to protect, and the one most likely broken by an over-strict implementation. Do
   not skip this one; a suite with only CONFLICT witnesses for this feature would not prove the
   feature does what it claims.
6. Two duplicates differing on `outcome` (or `policy.ignoreFileDigest`) ⇒ CONFLICT.
7. Two duplicates differing ONLY on a field excluded from the projection (run ID, timestamp, etc. --
   construct by putting a field NOT in `attestationStatementProjection` into the raw JSON, which the
   schema's own `additionalProperties:false` on that `$def` would reject if it were part of the
   `$ref`'d shape, so this witness targets the DECISION's own comparison loop, not the schema) ⇒
   **must PASS**, same idempotency principle as #5.

- [ ] **Step 1: Add the decision-level cases (1, 4, 5, 6, 7) to `publish-decision.test.sh`**

This plan does not write the exact `assert_decision` bodies -- same deliberate omission as commit
6's Task 4, and for the identical reason (this project's own mutation-isolation discipline, Global
Constraints above). For each case: construct it, run the real suite and confirm the expected verdict,
then make a LOCAL, UNCOMMITTED copy of `publish-decision.sh` with ONLY the specific guard under test
removed, confirm that case alone goes red, revert, and only then keep the case.

Case 5 and case 7 need special care: they assert the ABSENCE of a problem (state stays whatever a
clean adopt/COMPLETE would be), so their isolation check is different from the other five -- instead
of removing a guard and confirming a FAIL appears, confirm that ADDING the guard's condition back
after having removed it (or, more directly, that the case currently passes with the real,
un-mutated code) and that a deliberately-introduced difference on a projected field (not present in
the case as constructed) WOULD flip it to CONFLICT, proving the comparison logic is reachable and
correct in both directions, not merely untriggered.

- [ ] **Step 2: Add the schema-structural cases (2, 3)**

Follow the established pattern from commit 6's Task 4 (two fixtures under
`.github/contracts/fixtures/invalid-structure/`, full observation documents, matching
`expectations.json` entries with `"schema": "rejects"`).

- [ ] **Step 3: Run the full suite**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -20` and the schema-level suite.

Expected: every new case reports `ok`. Report the real `passed=N failed=0` line and the real count
of new cases -- this plan predicted "up to 7" but did not verify it.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/publish-decision.test.sh .github/contracts/fixtures/
git commit -m "contract(ci): select an attestation by its whole tuple (4/5)

New witness cases: queried tuple disagreeing with the attestation
actually selected, missing/forbidden reportDigest per kind (schema-
structural), paginationComplete false, and the semantic-duplicate
comparison in both directions -- two statements agreeing on every
projected field must PASS (the idempotency case section 8 exists to
protect), two disagreeing on a projected field must CONFLICT, two
disagreeing only on an excluded field (run ID etc.) must still PASS.
All decision-level cases individually isolation-verified by local
guard removal before being kept. passed=<fill in from Step 3>."
```

---

### Task 5: Mutation rules, full suite sweep, ledger, and push

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Add mutation rules**

Read the `MUTATIONS` dict's existing convention first (this project's history has repeatedly
corrected this — match what's there). Add rules disabling, one at a time:

- The `paginationComplete` check added in Task 2 Step 1.
- The scan-kind `reportDigest` binding check added in Task 2 Step 2.
- Each field comparison inside the semantic-duplicate loop (Task 2 Step 3) — or, if the file's own
  convention favors one mutation per logical check rather than one per loop iteration, a single
  mutation disabling the whole `for field in (...)` comparison. Match the granularity every other
  mutation in this file already uses for a loop-shaped check (e.g. how commit 5's sort-order/
  duplicate-finding checks in `scan_content_problems` were split) before deciding.

- [ ] **Step 2: Targeted check of just these new rules**

Same ad hoc-module-import technique established in commits 5/6's Task 5 (no built-in subset flag on
the real runner). Expected: all new rules caught. If any survive, check first whether it is the same
class of guard-vs-guard collision found twice already in this series before assuming the mutation
itself is wrong — verify by tracing which OTHER guard might independently produce the same verdict
on the same fixture.

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

Expected: every suite at or above its prior baseline (check `.superpowers/sdd/progress.md`'s most
recent entries for the real current baselines before comparing).

- [ ] **Step 4: Full mutation sweep**

Given how long the equivalent sweep took for commits 5 and 6 on this machine (2-3 hours each), do
NOT wait for the local sweep to complete before pushing if time is limited — push after Steps 1-3 and
the targeted check (Step 2) pass, and let CI's own unmodified, much-faster run be the authoritative
verification (matches the precedent already set in this series: the local wrapper is due diligence,
not the final word). If you do run the full local sweep, use the established tolerant-wrapper
technique (`.superpowers/sdd/progress.md`'s 3b commit 5/6 Task 5 entries) and expect it to report the
same 2 already-accepted, structurally-unreachable survivors from commit 5
(`scan_report_attestation_disagreement_ignored`, `marker_scan_recompute_ignored`) plus every new
commit-7 rule caught — any OTHER survivor is real and needs investigation before pushing, the same
standard applied twice already in commits 5 and 6.

- [ ] **Step 5: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings versus baseline.

- [ ] **Step 6: Update the ledger**

Append a `## 3b commit 7: select an attestation by its whole tuple` section to
`.superpowers/sdd/progress.md`, following this series' established structure: what changed, the two
Plan Decisions (A: `normalizedScanContent.reportDigest`; B: optional projection fields), any
discrepancies between this plan's predictions and real output, final suite/mutation counts, known
gaps carried forward.

- [ ] **Step 7: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py .superpowers/sdd/progress.md
git commit -m "contract(ci): select an attestation by its whole tuple (5/5)

New mutation rules for the tuple/pagination/duplicate guards -- all
caught in targeted verification. Full local suite sweep clean at or
above every prior baseline. shellcheck clean."
git push origin ci/ghcr-publish
```

Read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then `gh
run view --json jobs`, then pull the lint job's log for `SURVIVED`/`caught` lines and `passed=`
lines). This is the real, authoritative verification. Compare the survivor list against the 2
already-accepted ones from commit 5 — any other survivor is real and must be fixed, the same
discipline applied in commits 5 and 6 (both of which found and fixed a real regression this exact
way, one of them only visible on CI after the local wrapper's timeout-based "caught" logic masked
it).

This closes 3b commit 7. Report the final, CI-confirmed state before considering the commit done.

---

## Self-Review

**Spec coverage** — spec §8 line by line against Tasks 1-4:
- Full selection tuple, `reportDigest` for scans / forbidden for SBOM → Task 1's
  `scanAttestationSelectionTuple`/`sbomAttestationSelectionTuple`, witnessed by Task 4 cases 2-3.
- Pagination error mid-page ⇒ UNKNOWN (not "found nothing") → already covered by the existing
  `error` union member and the nested-error retryable scan from commit 4 — this commit does not need
  to add anything for that half, it only tightens the ABSENT/PRESENT halves' own required shape.
- Multiple matches not automatically CONFLICT; semantic-duplicate projection → Task 1's
  `attestationStatementProjection` + `duplicates[]`, Task 2's comparison loop, witnessed by Task 4
  cases 5-7 (both directions: agreement passes, disagreement on a projected field conflicts,
  disagreement on an excluded field still passes).
- `paginationComplete` on the present branch too → Task 1 Steps 3-4, Task 2 Step 1, witnessed by
  Task 4 case 4.
- Not in scope, correctly excluded: the pagination mechanism itself (collector, does not exist),
  byte caps (§7, no scanner script exists yet).

**Placeholder scan** — Task 3's `migrate_absent_attestation` is explicitly left a scaffold with a
named reason (no fixture inspection happened while writing this plan) and an explicit instruction
for what the implementer must do before running it — flagged, not hidden. Task 3 Step 4 similarly
declines to reproduce `present_evidence_set()`'s current body verbatim, naming the reason (two prior
commits have already modified it since this addendum was written) rather than risking a stale Find.
Task 4 defers exact case bodies for the same mutation-isolation reason commit 6's plan already
established as this series' own precedent.

**Type consistency** — `attestationStatementProjection` is defined once (Task 1), consumed
identically by both `scanPresentAttestation.duplicates` and `sbomPresentAttestation.duplicates`
(Task 1), and read with the same `.get()`-only access pattern in Task 2's comparison loop (never
`[]`, per this plan's own Interfaces section). `scanAttestationSelectionTuple`/
`sbomAttestationSelectionTuple` are consumed by exactly the `queried` field of their respective
`*AttestationAbsent` `$def`, no other reference. `normalizedScanContent.reportDigest` (Task 1 Step 5)
is read by exactly one call site (Task 2 Step 2), matching the plan's own Interfaces section.
