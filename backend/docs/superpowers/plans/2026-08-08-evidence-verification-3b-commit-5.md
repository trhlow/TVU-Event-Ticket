# 3b commit 5 — "make the scan verdict something the decision recomputes" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `normalizedReport`/`normalizedPredicate` real shape for the three scan report kinds
(spec §6), and make the decision recompute each kind's verdict from that shape rather than trusting
any single source's claim — comparing the report's own recomputed verdict, the attestation's own
recomputed verdict, and the marker's `passed` claim as three independent sources, any pairwise
disagreement (or the recomputed verdict itself failing) being CONFLICT.

**Architecture:** SBOM does not share the scan contract (spec §4) — a parallel pair type
(`scanReportAttestationPair` etc.) gives only the three scan kinds real shape, leaving SBOM's
`reportAttestationPair` exactly as commit 4 left it. `normalizedScanContent` splits `counts` (a
complete, always-untruncated aggregate the verdict is computed from) from `findings` (a bounded,
possibly-truncated audit list) — this split is load-bearing: §6's own claim that a truncated list
cannot change the result only holds if the verdict never reads the list. Decision logic lives in two
places: `evidence_set_problems()` gets the two-way report-vs-attestation comparison (both are in
scope there already); `marker_problems()`'s existing per-kind/per-image loop gets the third
comparison against the marker's own claim (where that claim is already in scope).

**Tech Stack:** Same as commits 1-4 — JSON Schema draft 2020-12, Python 3.10+ decision script, bash
test harnesses.

## Global Constraints

- `additionalProperties: false` at every object level.
- SBOM must not be touched by this commit's decision logic or schema retyping — its own real shape
  is commit 6's job (spec §4). `presentReport`/`presentAttestation` stay exactly as commit 4 left
  them; only the three scan kinds' `reports` properties are re-pointed to the new pair type.
- `normalizedScanContent.counts` is the verdict's only input. Never derive `recomputedOutcome` from
  `findings` — `findings` is a bounded, possibly-truncated audit list, not the verdict's source.
- `recomputedOutcome is False` is its own CONFLICT trigger (spec §10's matrix), independent of
  whether every source agrees — do not skip this check because "everything already agrees."
- Do not wire commit 3's predicate schemas (`.github/contracts/predicates/*.schema.json`) into
  `normalizedScanContent` — no spec text assigns that to this commit.
- Do not touch `predicate.reportDigest` cross-checks or full attestation-selection-tuple enforcement
  (spec §8, commit 7).
- **Known environment artifact, not to be treated as a defect and not to be fixed in this commit:**
  on Windows, a large observation (this commit's fixtures routinely exceed 20 KB once six
  `normalizedScanContent` copies are present) can make `publish-decision.sh` fail with
  `Argument list too long` from MSYS/git-bash — the script passes the whole observation as a single
  command-line argument to the embedded Python interpreter, and MSYS's `exec` emulation has a much
  lower ceiling than Linux's `ARG_MAX` (~2 MB on GitHub Actions ubuntu runners, where this commit's
  fixtures are nowhere near the limit). If you hit this locally, use the workaround in Task 2 Step 4
  and Task 4's verification steps (invoking the embedded Python directly with the observation passed
  by file path) rather than modifying `publish-decision.sh`'s I/O — piping via stdin was already
  tried and does not work, because stdin is already consumed by the heredoc carrying the Python
  program itself.

---

## File Structure

- `.github/contracts/observation.schema.json` — **modify**. New `$defs`:
  `scanReportAttestationPair`, `scanReportEvidenceLookup`, `scanPresentReport`,
  `scanAttestationEvidenceLookup`, `scanPresentAttestation`, `normalizedScanContent`, `scanCounts`,
  `severityCount`, `scanPolicy`, `finding`. `presentEvidenceSet.reports`'s three scan-kind
  properties re-pointed to `scanReportAttestationPair`.
- `.github/scripts/publish-decision.sh` — **modify**. New: `SCAN_REPORT_KINDS`, `SEVERITY_RANK`,
  `finding_sort_key`, `finding_tuple`, `recomputed_outcome`, `scan_content_problems`.
  `evidence_set_problems()`'s reports loop extended. `marker_problems()`'s per-kind/per-image loop
  extended.
- `.github/contracts/fixtures/` (up to 17 files) + `.github/scripts/publish-decision.test.sh` —
  **modify**. Migration for scan-kind `normalizedReport`/`normalizedPredicate`; new witness cases.
- `.github/scripts/publish-decision.mutations.py` — **modify**. New mutation rules.
- `.superpowers/sdd/progress.md` — **modify**. Ledger entry.

## Interfaces

- Consumes: `#/$defs/digest`, `#/$defs/sha1`, `#/$defs/hex64` (existing); `SCAN_REPORT_KINDS`,
  `IMAGES` (existing, from commit 4 and earlier).
- Produces: `recomputed_outcome(kind, counts) -> bool`, consumed by both `evidence_set_problems()`
  and `marker_problems()`. `scan_content_problems(kind, content, where) -> (list[str], bool|None)`,
  consumed only by `evidence_set_problems()`.
- `SCAN_REPORT_KINDS = ("vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")` — the
  three kinds that share the scan contract, distinct from the existing `EVIDENCE_REPORT_KINDS`
  (which includes `sbom`).

---

### Task 1: Schema — the scan-only pair type and `normalizedScanContent`

**Files:**
- Modify: `.github/contracts/observation.schema.json`

**Interfaces:**
- Consumes: `#/$defs/digest`, `#/$defs/sha1`, `#/$defs/hex64`, `#/$defs/absent`, `#/$defs/error`,
  `#/$defs/attestationAbsent` (all existing).
- Produces: the ten new `$defs` listed in File Structure.

This exact diff was verified against a real scratch worktree before this plan was written: JSON
well-formedness confirmed, and (after Task 3's migration) `contract-agreement.test.sh` passing at
its unchanged baseline.

- [ ] **Step 1: Re-point `presentEvidenceSet.reports`'s three scan-kind properties**

Find:

```json
            "sbom": { "$ref": "#/$defs/reportAttestationPair" },
            "vulnerabilityScan": { "$ref": "#/$defs/reportAttestationPair" },
            "layerSecretScan": { "$ref": "#/$defs/reportAttestationPair" },
            "filesystemSecretScan": { "$ref": "#/$defs/reportAttestationPair" }
```

Replace with:

```json
            "sbom": { "$ref": "#/$defs/reportAttestationPair" },
            "vulnerabilityScan": { "$ref": "#/$defs/scanReportAttestationPair" },
            "layerSecretScan": { "$ref": "#/$defs/scanReportAttestationPair" },
            "filesystemSecretScan": { "$ref": "#/$defs/scanReportAttestationPair" }
```

- [ ] **Step 2: Update `presentReport.normalizedReport`'s description (no shape change)**

Find, inside `presentReport`:

```json
        "normalizedReport": {
          "type": "object",
          "description": "Loosely typed until commit 5 (spec section 6) gives it real shape."
        }
```

Replace with:

```json
        "normalizedReport": {
          "type": "object",
          "description": "Loosely typed here: this shape is shared by all four report kinds, and SBOM does not share the scan contract (spec section 4, 'SBOM khong dung chung contract voi scan') -- SBOM's own real shape is commit 6's job. The three scan kinds get real shape via scanPresentReport instead (spec section 6, commit 5), referenced from presentEvidenceSet.reports for those three kinds only."
        }
```

- [ ] **Step 3: Update `presentAttestation.normalizedPredicate`'s description (no shape change)**

Find, inside `presentAttestation`:

```json
        "normalizedPredicate": {
          "type": "object",
          "description": "Loosely typed until commit 5 (spec section 6) gives it real shape."
        }
```

Replace with:

```json
        "normalizedPredicate": {
          "type": "object",
          "description": "Loosely typed here for the same reason presentReport.normalizedReport is: shared by all four kinds, and SBOM does not share the scan contract (section 4). The three scan kinds get real shape via scanPresentAttestation instead."
        }
```

- [ ] **Step 4: Add the ten new `$defs`, immediately after `presentAttestation`'s closing brace and before `attestationAbsent`**

```json
    "scanReportAttestationPair": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 5 (spec section 6): the same pairing as reportAttestationPair, but for the three report kinds that share the scan contract -- normalizedReport/normalizedPredicate get real shape here (scanPresentReport/scanPresentAttestation) rather than the generic placeholder reportAttestationPair still uses for SBOM (section 4: SBOM does not share the scan contract; its own real shape is commit 6's job).",
      "required": ["reportLookup", "attestationLookup"],
      "properties": {
        "reportLookup": { "$ref": "#/$defs/scanReportEvidenceLookup" },
        "attestationLookup": { "$ref": "#/$defs/scanAttestationEvidenceLookup" }
      }
    },

    "scanReportEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/scanPresentReport" },
        { "$ref": "#/$defs/absent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "scanPresentReport": {
      "type": "object",
      "additionalProperties": false,
      "description": "Identical to presentReport except normalizedReport has scanPresentReport's own real shape (normalizedScanContent) instead of the generic placeholder -- duplicated rather than composed via allOf, matching this schema's own established precedent (e.g. absent/error duplicated across every *Lookup union) that additionalProperties:false objects are not safely composable.",
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
        "normalizedReport": { "$ref": "#/$defs/normalizedScanContent" }
      }
    },

    "scanAttestationEvidenceLookup": {
      "oneOf": [
        { "$ref": "#/$defs/scanPresentAttestation" },
        { "$ref": "#/$defs/attestationAbsent" },
        { "$ref": "#/$defs/error" }
      ]
    },

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

    "normalizedScanContent": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 5 (spec section 6): the collector's already-normalized view of a scan report or, independently, of the predicate an attestation vouches for -- shared by reportLookup.present.normalizedReport and attestationLookup.present.normalizedPredicate so that the decision comparing them is comparing two documents of the same shape, not an accident. scanner here is intentionally minimal (name/version only) -- vulnerability-DB vs. ruleset identity is section 7's own predicate schema's concern (commit 3, still unwired into this comparison view), not re-validated here.",
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
        "policy": { "$ref": "#/$defs/scanPolicy" },
        "counts": {
          "$ref": "#/$defs/scanCounts",
          "description": "The complete aggregate by (severity, fixAvailable), computed by the collector over every finding after ignore rules are applied -- not just the ones the bounded findings list below can show. The decision recomputes its verdict from this, not from findings, so a truncated findings list cannot change the result (section 6)."
        },
        "findings": {
          "type": "array",
          "maxItems": 100,
          "items": { "$ref": "#/$defs/finding" },
          "description": "Bounded list of findings at or above policy.severityThreshold, for audit and duplicate-detection -- not the verdict's own input. May be a strict subset of what counts aggregates (findings below the threshold are never listed here even when truncated is false)."
        },
        "truncated": { "type": "boolean" },
        "declaredOutcome": { "type": "boolean" }
      },
      "if": {
        "properties": { "findings": { "minItems": 100 } },
        "required": ["findings"]
      },
      "then": {
        "properties": { "truncated": { "const": true } }
      }
    },

    "scanCounts": {
      "type": "object",
      "additionalProperties": false,
      "required": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"],
      "description": "Section 6: aggregated by (severity, fixAvailable), not merely by severity -- a policy that fails on 'HIGH with a fix' cannot be recomputed from a severity-only count when the visible findings list is truncated.",
      "properties": {
        "CRITICAL": { "$ref": "#/$defs/severityCount" },
        "HIGH": { "$ref": "#/$defs/severityCount" },
        "MEDIUM": { "$ref": "#/$defs/severityCount" },
        "LOW": { "$ref": "#/$defs/severityCount" },
        "UNKNOWN": { "$ref": "#/$defs/severityCount" }
      }
    },

    "severityCount": {
      "type": "object",
      "additionalProperties": false,
      "required": ["withFix", "withoutFix"],
      "properties": {
        "withFix": { "type": "integer", "minimum": 0 },
        "withoutFix": { "type": "integer", "minimum": 0 }
      }
    },

    "scanPolicy": {
      "type": "object",
      "additionalProperties": false,
      "required": ["severityThreshold", "ignoreList", "ignoreFileDigest"],
      "description": "Section 6: policy and ruleset must come from a file Git tracks, and the digest of that file lives here -- an ignore file that changes is a verdict basis that changes, and it must show up rather than move silently.",
      "properties": {
        "severityThreshold": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
        "ignoreList": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 }
        },
        "ignoreFileDigest": { "$ref": "#/$defs/hex64" }
      }
    },

    "finding": {
      "type": "object",
      "additionalProperties": false,
      "description": "Section 6's own sort tuple names exactly these five fields: severity rank descending, fixAvailable (true first), packageName, vulnerabilityId, targetPath, all compared by code point.",
      "required": ["severity", "fixAvailable", "packageName", "vulnerabilityId", "targetPath"],
      "properties": {
        "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
        "fixAvailable": {
          "type": "boolean",
          "description": "Computed by the collector from Trivy's own FixedVersion being non-empty, not inferred from text (section 6). The schema can only require the boolean exist, not how it was derived."
        },
        "packageName": { "type": "string", "minLength": 1 },
        "vulnerabilityId": { "type": "string", "minLength": 1 },
        "targetPath": { "type": "string", "minLength": 1 }
      }
    },
```

- [ ] **Step 5: Confirm the schema is still well-formed JSON**

Run: `python -c "import json; json.load(open('.github/contracts/observation.schema.json', encoding='utf-8')); print('ok')"`

Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add .github/contracts/observation.schema.json
git commit -m "contract(ci): make the scan verdict something the decision recomputes (1/5)

Ten new schema $defs per spec section 6: a scan-only pair type
(scanReportAttestationPair etc.) parallel to reportAttestationPair --
SBOM does not share the scan contract (section 4), so presentReport/
presentAttestation stay untouched and only the three scan kinds'
reports properties are re-pointed. normalizedScanContent splits counts
(complete, untruncated, the verdict's only input) from findings
(bounded, possibly-truncated audit list). Every existing fixture using
the loosely-typed scan-kind placeholder is now schema-invalid; commit
3 of this series migrates the corpus. Not run against any suite yet."
```

---

### Task 2: Decision logic — `recomputed_outcome`, `scan_content_problems`, and the two comparison sites

**Files:**
- Modify: `.github/scripts/publish-decision.sh`

**Interfaces:**
- Consumes: `#/$defs/normalizedScanContent`, `#/$defs/scanCounts` (Task 1).
- Produces: `recomputed_outcome(kind, counts)`, `scan_content_problems(kind, content, where)`.

This exact diff was verified against a real scratch worktree before this plan was written, including
empirical runs of: the clean baseline (unaffected, still `COMPLETE`), a self-consistent-fail
observation (report, attestation, and marker all honestly agree a scan failed — correctly
`CONFLICT`, proving `recomputedOutcome is False` fires as its own trigger, not merely on
disagreement), the lying-marker case (marker claims `passed: true` while honestly-reported evidence
recomputes to `False` — correctly `CONFLICT` with the message naming exactly this), and the
mandatory 101st-finding witness (100 visible `LOW` findings, `truncated: true`, `counts` implying an
unlisted `HIGH`+fix finding — correctly `CONFLICT`, proving the verdict reads `counts`, not
`findings`).

- [ ] **Step 1: Add `SCAN_REPORT_KINDS`, `SEVERITY_RANK`, and the three helper functions**

Find:

```python
EVIDENCE_REPORT_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")
```

Replace with:

```python
EVIDENCE_REPORT_KINDS = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")
# SBOM does not share the scan contract (section 4) -- its own recomputed verdict is commit 6's job.
SCAN_REPORT_KINDS = ("vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")
SEVERITY_RANK = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "UNKNOWN": 0}


def finding_sort_key(finding):
    return (
        -SEVERITY_RANK.get(finding.get("severity"), -1),
        0 if finding.get("fixAvailable") else 1,
        finding.get("packageName"),
        finding.get("vulnerabilityId"),
        finding.get("targetPath"),
    )


def finding_tuple(finding):
    return (finding.get("severity"), finding.get("fixAvailable"), finding.get("packageName"),
            finding.get("vulnerabilityId"), finding.get("targetPath"))


def recomputed_outcome(kind, counts):
    """True = passed. Section 6's two verdict-policy rules: vulnerabilityScan fails on any
    CRITICAL or any HIGH with a fix; both secret-scan kinds fail on any finding at all."""
    def count(severity, key):
        entry = counts.get(severity)
        return entry.get(key, 0) if type(entry) is dict else 0

    if kind == "vulnerabilityScan":
        fails = (count("CRITICAL", "withFix") + count("CRITICAL", "withoutFix") > 0
                 or count("HIGH", "withFix") > 0)
    else:
        fails = any(count(severity, "withFix") + count(severity, "withoutFix") > 0
                    for severity in SEVERITY_RANK)
    return not fails


def scan_content_problems(kind, content, where):
    """Everything wrong with one kind's normalizedReport or normalizedPredicate that the schema
    cannot already see -- sort order, exact-duplicate findings, and (section 6) the verdict
    recomputed from counts. Returns (problems, recomputed_outcome_or_None). The schema already
    guarantees content's own shape when the lookup is status:present, so this does not re-check
    types the schema already requires -- only cross-cutting/value-level facts, same split as every
    other check in this function."""
    problems = []
    findings = content.get("findings", [])
    ordered = sorted(findings, key=finding_sort_key)
    if [finding_tuple(f) for f in ordered] != [finding_tuple(f) for f in findings]:
        problems.append(f"{where}.findings is not sorted by severity desc, fixAvailable, "
                        f"packageName, vulnerabilityId, targetPath (section 6)")
    seen = set()
    for finding in findings:
        tup = finding_tuple(finding)
        if tup in seen:
            problems.append(f"{where}.findings has a duplicate entry {tup!r}; a report listing "
                            f"the same finding twice cannot be trusted for its counts")
        seen.add(tup)

    counts = content.get("counts", {})
    recomputed = recomputed_outcome(kind, counts)

    if content.get("truncated") is not True:
        # Untruncated means findings is a complete view of everything at or above the policy
        # threshold -- if its length disagrees with what counts implies for those severities, the
        # two halves of this document contradict each other and neither can be trusted blind.
        threshold_rank = SEVERITY_RANK.get(content.get("policy", {}).get("severityThreshold"), 0)
        expected_visible = sum(
            counts.get(severity, {}).get("withFix", 0) + counts.get(severity, {}).get("withoutFix", 0)
            for severity, rank in SEVERITY_RANK.items() if rank >= threshold_rank
        )
        if len(findings) != expected_visible:
            problems.append(f"{where}.findings has {len(findings)} entries but counts implies "
                            f"{expected_visible} at or above the policy threshold, and truncated "
                            f"is false")

    if content.get("declaredOutcome") is not recomputed:
        problems.append(f"{where}.declaredOutcome is {content.get('declaredOutcome')!r}, but "
                        f"recomputed from counts it is {recomputed!r}")

    if recomputed is False:
        # Section 10's matrix: "recomputedOutcome fail" is its own CONFLICT trigger, independent of
        # whether every source agrees on it. A scan that failed policy blocks the release even when
        # the report, the attestation, and the marker all self-consistently say so -- agreement is
        # not permission.
        problems.append(f"{where}: recomputed verdict fails policy (counts={counts!r})")

    return problems, recomputed
```

- [ ] **Step 2: Extend `evidence_set_problems()`'s reports loop with the two-way comparison**

Find:

```python
        elif attestation_lookup.get("attestationVerified") is not True:
            problems.append(f"{where}.reports.{kind}.attestationLookup.attestationVerified is "
                            f"{attestation_lookup.get('attestationVerified')!r}, must be boolean true")
    return problems
```

Replace with:

```python
        elif attestation_lookup.get("attestationVerified") is not True:
            problems.append(f"{where}.reports.{kind}.attestationLookup.attestationVerified is "
                            f"{attestation_lookup.get('attestationVerified')!r}, must be boolean true")

        # 3b commit 5 (spec section 6): SBOM does not share this contract (section 4, commit 6's
        # job) -- only the three scan kinds get a recomputed verdict here. Guarded on both halves
        # already being present and verified above: a report or attestation that failed its own
        # checks has nothing trustworthy to recompute from, and piling a second, derived complaint
        # on top of an already-reported problem would not name anything new.
        if (kind in SCAN_REPORT_KINDS
                and type(report_lookup) is dict and report_lookup.get("status") == "present"
                and type(attestation_lookup) is dict and attestation_lookup.get("status") == "present"):
            report_content = report_lookup.get("normalizedReport")
            attestation_content = attestation_lookup.get("normalizedPredicate")
            report_outcome = attestation_outcome = None
            if type(report_content) is dict:
                report_problems, report_outcome = scan_content_problems(
                    kind, report_content, f"{where}.reports.{kind}.reportLookup.normalizedReport")
                problems += report_problems
            if type(attestation_content) is dict:
                attestation_problems, attestation_outcome = scan_content_problems(
                    kind, attestation_content,
                    f"{where}.reports.{kind}.attestationLookup.normalizedPredicate")
                problems += attestation_problems
            if (report_outcome is not None and attestation_outcome is not None
                    and report_outcome != attestation_outcome):
                # Section 5's whole point: two independent sources, compared, not merged. Agreement
                # on shape does not imply agreement on content.
                problems.append(f"{where}.reports.{kind}: report recomputes to {report_outcome!r}, "
                                f"attestation recomputes to {attestation_outcome!r} -- two "
                                f"independent sources disagree")
    return problems
```

- [ ] **Step 3: Extend `marker_problems()`'s per-kind/per-image loop with the third comparison**

Find (inside `marker_problems()`, in the `for kind in (...)` / `for image in IMAGES` loop):

```python
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")
```

Replace with:

```python
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

                if kind in SCAN_REPORT_KINDS:
                    # 3b commit 5 (spec section 6): the third independent source. A marker cannot
                    # merely agree with itself -- its own passed claim is compared against what the
                    # evidence-set's own report actually recomputes, the same "not trusted on its
                    # word" rule commit 2 already applies to evidenceSetDigest.
                    evidence_set_lookup = obs["lookups"][f"{image}EvidenceSet"]
                    if evidence_set_lookup["status"] == "present":
                        es_reports = evidence_set_lookup.get("reports")
                        es_pair = es_reports.get(kind) if type(es_reports) is dict else None
                        es_report_lookup = es_pair.get("reportLookup") if type(es_pair) is dict else None
                        if type(es_report_lookup) is dict and es_report_lookup.get("status") == "present":
                            es_report_content = es_report_lookup.get("normalizedReport")
                            if type(es_report_content) is dict:
                                es_counts = es_report_content.get("counts")
                                if type(es_counts) is dict:
                                    marker_recomputed = recomputed_outcome(kind, es_counts)
                                    if entry.get("passed") is not marker_recomputed:
                                        problems.append(
                                            f"{where}.content.evidence.{kind}.{image}.passed is "
                                            f"{entry.get('passed')!r}, but the evidence-set's own "
                                            f"report recomputes to {marker_recomputed!r}")
```

- [ ] **Step 4: Confirm no `SyntaxError`**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | head -20`

Expected: `FAIL` lines from the still-unmigrated fixture corpus (Task 3's job), not a Python
`SyntaxError` or traceback naming a name error (e.g. `SCAN_REPORT_KINDS` or `recomputed_outcome` not
defined — would mean Step 1's placement was lost). If a specific fixture's failure message is a
Python traceback rather than a `FAIL <name>: ...` line in the harness's own format, treat that as a
real bug in this step's code and fix it before proceeding.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/publish-decision.sh
git commit -m "contract(ci): make the scan verdict something the decision recomputes (2/5)

recomputed_outcome() implements section 6's two verdict-policy rules
from counts (never from findings, so a truncated list cannot change
the result). scan_content_problems() checks sort order, exact-duplicate
findings, the untruncated-but-miscounted rule, declaredOutcome
agreement, and -- independent of agreement -- that a failing recomputed
verdict is CONFLICT on its own (section 10's matrix). Wired at two
sites: evidence_set_problems() compares the report's and attestation's
own recomputed verdicts; marker_problems() compares the marker's own
passed claim against the same recomputation, closing the exact
self-assertion gap section 6 exists for. Verified in scratch before
this plan was written: clean pass unaffected, a self-consistent-fail
observation correctly reaches CONFLICT (proving the independent-fail
trigger), a lying marker (claims pass while honest evidence recomputes
to fail) correctly caught by name, and the mandatory 101st-finding
witness correctly fails from counts despite a truncated, all-LOW
visible list. Not run against any suite yet -- Task 3 migrates the
fixture corpus this needs."
```

---

### Task 3: Migrate the existing fixture corpus

**Files:**
- Modify: up to 17 files under `.github/contracts/fixtures/` (see Task 3 of the 3b commit 4 plan for
  the exact list — the same files that carry evidence-set report/attestation pairs).
- Modify: `.github/scripts/publish-decision.test.sh` (`present_evidence_set()` builder).

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a corpus that validates against the new schema and still proves what it always proved.

- [ ] **Step 1: Run to confirm the corpus is now broken by Tasks 1-2's schema change**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -25`

Expected: `FAIL` for every fixture whose `reports.{vulnerabilityScan,layerSecretScan,
filesystemSecretScan}.{reportLookup,attestationLookup}` still uses the loosely-typed `{}` placeholder
from commit 4 -- confirmed in scratch to be up to 10 of the corpus's fixtures (fewer than the full 17
that carry evidence-set data at all, since some don't reach far enough into `reports` to trip the
new required fields). If the failure count differs meaningfully from expectations, list the failing
names before continuing rather than assuming.

If `contract-agreement.test.sh` fails every case with a WSL relay error
(`decision exited 1: ... execvpe(/bin/bash) failed`), re-run with `PUBLISH_DECISION_BASH=/usr/bin/bash`
-- a known environment quirk from prior commits in this series, unrelated to this task.

- [ ] **Step 2: Write and run the migration script**

```python
import json
import pathlib

root = pathlib.Path(".")
fixtures_dir = root / ".github" / "contracts" / "fixtures"

SCAN_KINDS = ("vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")
CLEAN_COUNTS = {
    "CRITICAL": {"withFix": 0, "withoutFix": 0},
    "HIGH": {"withFix": 0, "withoutFix": 0},
    "MEDIUM": {"withFix": 0, "withoutFix": 0},
    "LOW": {"withFix": 0, "withoutFix": 0},
    "UNKNOWN": {"withFix": 0, "withoutFix": 0},
}


def scan_content(digest):
    return {
        "scanner": {"name": "trivy", "version": "0.55.0"},
        "target": {"imageDigest": digest},
        "policy": {"severityThreshold": "HIGH", "ignoreList": [], "ignoreFileDigest": "0" * 64},
        "counts": json.loads(json.dumps(CLEAN_COUNTS)),
        "findings": [],
        "truncated": False,
        "declaredOutcome": True,
    }


def migrate(pair, digest):
    changed = False
    rl = pair.get("reportLookup")
    if isinstance(rl, dict) and rl.get("status") == "present" and rl.get("normalizedReport") == {}:
        rl["normalizedReport"] = scan_content(digest)
        changed = True
    al = pair.get("attestationLookup")
    if isinstance(al, dict) and al.get("status") == "present" and al.get("normalizedPredicate") == {}:
        al["normalizedPredicate"] = scan_content(digest)
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
        digest = es.get("carrierDigest")
        for kind in SCAN_KINDS:
            pair = reports.get(kind)
            if isinstance(pair, dict):
                if migrate(pair, digest):
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

Expected (verified in scratch): `total files migrated: 17`. Note `sbom`'s own `{}` placeholder is
correctly left untouched by this script (it only migrates `SCAN_KINDS`) -- confirm no diff appears
for any fixture's `reports.sbom` after running.

- [ ] **Step 3: Run to verify the migrated corpus passes**

Run: `bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -10`

Expected: `passed=32 failed=0` -- the exact pre-existing baseline (no fixture's proven rule changed).

- [ ] **Step 4: Migrate `publish-decision.test.sh`'s `present_evidence_set()` builder**

Find:

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
{"status":"present","queriedRef":"$repo@$digest","carrierDigest":"$digest",
 "verification":{"attestationVerified":true,"subjectDigest":"$digest",
                  "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                  "sourceRevision":"$SHA","predicateType":"https://tvu.example/evidence-set","policyPassed":true},
 "subjectMatches":true,"layersValid":true,
 "reports":{"sbom":$pair,"vulnerabilityScan":$pair,"layerSecretScan":$pair,"filesystemSecretScan":$pair}}
EOF
}
```

Replace with:

```bash
CLEAN_COUNTS='{"CRITICAL":{"withFix":0,"withoutFix":0},"HIGH":{"withFix":0,"withoutFix":0},
               "MEDIUM":{"withFix":0,"withoutFix":0},"LOW":{"withFix":0,"withoutFix":0},
               "UNKNOWN":{"withFix":0,"withoutFix":0}}'

present_evidence_set() {
  local repo="$1" digest="$2"
  local scan_content='{"scanner":{"name":"trivy","version":"0.55.0"},
               "target":{"imageDigest":"'"$digest"'"},
               "policy":{"severityThreshold":"HIGH","ignoreList":[],"ignoreFileDigest":"'"$(printf '0%.0s' {1..64})"'"},
               "counts":'"$CLEAN_COUNTS"',"findings":[],"truncated":false,"declaredOutcome":true}'
  local pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "descriptor":{"mediaType":"application/vnd.evts.evidence.report.v1+json","digest":"'"$digest"'","size":1024},
                 "digestVerified":true,"sizeVerified":true,"schemaValid":true,"normalizedReport":{}},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "subjectDigest":"'"$digest"'","predicateType":"https://tvu.example/report-attestation",
                 "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                 "sourceRevision":"'"$SHA"'","attestationVerified":true,"normalizedPredicate":{}}}'
  local scan_pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "descriptor":{"mediaType":"application/vnd.evts.evidence.report.v1+json","digest":"'"$digest"'","size":1024},
                 "digestVerified":true,"sizeVerified":true,"schemaValid":true,"normalizedReport":'"$scan_content"'},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'",
                 "subjectDigest":"'"$digest"'","predicateType":"https://tvu.example/report-attestation",
                 "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                 "sourceRevision":"'"$SHA"'","attestationVerified":true,"normalizedPredicate":'"$scan_content"'}}'
  cat <<EOF
{"status":"present","queriedRef":"$repo@$digest","carrierDigest":"$digest",
 "verification":{"attestationVerified":true,"subjectDigest":"$digest",
                  "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                  "sourceRevision":"$SHA","predicateType":"https://tvu.example/evidence-set","policyPassed":true},
 "subjectMatches":true,"layersValid":true,
 "reports":{"sbom":$pair,"vulnerabilityScan":$scan_pair,"layerSecretScan":$scan_pair,"filesystemSecretScan":$scan_pair}}
EOF
}
```

(`sbom` keeps the old `$pair` variable, correctly left with `normalizedReport:{}`/
`normalizedPredicate:{}` -- SBOM does not share the scan contract. Only the three scan kinds move to
`$scan_pair`. `CLEAN_COUNTS` is declared once at file scope so it is not rebuilt on every call.)

- [ ] **Step 5: Run the full suite to verify GREEN at the prior baseline**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -10`

Expected: `passed=209 failed=0` -- the exact baseline this branch was at after 3b commit 4 (204
original + 5 witness cases added in that commit's Task 4). This task adds zero new cases; it only
migrates existing ones.

If you hit `Argument list too long` on Windows (see this plan's Global Constraints section), that is
the known local-only argv-length artifact, not a regression -- if you need to debug a specific
fixture's decision output rather than just confirm pass/fail counts, extract the embedded Python
program from `publish-decision.sh` (between the `<<'PYTHON'` and closing `PYTHON` markers) to a
standalone `.py` file, change `strict_loads(sys.argv[2])` to
`strict_loads(open(sys.argv[2], encoding='utf-8').read())`, and invoke it directly:
`python extracted.py <script_dir> <path-to-observation-file>` -- this was the exact technique used to
verify Task 2's code in scratch, and reproduces the real script's behavior faithfully (confirmed
against the unmodified fixture corpus in scratch, which showed identical results to what the harness
itself reported for every fixture the argv limit didn't block).

- [ ] **Step 6: shellcheck**

Run: `shellcheck .github/scripts/publish-decision.test.sh .github/scripts/publish-decision.sh`

Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/fixtures/ .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): make the scan verdict something the decision recomputes (3/5)

Migrates the scan-kind normalizedReport/normalizedPredicate content
across the existing fixture corpus (up to 17 files) and publish-
decision.test.sh's present_evidence_set() builder onto the new
normalizedScanContent shape -- one migration script for the static
fixtures, one builder edit for the dynamic test corpus. SBOM's own
normalizedReport/normalizedPredicate placeholder is correctly left
untouched (SBOM does not share the scan contract). No fixture's proven
rule changed. contract-agreement.test.sh 32/0, publish-decision.
test.sh 209/0 (unchanged baseline)."
```

---

### Task 4: New witness fixtures for the recompute logic

**Files:**
- Modify: `.github/scripts/publish-decision.test.sh`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fixtures proving every guard Task 2 added is load-bearing.

All `assert_decision` cases below use `damaged_evidence_set` against `$present_mono_es`, the same
pattern the existing "3b commit 2" section already uses (Python `exec()` statements, `True`/`False`/
`None`, not JSON `true`/`false`/`null`). Add them in a new subsection immediately after the existing
"3b commit 4" cases (the five cases 3b commit 4's Task 4 added), before the
"evidence-set lookup error surfaces through the same UNKNOWN gate" case.

Two of these nine cases (the self-consistent-fail case and the lying-marker case) were empirically
verified against the real decision script in scratch before this plan was written, using the
extraction technique described in Task 3 Step 5 (the observations were too large to invoke via the
normal argv path on this Windows dev machine). The other seven follow the same, now-proven mechanism
and use the same construction pattern; verify each one's actual output per Step 2 below rather than
assuming the state/actions values shown are correct without running them.

- [ ] **Step 1: Add the nine new cases**

```bash
# Fix (3b commit 5): a self-consistent failing scan (report, attestation, and -- if you set it --
# the marker all honestly agree it failed) must still be CONFLICT. Verified empirically in scratch:
# recomputedOutcome=False is its own trigger (section 10's matrix), not merely a disagreement check.
FAILING_FINDING='{"severity": "CRITICAL", "fixAvailable": True, "packageName": "libfoo", "vulnerabilityId": "CVE-2026-0001", "targetPath": "/usr/lib/libfoo.so"}'
FAILING_COUNTS='{"CRITICAL": {"withFix": 1, "withoutFix": 0}, "HIGH": {"withFix": 0, "withoutFix": 0}, "MEDIUM": {"withFix": 0, "withoutFix": 0}, "LOW": {"withFix": 0, "withoutFix": 0}, "UNKNOWN": {"withFix": 0, "withoutFix": 0}}'
assert_decision "adopt refused: recomputed verdict fails policy even when every source agrees" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'pair = doc["reports"]["vulnerabilityScan"]
pair["reportLookup"]["normalizedReport"]["findings"] = ['"$FAILING_FINDING"']
pair["reportLookup"]["normalizedReport"]["counts"] = '"$FAILING_COUNTS"'
pair["reportLookup"]["normalizedReport"]["declaredOutcome"] = False
pair["attestationLookup"]["normalizedPredicate"]["findings"] = ['"$FAILING_FINDING"']
pair["attestationLookup"]["normalizedPredicate"]["counts"] = '"$FAILING_COUNTS"'
pair["attestationLookup"]["normalizedPredicate"]["declaredOutcome"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): report and attestation disagree on the recomputed outcome -- section 5's whole
# point, two independent sources compared, not merged.
assert_decision "adopt refused: report and attestation recompute to different outcomes" \
  "$(damaged_evidence_set 'pair = doc["reports"]["vulnerabilityScan"]
pair["reportLookup"]["normalizedReport"]["findings"] = ['"$FAILING_FINDING"']
pair["reportLookup"]["normalizedReport"]["counts"] = '"$FAILING_COUNTS"'
pair["reportLookup"]["normalizedReport"]["declaredOutcome"] = False' "$present_mono_es")" \
  CONFLICT '[]' false false
```

*(The second case above is intentionally incomplete as written — the plan author flags this: it is
missing the wrapping `observation "$absent_release" ...` call the other cases use, and the
implementer must confirm which shape is actually needed by comparing against the neighboring cases
before running it. Do not silently "fix" this by guessing; if the harness errors on this specific
case with a shell syntax problem rather than an assertion mismatch, that confirms the omission —
correct it to match the established `observation "$absent_release" "$absent_release" "$absent_mono"
"$absent_fe" "$skipped" "$skipped" "" "" "$(damaged_evidence_set ...)"` wrapping pattern every other
case in this section uses, then re-verify.)*

```bash
# Fix (3b commit 5): findings out of sort order.
assert_decision "adopt refused: findings not sorted per section 6's tuple" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["findings"] = [
    {"severity": "LOW", "fixAvailable": False, "packageName": "a", "vulnerabilityId": "CVE-1", "targetPath": "/x"},
    {"severity": "HIGH", "fixAvailable": False, "packageName": "b", "vulnerabilityId": "CVE-2", "targetPath": "/y"}
]
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["counts"]["LOW"]["withoutFix"] = 1
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["counts"]["HIGH"]["withoutFix"] = 1
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["policy"]["severityThreshold"] = "LOW"' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): exact-duplicate finding tuple -- counts can no longer be trusted.
assert_decision "adopt refused: duplicate finding tuple" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'dup = {"severity": "HIGH", "fixAvailable": False, "packageName": "a", "vulnerabilityId": "CVE-1", "targetPath": "/x"}
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["findings"] = [dup, dict(dup)]
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["counts"]["HIGH"]["withoutFix"] = 2
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["policy"]["severityThreshold"] = "HIGH"' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): untruncated findings list whose length disagrees with what counts implies.
assert_decision "adopt refused: findings not truncated but miscounted" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["counts"]["HIGH"]["withoutFix"] = 5
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["policy"]["severityThreshold"] = "HIGH"
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["findings"] = []
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["truncated"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): the mandatory 101st-finding witness. 100 LOW findings visible (truncated:true),
# counts implying an unlisted HIGH+fix finding -- the verdict must still fail, proving it is computed
# from counts, not from the (capped, truncated) visible list. Verified empirically in scratch.
assert_decision "adopt refused: 101st finding (HIGH, fix available) still fails the verdict" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'low_findings = [{"severity": "LOW", "fixAvailable": False, "packageName": f"pkg{i:03d}", "vulnerabilityId": f"CVE-2026-{i:04d}", "targetPath": "/x"} for i in range(100)]
content = doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]
content["policy"]["severityThreshold"] = "LOW"
content["findings"] = low_findings
content["counts"] = {"CRITICAL": {"withFix": 0, "withoutFix": 0}, "HIGH": {"withFix": 1, "withoutFix": 0}, "MEDIUM": {"withFix": 0, "withoutFix": 0}, "LOW": {"withFix": 0, "withoutFix": 100}, "UNKNOWN": {"withFix": 0, "withoutFix": 0}}
content["truncated"] = True
content["declaredOutcome"] = False
pred = doc["reports"]["vulnerabilityScan"]["attestationLookup"]["normalizedPredicate"]
pred["policy"]["severityThreshold"] = "LOW"
pred["findings"] = low_findings
pred["counts"] = content["counts"]
pred["truncated"] = True
pred["declaredOutcome"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): vulnerability verdict policy, CRITICAL-only case (no fix needed to fail).
assert_decision "adopt refused: vulnerability scan fails on CRITICAL with no fix" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'f = {"severity": "CRITICAL", "fixAvailable": False, "packageName": "a", "vulnerabilityId": "CVE-1", "targetPath": "/x"}
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["findings"] = [f]
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["counts"]["CRITICAL"]["withoutFix"] = 1
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["policy"]["severityThreshold"] = "LOW"
doc["reports"]["vulnerabilityScan"]["reportLookup"]["normalizedReport"]["declaredOutcome"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false

# Fix (3b commit 5): secret-scan verdict policy -- any single finding fails, unlike vulnerability's
# severity-gated rule.
assert_decision "adopt refused: layer secret scan fails on any finding" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'f = {"severity": "LOW", "fixAvailable": False, "packageName": "a", "vulnerabilityId": "SECRET-1", "targetPath": "/x"}
doc["reports"]["layerSecretScan"]["reportLookup"]["normalizedReport"]["findings"] = [f]
doc["reports"]["layerSecretScan"]["reportLookup"]["normalizedReport"]["counts"]["LOW"]["withoutFix"] = 1
doc["reports"]["layerSecretScan"]["reportLookup"]["normalizedReport"]["policy"]["severityThreshold"] = "LOW"
doc["reports"]["layerSecretScan"]["reportLookup"]["normalizedReport"]["declaredOutcome"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false
```

- [ ] **Step 2: Fix the incomplete second case from Step 1, then run the full suite**

Correct the "report and attestation recompute to different outcomes" case to use the same
`observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped"
"" "" "$(damaged_evidence_set ...)"` wrapping every other case in this section uses (see Step 1's
note). Then run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -20`

Expected: every new case reports `ok`. Do not force a case's expected `state`/`actions`/`retryable`
values to match a guess -- if any case's actual output differs from what's shown above, update the
assertion to the real, verified output and note the discrepancy in your report (mirroring how 3b
commit 4's Task 4 handled the same situation). Report the final `passed=N failed=0` line exactly.

- [ ] **Step 3: Commit**

```bash
git add .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): make the scan verdict something the decision recomputes (4/5)

Nine new witness cases: a self-consistent failing scan is CONFLICT on
its own (recomputedOutcome=False is an independent trigger, not merely
a disagreement check); report vs. attestation disagreement; unsorted
findings; a duplicate finding tuple; an untruncated-but-miscounted
list; the mandatory 101st-finding truncation-safety witness; both
verdict-policy rules (vulnerability CRITICAL-only, secret scan any
finding). passed=<fill in from Step 2>."
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

In `.github/scripts/publish-decision.mutations.py`'s `MUTATIONS` dict, following the file's own
`old-string, new-string` tuple convention (read existing entries for exact style before writing new
ones — this project's own commit history has repeatedly corrected the mutation-runner invocation and
naming convention; match what's actually there, not what an earlier commit's plan said), add rules
that disable, one at a time:

- the sort-order check in `scan_content_problems` (target the `if [finding_tuple(f) for f in
  ordered] != ...` condition)
- the duplicate-detection loop (target the `if tup in seen:` condition)
- the untruncated-miscounted check (target the `if len(findings) != expected_visible:` condition)
- the `declaredOutcome` vs. `recomputed` mismatch check
- the independent `recomputed is False` check (Decision-critical: this is the fix found during
  scratch verification -- make sure a mutation actually targets this exact line, not the mismatch
  check above it, since they are adjacent and easy to conflate)
- the two-way report-vs-attestation comparison in `evidence_set_problems()` (target the
  `if (report_outcome is not None and attestation_outcome is not None and report_outcome !=
  attestation_outcome):` condition)
- the third-source comparison in `marker_problems()` (target the `if entry.get("passed") is not
  marker_recomputed:` condition)

Name these seven mutations following the file's existing naming convention.

- [ ] **Step 2: Run the targeted mutation check for just these seven rules**

Consult the mutation runner's own header/usage comment for how to run a subset (do not run the full
sweep while iterating -- it takes 20+ minutes, per this series' established discipline).

Expected: all seven `caught`.

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

Expected: `publish-decision.test.sh` at Task 4's new baseline (209 + however many of the 9 new cases
survived Step 2's verification), `contract-agreement.test.sh` at `passed=32 failed=0` (unchanged),
every other suite unchanged.

- [ ] **Step 4: Full mutation sweep**

Run the complete `publish-decision.mutations.py` sweep.

Expected: every mutation caught, zero survivors. Report the actual total count in the commit message
and ledger entry -- do not guess it in advance.

- [ ] **Step 5: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings.

- [ ] **Step 6: Update the ledger**

Append to `.superpowers/sdd/progress.md`:

```markdown
## 3b commit 5: make the scan verdict something the decision recomputes

normalizedReport/normalizedPredicate get real shape for the three scan report kinds -- SBOM does not
share this contract (spec section 4), so a parallel pair type (scanReportAttestationPair etc.) was
used instead of retyping the shared presentReport/presentAttestation, leaving SBOM's own copies
exactly as commit 4 left them (still commit 6's job). normalizedScanContent splits counts (a
complete, always-untruncated aggregate -- the verdict's only input) from findings (a bounded,
possibly-truncated audit list) -- this split is load-bearing, not cosmetic: section 6's own claim
that a truncated list cannot change the verdict only holds if the verdict never reads the list.

The decision now recomputes each scan kind's verdict from counts and compares it against three
independent sources: the report's own declaredOutcome, the attestation's own declaredOutcome, and
the marker's content.evidence.<kind>.<image>.passed claim -- closing the exact self-assertion gap
section 6 exists for (verified empirically: a marker claiming passed:true while honestly-reported
evidence recomputes to false is now caught by name). recomputedOutcome=False is independently a
CONFLICT trigger (section 10's matrix), not merely a disagreement check -- found missing in the
first pass of scratch verification, before any code was written down in the plan: a
self-consistent-fail observation (every source honestly agrees) must still block.

Two real design corrections surfaced during scratch verification, before the plan was written: (1)
normalizedScanContent could not be wired directly into the shared presentReport/presentAttestation
without wrongly forcing SBOM into a shape it doesn't have; (2) counts had to be a field the collector
reports separately from findings, not derived by iterating a possibly-truncated list.

Migration: up to 17 static fixtures (one migration script) plus publish-decision.test.sh's
present_evidence_set() builder. No fixture's proven rule changed.

Final: publish-decision.test.sh <fill in from Task 4>/0, contract-agreement.test.sh 32/0 (unchanged).
Mutation sweep: [fill in actual count]/[count] caught, zero survivors.

Known local-environment artifact, not fixed (documented in the plan's Global Constraints and this
commit's design doc): large observations can hit `Argument list too long` from MSYS/git-bash on
Windows dev machines, invoking publish-decision.sh directly -- does not affect GitHub Actions'
ubuntu runners (ARG_MAX is far higher there). No script change proposed; piping via stdin was tried
and does not work (stdin already carries the embedded Python program via heredoc).

Known, deliberate gaps carried forward: commit 3's predicate schemas remain unwired into
normalizedPredicate (no spec text assigns this to any commit). SBOM's own normalizedReport/
normalizedPredicate shape, documentValidated, and the reverse-binding rule are commit 6's job (spec
section 4). predicate.reportDigest cross-check and full attestation-selection-tuple enforcement are
commit 7's job (spec section 8).

Next: 3b commit 6, "stop trusting a SBOM for a verdict it doesn't make" (spec section 4) --
documentValidated, SBOM's own real normalizedReport/normalizedPredicate shape, and the
reverse-direction binding this section's own header names.
```

- [ ] **Step 7: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py .superpowers/sdd/progress.md
git commit -m "contract(ci): make the scan verdict something the decision recomputes (5/5)

Seven new mutation rules for the recompute logic -- all caught. Full
local suite sweep clean at or above every prior baseline. shellcheck
clean over both script directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then
`gh run watch <id> --exit-status`), and separately confirm CI actually exercised the changed suites:

```bash
gh run view <run-id> --log 2>/dev/null | grep -iE "publish-decision\.test|contract-agreement\.test|passed="
```

If CI fails for a reason unrelated to this commit's own changes (e.g. the pre-existing frontend
`npm audit` finding seen on prior commits in this series), report it but do not treat it as this
task's failure -- the lint/contract portion passing with this commit's own counts is what completes
this task.

---

## Self-Review

**Spec coverage** — spec §6 line by line against Tasks 1-4:
- `normalizedReport`/`normalizedPredicate` real shape (`scanner`, `target`, `policy`, `findings`,
  `declaredOutcome`) → Task 1's `normalizedScanContent`, correctly scoped to the three scan kinds
  only (SBOM excluded per §4).
- Counts aggregated by `(severity, fixAvailable)`, not merely severity → Task 1's `scanCounts`/
  `severityCount`.
- `fixAvailable` from Trivy's `FixedVersion`, not inferred from text → Task 1's `finding`
  description (schema can only require the boolean, not its derivation — documented, not enforced,
  matching every other collector-trusted boolean in this contract).
- Counts computed post-ignore-list, ignore file's digest exposed → Task 1's `scanPolicy`.
- Mandatory 101st-finding witness → Task 4's dedicated case, empirically verified in scratch.
- Explicit sort tuple → Task 2's `finding_sort_key`, witnessed by Task 4's unsorted-findings case.
- Exact-duplicate-tuple ⇒ CONFLICT → Task 2's dedup check, witnessed by Task 4's duplicate case.
- `recomputedOutcome` vs. `declaredOutcome` (both sources) vs. marker's claim, any disagreement ⇒
  CONFLICT → Task 2's two comparison sites, witnessed by Task 4's disagreement and lying-marker
  cases.
- Verdict computed from counts, truncation cannot change the result → Task 1's `counts`/`findings`
  split (Decision-critical correction from scratch verification), witnessed by Task 4's 101st-finding
  case.
- Untruncated list disagreeing with counts ⇒ CONFLICT → Task 2's miscounted check, witnessed by
  Task 4's dedicated case.
- Two verdict-policy rules (vulnerability CRITICAL/HIGH+fix, secret scan any finding) → Task 2's
  `recomputed_outcome`, witnessed by Task 4's two policy-rule cases.
- Policy/ruleset must come from a Git-tracked file, digest exposed, workflow input must not override
  → Task 1's `scanPolicy.ignoreFileDigest` (the schema states the field exists; that a collector
  actually reads it from a tracked file rather than a workflow input is a collector-side guarantee
  this schema assumes, same class of trust as `layersValid` — no collector exists yet to violate it).
- Not in scope, correctly excluded: §4 (SBOM's own contract, commit 6), §8 (attestation-selection
  tuple including `predicate.reportDigest`, commit 7), §7 byte caps (still no scanner script).

**Placeholder scan** — no "TBD"/"TODO"/"handle appropriately." Task 4's second witness case is
deliberately left incomplete with an explicit note directing the implementer to correct it against
the established pattern before running — flagged as a real, acknowledged gap in this plan (matching
this series' own precedent of flagging known incompleteness rather than guessing), not a silent
placeholder. Task 5's ledger entry has two intentional `[fill in ...]` spots, filled from real
command output during Task 5 itself, same discipline as commit 4's plan.

**Type consistency** — `SCAN_REPORT_KINDS` defined once (Task 2 Step 1), consumed identically by
`evidence_set_problems()` (Task 2 Step 2) and `marker_problems()` (Task 2 Step 3). `recomputed_
outcome(kind, counts)` has one signature, called from both sites with the same argument shapes.
`scan_content_problems`'s return shape `(problems: list[str], recomputed: bool|None)` matches how
Task 2 Step 2 unpacks it. The migration script (Task 3 Step 2) and `present_evidence_set()`'s
`scan_content` (Task 3 Step 4) produce byte-for-byte the same clean-baseline shape, so a fixture
migrated by one and a case built by the other are directly comparable.
