# 3b commit 2 — "let the decision see the evidence set" — implementation decisions

> This is an addendum to `2026-07-30-evidence-verification-contract-design.md` §3, which is the
> authoritative requirements source and is not restated here. This document only resolves the
> implementation-level questions §3 leaves open, so a plan can be written against a single answer
> rather than each task re-deriving one. Section numbers below reference the master spec.

## Scope of this commit

- Grow `lookups` in `observation.schema.json` from 8 required keys to 10: `monolithEvidenceSet`,
  `frontendEvidenceSet`.
- Add `evidenceSetLookup` (`present | absent(404) | error`, same 3-branch shape as `objectLookup`),
  with a new `presentEvidenceSet` `$def` proving what §3 requires: carrier facts (subject matches
  the image, layers form the correct four kinds, no duplicates), provenance facts (this commit,
  this workflow, this subject), and four `{reportLookup, attestationLookup}` pairs.
- Wire `publish-decision.sh`'s `decide()` to use these two lookups in the "no marker yet" path:
  adopt vs. build-new vs. CONFLICT, per §3's table.
- Explicitly **not** in this commit: the re-resolve-before-write mechanism (no writer exists yet
  to enforce it against), the full report/attestation trust-boundary split (§5, commit 4), verdict
  recomputation (§6, commit 5).

## Decision 1: re-resolve-before-write is documented debt, not enforced code

`decide()` is a pure function over one observation snapshot. There is no publish job yet that
writes markers — building one is explicitly out of scope until 3b's schema freezes (spec header).
"Re-resolve the tag immediately before writing" is a two-phase requirement on a *writer*, not
something a single-snapshot pure function can satisfy by itself.

This commit states the requirement as a precondition the future publish job must satisfy — same
pattern as commit 1's lifecycle/`cleanupDebt` debt (a header comment, not a schema keyword or a
`decide()` branch). Spec §11 witness #9 ("tag evidence-set bị trỏ sang digest khác giữa verify và
promote ⇒ CONFLICT") therefore has **no fixture in this commit** — it cannot be witnessed by
anything that doesn't yet exist. Recorded explicitly as a gap for the publish job's own commit,
not silently dropped.

## Decision 2: the four report/attestation pairs are loosely typed now

`presentEvidenceSet.reports.{sbom,vulnerabilityScan,layerSecretScan,filesystemSecretScan}` each
carry `{reportLookup, attestationLookup}`, both typed as the same 3-branch `present | absent | error`
shape as `objectLookup` — no richer trust-boundary distinction between what a report lookup proves
and what an attestation lookup proves. §5 (two independent lookups with two different unions, a
real trust-boundary split) is commit 4's job. This mirrors commit 1's own precedent: `layers` and
`subject` were `{"type": "array"}`/`{"type": "object"}` in Task 1, tightened without being
rewritten in Tasks 2-3. Required now (all four pairs must exist) so "adopt requires every kind's
attestation present" (§11 witness #8) is checkable; not yet rich enough to say what commit 4 will
eventually require of each lookup's own shape.

## Decision 3: adopt stays inside `ABSENT`, expressed as richer per-image actions

When no marker exists yet, today's `decide()` returns `{"state": "ABSENT", "actions": ["build_new"]}`
unconditionally. This commit changes `actions` to be per-image and evidence-set-aware, without
introducing a new top-level `state`:

- both evidence-sets `absent` → unchanged: `["build_new"]` (today's behavior, byte-for-byte, so
  every existing ABSENT fixture keeps passing without modification)
- an evidence-set `present` and clean (provenance/subject/structure valid, all four attestation
  pairs present) → `adopt_<image>_evidence_set` for that image instead of implying it needs a
  fresh scan
- an evidence-set `absent` for one image only → `build_new_<image>_evidence_set` for that image
- an evidence-set `present` but *not* clean (bad provenance, wrong subject, malformed structure,
  or missing any of the four attestations) → the whole decision is `CONFLICT`, not a per-image
  partial success. §3: "tag tồn tại nhưng khác ⇒ CONFLICT"; §11 witness #8: missing one kind's
  attestation is CONFLICT, and the pipeline **does not** sign supplementally to paper over it.
- either evidence-set `error` → folds into the existing `UNKNOWN`-on-any-lookup-error path at the
  top of `decide()`; no special-casing needed, that gate already runs before this logic.

`ABSENT` was chosen over a new state name because nothing has been *published* in any of these
cases — the distinction is about what work remains, which `actions` already exists to carry.

## New function: `evidence_set_problems(lookup, obs, where)`

Mirrors `marker_problems()`'s shape: given a `present`-status evidence-set lookup and the
observation's `expected` block, returns a list of problem strings (empty = clean). Checks:
`subjectMatches`/`layersValid`/`attestationVerified` are `true`; `signerRepository`,
`signerWorkflow`, `sourceRevision` match `obs["expected"]`; `subjectDigest` matches the image's own
digest; all four `reports.*.reportLookup` and `reports.*.attestationLookup` are `present`.

## Files touched

- `.github/contracts/observation.schema.json` — lookups grow to 10, `evidenceSetLookup` +
  `presentEvidenceSet` `$def`s added.
- `.github/scripts/publish-decision.sh` — `REQUIRED_LOOKUPS`, `LOOKUP_REPOSITORY` (+2 each),
  `evidence_set_problems()` (new), `decide()`'s `not prepared_present` branch rewritten.
- `.github/contracts/fixtures/` + `expectations.json` — extends `contract-agreement.test.sh`'s
  existing corpus (this is an *observation* fixture change, not a carrier-schema change, so it
  does **not** go in `evidence-set-fixtures/`, which is `release-evidence-set.schema.json`'s own
  corpus from commit 1).
- `.github/scripts/publish-decision.mutations.py` — new mutation rules for the two lookups and
  `evidence_set_problems()`. Per commit 1's lesson: do not run the full mutation sweep while
  iterating (20+ minutes), only once before merge.
- **Not touched:** `release-evidence-set.schema.json` (frozen by commit 1), the collector, the
  publish job — none of these exist yet.

## Test coverage from spec §11

Witnesses directly exercised by this commit: #4 (lookup error doesn't leak into marker-read
errors — already covered by existing error-handling, extended to the two new lookups), #5 (adopt
when evidence-set present + marker absent + provenance matches), #8 (adopt blocked, CONFLICT, no
supplemental signing, when one kind's attestation is missing). Witness #9 (tag re-resolve) has no
fixture in this commit per Decision 1 — explicitly a gap, not an oversight.
