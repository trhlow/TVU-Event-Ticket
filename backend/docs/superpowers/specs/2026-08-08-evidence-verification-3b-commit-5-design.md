# 3b commit 5 — "make the scan verdict something the decision recomputes" — implementation decisions

> This is an addendum to `2026-07-30-evidence-verification-contract-design.md` §6, which is the
> authoritative requirements source and is not restated here. This document only resolves the
> implementation-level questions §6 leaves open, so a plan can be written against a single answer
> rather than each task re-deriving one. Section numbers below reference the master spec.

## Scope of this commit

- Give `presentReport.normalizedReport` and `presentAttestation.normalizedPredicate` (both
  `{"type":"object"}` placeholders since commit 4) real shape per §6's table.
- Extend `evidence_set_problems()` to recompute `recomputedOutcome` from `findings` + `policy` for
  each of the four report kinds, using §6's exact sort/dedup tuple and the two verdict-policy rules,
  and compare it against the three independent sources §6 names.
- Wire `findings` ordering to the existing 3a canonicalizer (§9) rather than trusting scanner order.
- Explicitly **not** in this commit: SBOM's `documentValidated`/reverse binding (§4, commit 6),
  `predicate.reportDigest` cross-check and full attestation-selection tuple (§8, commit 7), byte-cap
  enforcement at fetch time (§7, still no scanner/collector script exists).

## Decision 1: `normalizedPredicate` reuses `normalizedReport`'s shape, as a second independent copy — and both are wired ONLY for the three scan kinds, via a parallel pair type

§6 describes one table of fields (`scanner`, `target`, `policy`, `findings`, `declaredOutcome`) and
says the decision compares `recomputedOutcome` against **both** `normalizedReport.declaredOutcome`
and `normalizedPredicate.declaredOutcome` as independent sources, plus the marker's own claim. That
only makes sense if both normalized documents share the same shape — an attestation "vouches for" a
report by attesting to matching content, so the predicate's own normalized view has to carry the
same fields to be comparable at all. A new shared `$def` (`normalizedScanContent`) avoids restating
the shape twice and, more importantly, makes "these two must independently say the same thing" a
structural fact instead of an accident of two schemas that happen to match today.

**Correction found during scratch verification, before the plan was written:** `presentReport` and
`presentAttestation` are shared by all four report kinds (`reportAttestationPair` is `$ref`'d
identically for `sbom`, `vulnerabilityScan`, `layerSecretScan`, `filesystemSecretScan`). §4 states
explicitly that SBOM does not share the scan contract ("SBOM khong dung chung contract voi scan"),
and SBOM's own real shape is commit 6's job. Retyping `presentReport.normalizedReport` directly to
`normalizedScanContent` would therefore have forced SBOM's report into a shape it does not have, six
months before that shape is even decided. The fix: `presentReport`/`presentAttestation` stay exactly
as commit 4 left them (generic `{"type":"object"}` placeholder, still correct for SBOM), and a
**parallel pair type** — `scanReportAttestationPair`, `scanReportEvidenceLookup`,
`scanPresentReport`, `scanAttestationEvidenceLookup`, `scanPresentAttestation` — duplicates the same
five structural fields but types `normalizedReport`/`normalizedPredicate` as `normalizedScanContent`.
`presentEvidenceSet.reports`'s three scan-kind properties point at the new pair type;
`reports.sbom` stays on the original. The duplication mirrors this schema's own established
precedent that `additionalProperties: false` objects are not safely composable via `allOf` (every
`*Lookup` union already duplicates `absent`/`error` rather than composing them) — five duplicated
`$defs` is the cost of a real, spec-stated contract split, the same trade commit 3 made by writing
three separate predicate schema files instead of one polymorphic one.

This `normalizedScanContent` document is distinct from commit 3's three standalone predicate schemas
(`vulnerabilityScan.schema.json` etc.), which validate what a scanner tool's raw attestation
predicate must contain *before* the collector normalizes it — the same relationship
`presentEvidenceSet` already has to `release-evidence-set.schema.json` (this schema trusts a
collector-computed outcome rather than re-deriving it from the raw document). Commit 3's schemas
stay unwired for the same reason commits 3 and 4 both left them unwired: no spec text assigns that
wiring to any commit, and wiring them here would conflate "what the raw predicate must contain" with
"what the decision compares," two different concerns this contract has kept separate throughout.

## Decision 2: `finding` gets the five fields §6's own sort tuple names, `additionalProperties: false`

§6's sort tuple is explicit: severity rank descending → `fixAvailable` (true first) → package name →
vulnerability ID → target path. A finding schema that omitted any of these couldn't be sorted by the
rule the spec states, so all five are required: `severity`, `fixAvailable`, `packageName`,
`vulnerabilityId`, `targetPath`. `fixAvailable` is a boolean the collector computed from Trivy's own
`FixedVersion` being non-empty (§6: "không suy từ text" — not inferred from text) — the schema
cannot enforce *how* it was computed, only that it exists as a boolean, same class of trust as
`layersValid` in commit 2. Capped at 100 items via the same `maxItems` + `if`/`then` `truncated:true`
pattern commit 3's predicate schemas already established (`findings` shape reused deliberately, not
reinvented) — this is the same list this contract has capped before, just now living in
`normalizedReport`/`normalizedPredicate` instead of a raw predicate.

## Decision 3: `counts` is a separate, always-complete field from `findings` — and the verdict reads only `counts`

**Correction found during scratch verification:** an initial design put every finding into one flat
`findings` array and derived the verdict by iterating it. That contradicts §6's own text: "Verdict
tính từ **counts**, nên một danh sách bị truncate không đổi được kết quả" (verdict computed from
counts, so a truncated list cannot change the result) only holds if `counts` is a field the collector
reports independently of the (possibly truncated) visible list — otherwise a truncated `findings`
array silently truncates the verdict's own input too. `normalizedScanContent` therefore carries two
separate fields: `counts` (a complete `{severity: {withFix, withoutFix}}` aggregate over every
finding post-ignore-list, always untruncated, new `$def`s `scanCounts`/`severityCount`) and
`findings` (the existing capped, at/above-threshold, possibly-truncated list, for audit and
duplicate-detection — not the verdict's input). `recomputedOutcome` is computed from `counts` alone.

`evidence_set_problems()` already iterates the four kinds and already has `obs`/`expected` in scope,
but SBOM must not run scan-content checks (Decision 1), so this logic is gated on
`kind in SCAN_REPORT_KINDS`. Per scan kind, for each of `normalizedReport`/`normalizedPredicate`
independently (a new helper, `scan_content_problems(kind, content, where)`, returns
`(problems, recomputed_outcome_or_None)`):

- sort `findings` by the five-tuple and flag if not already sorted (ordering is a decision-side
  computation, not a schema keyword — §6 says JSON Schema cannot express a sort);
- detect a full-tuple duplicate within the visible list (⇒ problem — this is exact-duplicate-within-
  one-report, not §8's cross-attestation "semantic duplicate," a different rule for a different
  situation);
- recompute `recomputedOutcome` from `counts` via the two verdict-policy rules;
- if `truncated` is `False`, cross-check that `len(findings)` equals what `counts` implies for
  severities at or above `policy.severityThreshold` (§6's "danh sách không truncated mà không khớp
  counts ⇒ CONFLICT");
- flag if `declaredOutcome` disagrees with `recomputedOutcome`;
- **flag if `recomputedOutcome` is `False`, unconditionally** — found missing in the first pass of
  scratch verification: §10's matrix lists "`recomputedOutcome` fail" as its own CONFLICT trigger,
  independent of whether every source agrees. A self-consistent "report, attestation, and marker all
  honestly agree the scan failed" observation must still block, not merely be internally consistent.

The caller then compares the two `recomputed_outcome` values it got back (report's vs. predicate's)
— disagreement is a third problem, distinct from either individually failing. The **third** source
(`content.evidence.<kind>.<image>.passed`, in `markerContent`) is compared separately, inside
`marker_problems()`'s existing per-kind/per-image loop where that field is already in scope: it
re-derives the report's own `recomputedOutcome` from `obs["lookups"][f"{image}EvidenceSet"]` and
flags a mismatch against the marker's claim. This is deliberately where the closed loophole actually
lives — verified empirically in scratch: a marker claiming `passed: true` while the evidence-set's
real, honestly-reported evidence recomputes to `False` is caught with the message "...passed is
True, but the evidence-set's own report recomputes to False," where before this commit a marker's
`passed` claim was accepted at face value (only checked for being literally `True`, never checked
against anything independent).

## Decision 4: the mandatory 101st-finding witness is a fixture, not a schema rule

§6 states this as a required witness, not a shape constraint: "finding thứ 101 là `HIGH` có fix,
verdict vẫn phải fail" — proving the verdict is computed from **counts**, not from the (capped,
possibly truncated) visible list. `findings` itself is capped at 100 by the schema (Decision 2), so
this witness cannot literally submit 101 raw findings through the schema-validated array — instead
the fixture submits 100 findings (the cap) with `truncated: true`, and separate `policy`/count
fields already carry what a 101-item aggregate would have produced (the aggregation the decision
recomputes has to be built from `findings` + the cap discipline, not from a document that itself
exceeds the cap). Concretely: the plan's witness fixture supplies exactly 100 findings including at
least one `HIGH`+`fixAvailable:true` entry, `truncated: true`, and confirms `recomputedOutcome` still
fails — the schema-level cap and the spec's "101st" framing describe the same guarantee from two
angles (the cap exists precisely so a real 101-item list must set `truncated`, and the decision must
still fail correctly under truncation).

## Files touched

- `.github/contracts/observation.schema.json` — `presentReport`/`presentAttestation` unchanged (stay
  generic, still correct for SBOM); new `$defs`: `scanReportAttestationPair`,
  `scanReportEvidenceLookup`, `scanPresentReport`, `scanAttestationEvidenceLookup`,
  `scanPresentAttestation`, `normalizedScanContent`, `scanCounts`, `severityCount`, `scanPolicy`,
  `finding`; `presentEvidenceSet.reports`'s three scan-kind properties re-`$ref`'d to
  `scanReportAttestationPair` (`sbom` stays on `reportAttestationPair`).
- `.github/scripts/publish-decision.sh` — new module-level `SCAN_REPORT_KINDS`, `SEVERITY_RANK`;
  new functions `finding_sort_key`, `finding_tuple`, `recomputed_outcome`, `scan_content_problems`;
  `evidence_set_problems()`'s reports loop extended (gated on `kind in SCAN_REPORT_KINDS`) to call
  `scan_content_problems()` on both halves and compare their two recomputed outcomes;
  `marker_problems()`'s existing per-kind/per-image loop extended with the third-source comparison
  against `content.evidence.<kind>.<image>.passed`.
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration for every
  fixture whose scan-kind `normalizedReport`/`normalizedPredicate` was the loosely-typed `{}`
  placeholder (commit 4 left `sbom`'s copies as `{}` too, but those are untouched by this commit's
  schema change and need no migration) — plus new witness fixtures for the recompute logic,
  including the 101st-finding witness and the lying-marker case (marker claims `passed: true` while
  honestly-reported evidence recomputes to `False`), both empirically verified in scratch before
  this plan was written.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules for the recompute logic.
- **Not touched:** `.github/contracts/predicates/*.schema.json` (commit 3's schemas, still unwired,
  per Decision 1), the SBOM-specific `documentValidated` field (commit 6), attestation-selection
  tuple enforcement (commit 7).

## Known local-environment artifact (not a defect, not fixed in this commit)

Verifying this commit's larger observations (six `normalizedScanContent` copies per evidence-set)
against the real `publish-decision.sh` locally on Windows hit `Argument list too long` from MSYS/
git-bash once a fixture's serialized JSON passed roughly 20-25 KB — `publish-decision.sh` passes the
whole observation as a single command-line argument to the embedded Python interpreter (line ~45),
and MSYS's `exec` emulation has a much lower ceiling than either native Windows `CreateProcess` or
Linux's `ARG_MAX` (~2 MB on GitHub Actions ubuntu runners). Piping the observation via stdin instead
was tried and is **not** a viable fix: stdin is already consumed by the heredoc carrying the Python
program itself, so the two cannot share one stream. Confirmed local-only: extracting the embedded
Python and invoking it directly with the observation passed by file path (bypassing the argv-length
ceiling entirely) reproduces correct behavior for every case tested. No script change is needed or
proposed; this is recorded so a future session hitting the same "Argument list too long" on Windows
doesn't mistake it for a regression.

## Test coverage from spec §6 / §10

§10's matrix rows directly assigned to this commit: "`recomputedOutcome` fail, hoặc lệch
`declaredOutcome`, hoặc lệch marker ⇒ CONFLICT" and "`findings` không truncated mà không khớp counts
⇒ CONFLICT." Witnessed by: a case where `recomputedOutcome` computes to fail even though
`declaredOutcome` claims pass (policy says fail, report lies); a case where `normalizedReport` and
`normalizedPredicate` each declare a different outcome; a case where the marker's `passed` disagrees
with both; the 101st-finding witness (Decision 4); a duplicate-finding-tuple case; an
untruncated-but-miscounted case; one case per verdict-policy rule (vuln fails on `CRITICAL`-only and
separately on `HIGH`+fix, secret scan fails on a single finding of any severity).
