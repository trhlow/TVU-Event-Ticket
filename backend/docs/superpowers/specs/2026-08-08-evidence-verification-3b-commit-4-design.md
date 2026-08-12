# 3b commit 4 — "give each evidence two lookups of its own" — implementation decisions

> This is an addendum to `2026-07-30-evidence-verification-contract-design.md` §5, which is the
> authoritative requirements source and is not restated here. This document only resolves the
> implementation-level questions §5 leaves open, so a plan can be written against a single answer
> rather than each task re-deriving one. Section numbers below reference the master spec.

## Scope of this commit

- Replace `reportAttestationPair`'s shared `objectLookup` typing (commit 2's loosely-typed
  placeholder) with two independent unions: `reportEvidenceLookup` and `attestationEvidenceLookup`,
  each with its own `present` shape and its own `absent` shape, per §5's trust-boundary table.
- Extend `decide()`'s top-level error scan to reach the 16 nested report/attestation lookups
  (2 evidence-sets × 4 kinds × 2 lookups), by explicit path enumeration, gated on each evidence-set's
  own lookup being `present` first — §5's second positional constraint.
- Migrate every existing fixture that sets a `reportLookup`/`attestationLookup` to the old generic
  `presentObject`/`absent` shape onto the new ones.
- Explicitly **not** in this commit: real shape for `normalizedReport`/`normalizedPredicate` (§6,
  commit 5); wiring commit 3's predicate schemas into `normalizedPredicate` (no spec text assigns
  this to any specific commit; adding it now is scope beyond what §5 asks for); full tuple-based
  attestation selection/pagination (§8, commit 7) — `attestationAbsent`'s query-tuple field is
  loosely typed for the same reason commit 2 left the four report/attestation pairs loosely typed:
  richness lands when the commit that actually needs it arrives.

## Decision 1: `reportEvidenceLookup` keeps the existing `absent` $def; `attestationEvidenceLookup` needs a new one

§5's own table draws the line here: a report lookup's "not there" is an OCI registry 404 — exactly
what `$defs/absent` (`{status, observedCode: 404, queriedRef}`) already means, unchanged since it
was written for tags and digest objects. An attestation lookup's "not there" is a **200 with an
empty list after full pagination** — asserting `observedCode: 404` for that would be asserting an
HTTP status nobody received, i.e. an observation the collector never made, the exact failure mode
commit 2's evidence-set-absent fixture already warns against for a different lookup kind. A new
`attestationAbsent` $def carries `reason: "no_matching_attestation"`, `paginationComplete: true` (the
boolean that turns "gave up partway" into "concluded, and concluded no"), and a `queried` object
holding the tuple the collector searched with: `repository`, `workflow`, `sourceRevision`,
`subjectDigest`, `predicateType`. This tuple is loosely typed (`required` but not yet validated
against §8's full five/six-element tuple, and no `reportDigest` member yet for the three scan kinds)
because enforcing the complete tuple is commit 7's job; today it only has to prove pagination
happened and record what was searched for, which is all §5 asks for.

## Decision 2: `presentReport` and `presentAttestation` field sets, taken directly from §5's table

`presentReport`: `descriptor {mediaType, digest, size}` (what was fetched), `digestVerified`,
`sizeVerified` (booleans — outcomes the collector computed, not reasserted claims, same discipline as
`layersValid` in commit 2), `schemaValid` (boolean — a report that parses as JSON but fails its own
shape is a producer defect, decided elsewhere; this field only says whether the check ran and what it
found), `normalizedReport` (loosely typed `{"type": "object"}` — richer in commit 5).

`presentAttestation`: `subjectDigest`, `predicateType`, `signerRepository`, `signerWorkflow`,
`sourceRevision`, `attestationVerified` (all five identity/outcome fields plus the boolean, same
names and semantics as the existing top-level `verification` $def, reused rather than renamed so a
reader who already knows `verification`'s shape from markers and evidence-set carriers recognizes
this immediately), `normalizedPredicate` (loosely typed, richer in commit 5). **Not** included:
`policyPassed` — that field describes a marker's or evidence-set's own attestation (a statement about
*this specific carrier*), whereas an attestation over a report is a statement about *that report's
provenance*; whether the report's findings pass policy is computed by the decision itself in commit 5
(§6: "Decision tái lập verdict"), not asserted by the collector at attestation-lookup time. Carrying
a `policyPassed` field here that nothing computes yet would be exactly the kind of untestable
placeholder keyword commit 1's own header warns against.

## Decision 3: the retryable-scan extension enumerates paths, gated on presence, not recursive

§5's second positional constraint is explicit: list the paths, don't recurse on every object with a
`status` key (a recursive walk would also match `presentMarker.ociEnvelope`-shaped objects, `content`
sub-objects, or any future object that happens to have a `status` field for an unrelated reason, and
treat their values as lookup statuses they are not). The extension:

```python
NESTED_EVIDENCE_LOOKUP_PATHS = [
    (image, kind, half)
    for image in IMAGES
    for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")
    for half in ("reportLookup", "attestationLookup")
]
```

For each `(image, kind, half)`, if `lookups[f"{image}EvidenceSet"]["status"] == "present"`, look up
`lookups[f"{image}EvidenceSet"]["reports"][kind][half]` and include it in the same `failures` scan
that already walks the 10 top-level lookups, keyed by a synthetic name (e.g.
`f"{image}EvidenceSet.reports.{kind}.{half}"`) so an error message names exactly which of the 16 it
was. Gating on the evidence-set's own `status == "present"` matters because an `absent`/`error`
top-level evidence-set lookup has no `reports` key at all (per commit 2's `evidenceSetLookup` union —
only `presentEvidenceSet` has `reports`); scanning unconditionally would `KeyError` on every
observation where an evidence-set was never found, which is the common case before any evidence-set
exists.

This runs in the same place the existing 10-lookup scan runs (before `marker_problems()` or
`evidence_set_problems()` see anything), so a nested `error` reaches `UNKNOWN`/`retryable` before
`evidence_set_problems()`'s existing `.get("status") != "present"` checks would otherwise fold it
into CONFLICT alongside a genuine `absent`. This is §5's first positional constraint in practice: a
report or attestation lookup that merely *failed to run* must not be indistinguishable from one that
*ran and found nothing* — the first is UNKNOWN (retry), the second is CONFLICT (a person's problem).
`evidence_set_problems()` itself needs no code change for this — by the time it runs, `error` has
already been intercepted upstream, so its existing "not present" checks only ever see `absent` for
these two fields from this point forward.

## Decision 4: fixture migration is mechanical, one pass, same discipline as commit 2's Task 3

Every existing fixture setting `reports.<kind>.reportLookup` or `.attestationLookup` to the old
generic `presentObject` shape (`{status, queriedRef, digest}`) gets migrated to the new shapes in one
pass: `reportLookup` gains `descriptor`, `digestVerified`, `sizeVerified`, `schemaValid`,
`normalizedReport`; `attestationLookup` gains `subjectDigest`, `predicateType`, `signerRepository`,
`signerWorkflow`, `sourceRevision`, `attestationVerified`, `normalizedPredicate` in place of
`digest`. The one existing `attestationLookup`-set-to-`absent` case
(`publish-decision.test.sh:1126`, using the old `observedCode: 404` shape) is migrated to the new
`attestationAbsent` shape. No fixture's *proven rule* changes — this is the same "widened lookups
invalidate every existing document; migrate, don't reinvent" situation commit 2's Task 3 documented,
confirmed by running the corpus against the new schema before writing the plan's exact task steps
(same discipline: real RED/GREEN counts from a scratch run, not derived on paper).

## Files touched

- `.github/contracts/observation.schema.json` — `reportAttestationPair`'s two fields retyped;
  `reportEvidenceLookup`, `attestationEvidenceLookup`, `presentReport`, `presentAttestation`,
  `attestationAbsent` $defs added.
- `.github/scripts/publish-decision.sh` — the top-level error scan in `decide()` extended with the
  16 nested paths; `NESTED_EVIDENCE_LOOKUP_PATHS`-equivalent constant added. `evidence_set_problems()`
  itself unchanged (per Decision 3).
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — every fixture/inline
  observation using the old `reportLookup`/`attestationLookup` shape migrated to the new one.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules for the two new unions'
  guards and for the retryable-scan extension.
- **Not touched:** `.github/contracts/predicates/*.schema.json` (commit 3's schemas — not wired in
  here, per Decision 2), `release-evidence-set.schema.json` (frozen by commit 1), the collector, the
  publish job.

## Test coverage from spec §11 / §5

No spec §11 witness is numbered against §5 directly (§11's list predates the evidence-set work).
This commit's correctness is exercised by: the migrated corpus continuing to pass with its original
proven rule unchanged; new fixtures proving each new guard (`reportEvidenceLookup`'s
`digestVerified`/`sizeVerified`/`schemaValid` false cases, `attestationEvidenceLookup`'s
`attestationVerified` false case, `attestationAbsent`'s shape distinct from generic `absent`); and a
new `decide()`-level fixture proving a nested `error` at one of the 16 paths reaches UNKNOWN with
`retryable` computed correctly (including the "one retryable nested error plus one non-retryable
top-level error ⇒ not retryable" case, mirroring the existing "all errors must be retryable" rule at
`publish-decision.sh:775`).
