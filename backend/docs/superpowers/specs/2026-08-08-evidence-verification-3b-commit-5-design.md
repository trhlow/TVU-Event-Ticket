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

## Decision 1: `normalizedPredicate` reuses `normalizedReport`'s shape, as a second independent copy

§6 describes one table of fields (`scanner`, `target`, `policy`, `findings`, `declaredOutcome`) and
says the decision compares `recomputedOutcome` against **both** `normalizedReport.declaredOutcome`
and `normalizedPredicate.declaredOutcome` as independent sources, plus the marker's own claim. That
only makes sense if both normalized documents share the same shape — an attestation "vouches for" a
report by attesting to matching content, so the predicate's own normalized view has to carry the
same fields to be comparable at all. A new shared `$def` (`normalizedScanContent`, referenced by
both `presentReport.normalizedReport` and `presentAttestation.normalizedPredicate`) avoids
restating the shape twice and, more importantly, makes "these two must independently say the same
thing" a structural fact instead of an accident of two schemas that happen to match today.

This is a distinct document from commit 3's three standalone predicate schemas
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

## Decision 3: sort/dedup/verdict-policy logic lives in `evidence_set_problems()`, not a new function

`evidence_set_problems()` already iterates the four kinds and already has `obs`/`expected` in scope.
Recomputation adds, per kind, inside the existing loop: sort `findings` by the five-tuple (ordering
is a decision-side computation, not a schema keyword — §6 says JSON Schema cannot express a sort),
detect a full-tuple duplicate (⇒ problem, "trùng ngữ nghĩa" logic from §8 does not apply here; this
is exact-duplicate-within-one-report, not cross-attestation semantic duplication), aggregate counts
by `(severity, fixAvailable)` post-ignore-list, and apply the two verdict-policy rules named in §6:
vulnerability fails on any `CRITICAL` or any `HIGH` with `fixAvailable: true`; both secret-scan kinds
fail on any finding at all. The result (`recomputedOutcome`) is compared against
`normalizedReport.declaredOutcome`, `normalizedPredicate.declaredOutcome`, and
`content.evidence.<kind>.<image>.passed` (already in `markerContent`, unchanged since before this
series) — any pairwise disagreement is a problem, folded into the same CONFLICT path
`evidence_set_problems()`'s other checks already produce. A `findings` list that is not `truncated`
but whose length or aggregated counts disagree with what `declaredOutcome` implies is also a
problem, per §6's own "danh sách không truncated mà không khớp counts ⇒ CONFLICT."

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

- `.github/contracts/observation.schema.json` — `presentReport.normalizedReport` and
  `presentAttestation.normalizedPredicate` retyped from `{"type":"object"}` to `#/$defs/
  normalizedScanContent`; new `$defs`: `normalizedScanContent`, `finding`, `scanPolicy`.
- `.github/scripts/publish-decision.sh` — `evidence_set_problems()` extended with recompute logic;
  new helper(s) for sort/dedup/aggregate (exact function boundary left to the plan, not fixed here).
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration for any
  fixture currently relying on the loosely-typed placeholder (commit 4's migration already gave every
  fixture a concrete, if minimal, `normalizedReport: {}`/`normalizedPredicate: {}` — those become
  schema-invalid once the `$def` is real, same "widened field invalidates every existing document"
  situation commit 2's Task 3 and commit 4's Task 3 both already handled) — plus new witness
  fixtures for the recompute logic itself, including the 101st-finding witness.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules for the recompute logic.
- **Not touched:** `.github/contracts/predicates/*.schema.json` (commit 3's schemas, still unwired,
  per Decision 1), the SBOM-specific `documentValidated` field (commit 6), attestation-selection
  tuple enforcement (commit 7).

## Test coverage from spec §6 / §10

§10's matrix rows directly assigned to this commit: "`recomputedOutcome` fail, hoặc lệch
`declaredOutcome`, hoặc lệch marker ⇒ CONFLICT" and "`findings` không truncated mà không khớp counts
⇒ CONFLICT." Witnessed by: a case where `recomputedOutcome` computes to fail even though
`declaredOutcome` claims pass (policy says fail, report lies); a case where `normalizedReport` and
`normalizedPredicate` each declare a different outcome; a case where the marker's `passed` disagrees
with both; the 101st-finding witness (Decision 4); a duplicate-finding-tuple case; an
untruncated-but-miscounted case; one case per verdict-policy rule (vuln fails on `CRITICAL`-only and
separately on `HIGH`+fix, secret scan fails on a single finding of any severity).
