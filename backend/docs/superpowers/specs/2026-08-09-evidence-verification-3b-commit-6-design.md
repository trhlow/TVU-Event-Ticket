# 3b commit 6 — "stop asking a SBOM for a verdict it does not make" — implementation decisions

> Addendum to `2026-07-30-evidence-verification-contract-design.md` §4, which is the authoritative
> requirements source and is not restated here. This document only resolves the implementation-level
> questions §4 leaves open. Section numbers reference the master spec.

## Scope of this commit

- Replace `content.evidence.sbom.<image>.passed` with `documentValidated` in `markerContent` — SPDX
  is an *inventory* predicate, it makes no verdict, and asking it for one is the confusion §4 exists
  to end.
- Give SBOM's own `normalizedReport`/`normalizedPredicate` real shape (`sbomDocumentContent`),
  distinct from commit 5's `normalizedScanContent`: no `policy`, no `findings`, no `counts`, no
  `declaredOutcome`; instead `spdxVersion`, `documentValidated`, `subjectDigest`, `packageCount`.
- Wire the reverse-direction binding §4 names: for SBOM the *signed predicate* is canonicalized and
  its digest compared against the SBOM layer's descriptor, rather than reading a `reportDigest` the
  predicate does not carry.
- Explicitly **not** in this commit: `predicate.reportDigest` binding for the three scan kinds (they
  carry it directly — that direction is commit 7's, per §8's selection tuple), byte caps (§7, no
  collector exists).

## Decision 1: `evidenceEntry` splits into two `$defs`, not one with a conditional

`markerContent.evidence.{sbom,vulnerabilityScan,layerSecretScan,filesystemSecretScan}` all currently
`$ref` `perImageEvidence` → `evidenceEntry`, whose `required` includes `passed`. §4's table is an
explicit two-column split: SBOM has no outcome field at all, the three scans do. A single
`evidenceEntry` with `if kind == sbom then documentValidated else passed` cannot even be expressed —
`evidenceEntry` does not know which kind it was referenced under. Two `$defs` (`sbomEvidenceEntry`
with `documentValidated`, `scanEvidenceEntry` with `passed`) plus two per-image wrappers
(`sbomPerImageEvidence`, `scanPerImageEvidence`) make the exclusion structural: a SBOM entry carrying
`passed`, or a scan entry carrying `documentValidated`, is rejected by `additionalProperties: false`
rather than by a conditional that could be wrong. Same reasoning commit 3 used for three separate
predicate schema files and commit 5 used for the scan-only pair type — this contract has chosen
structural exclusion over conditionals every time the question has come up.

## Decision 2: `documentValidated` is one boolean carrying §4's three-part invariant

§4 names three things a SBOM must satisfy: it validates against SPDX 2.3, its subject is the image
being released, and it is not empty. `documentValidated` is the collector's single computed answer
to "did all three hold" — the same collector-trusted-boolean pattern as `layersValid` (commit 2) and
`schemaValid` (commit 4). The two facts the decision *can* independently check are not folded into
it: `subjectDigest` is compared against the image it is filed under (the decision already does this
for every evidence entry), and `packageCount` must be `>= 1` (the "not empty" half, checkable here
because it is a number in the document rather than a property of bytes the decision never sees).
So `documentValidated: false` means "SPDX validation failed" specifically; emptiness and subject
mismatch get their own messages rather than hiding inside one opaque boolean.

## Decision 3: the reverse binding is a decision-side comparison of two fields already present

§4's five-step sequence is a *collector* procedure (verify attestation → take signed predicate →
canonicalize → digest → compare against the SBOM layer descriptor). The decision cannot perform
steps 1-4; it has no bytes and no canonicalizer input. What it can do — and what this commit
implements — is check step 5's *result*: `sbomDocumentContent` carries `canonicalDigest` and
`canonicalSize` (the collector's step-4 output), and `presentReport.descriptor` already carries the
SBOM layer's `digest`/`size`. The decision compares those two pairs and reports CONFLICT on
disagreement. That the collector actually canonicalized rather than copying the descriptor's own
digest into the field is the same class of trust every collector-computed field in this contract
carries, and is recorded as such rather than pretended otherwise.

The three scan kinds' opposite direction (`predicate.reportDigest` read directly) is **not** added
here: §8 makes `reportDigest` part of the attestation-*selection* tuple, and commit 7 owns that
tuple. Splitting it across two commits would leave commit 6 checking a field commit 7 then has to
re-check from a different angle.

## Decision 4: fixture migration is a payload-shape break, and every marker-bearing fixture pays it

`content.evidence.sbom.<image>.passed` → `documentValidated` invalidates every fixture carrying
marker content, exactly as commits 2, 4 and 5 each invalidated the corpus in their turn. One
migration script handles it (rename the key under `evidence.sbom.*` only, leave the three scan kinds'
`passed` untouched), plus the `marker()` builder in `publish-decision.test.sh`. Because marker
content is hashed into the envelope layer digest, **the migration must also recompute each affected
fixture's envelope `digest`/`size`** — commit 5's scratch verification already showed that editing
marker content without recomputing produces "envelope layer names X but the content hashes to Y".
The migration script therefore reuses `canonical.py`'s own `canonical_bytes` (the same import
`publish-decision.sh` uses) rather than re-deriving the hash, so the fixture corpus and the decision
agree by construction.

## Files touched

- `.github/contracts/observation.schema.json` — `evidence`'s `sbom` property re-pointed to
  `sbomPerImageEvidence`; new `$defs`: `sbomPerImageEvidence`, `sbomEvidenceEntry`,
  `scanPerImageEvidence`, `scanEvidenceEntry`, `sbomDocumentContent`, `sbomReportAttestationPair`
  and its lookup/present pair (mirroring commit 5's scan-only split, now for SBOM);
  `perImageEvidence`/`evidenceEntry` removed once nothing references them.
- `.github/scripts/publish-decision.sh` — `marker_problems()`'s evidence loop split by kind
  (`documentValidated` + `packageCount >= 1` for SBOM, existing `passed` + commit 5's recompute
  comparison for the three scans); `evidence_set_problems()` gains the SBOM canonical-digest/size
  binding check.
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration (including
  envelope digest/size recomputation) + new witness fixtures.
- `.github/scripts/publish-decision.mutations.py` — new mutation rules.
- **Not touched:** `.github/contracts/predicates/*.schema.json` (commit 3's, still unwired),
  `release-evidence-set.schema.json` (frozen commit 1), the scan kinds' `reportDigest` binding
  (commit 7).

## Test coverage from §4 / §10

§10 rows owned by this commit: "SBOM `documentValidated: false`, subject không phải image đang
release, hoặc rỗng ⇒ CONFLICT", and the SBOM half of "rehash lệch descriptor... hoặc SBOM lệch layer
descriptor ⇒ CONFLICT". Witnessed by: `documentValidated: false`; a SBOM entry whose `subjectDigest`
names the other image; `packageCount: 0`; `canonicalDigest` disagreeing with the SBOM layer
descriptor; `canonicalSize` disagreeing; a SBOM evidence entry carrying `passed` (structurally
rejected); a scan evidence entry carrying `documentValidated` (structurally rejected).
