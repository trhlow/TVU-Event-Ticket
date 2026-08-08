# 3b commit 7 — "select an attestation by its whole tuple" — implementation decisions

> Addendum to `2026-07-30-evidence-verification-contract-design.md` §8, which is the authoritative
> requirements source and is not restated here. Section numbers reference the master spec.

## Scope of this commit

- Tighten `attestationAbsent.queried` (loosely typed since commit 4) into §8's full selection tuple,
  including `reportDigest` for the three scan kinds and its deliberate absence for SBOM.
- Add `paginationComplete` semantics to the *present* branch too: a `presentAttestation` selected
  before pagination finished is a match nobody proved was the only match.
- Add the semantic-duplicate rule: multiple trustworthy statements matching the tuple are **not**
  automatically CONFLICT; they are CONFLICT only when they differ on §8's named projection.
- Explicitly **not** in this commit: the pagination mechanism itself (collector's job, does not
  exist), byte caps (§7).

## Decision 1: the tuple is a `$def` shared by the queried-key and the duplicate projection

§8 names two closely related field lists: the *selection* tuple (repository, workflow, source
revision, image subject, predicate type, and — for the three scan kinds — report digest) and the
*semantic-duplicate* projection (subject digest, source revision, signer repository, signer workflow,
predicate type, report digest, policy incl. ignore-file digest, outcome). They overlap but are not
equal: the projection adds policy and outcome, which are not selection criteria. Two `$defs`
therefore, not one reused: `attestationSelectionTuple` (what was searched for, lives in
`attestationAbsent.queried`) and `attestationStatementProjection` (what two trustworthy statements
must agree on, lives in `presentAttestation.duplicates[]`). Writing one and reusing it for both
would silently make policy a selection criterion, which would change which attestation gets picked.

## Decision 2: `reportDigest` present for scans, forbidden for SBOM — structurally, per kind

§4 already established SPDX carries no `reportDigest`, and §8's own text calls the previous
"require report digest for every kind" rule self-contradictory. Since commits 5 and 6 have already
split the pair types per kind (`scanReportAttestationPair`, `sbomReportAttestationPair`), the tuple
splits the same way: `scanAttestationSelectionTuple` requires `reportDigest`,
`sbomAttestationSelectionTuple` forbids it via `additionalProperties: false` with no such property.
No conditional, consistent with every prior kind-split in this contract.

## Decision 3: `duplicates` is a list on the present branch, empty when there is exactly one match

Modelling "several trustworthy statements matched" as an array on `presentAttestation`
(`duplicates: [attestationStatementProjection, ...]`, `minItems: 0`) rather than a separate lookup
status keeps the common case unchanged (empty array) and makes the rule checkable without a new
union branch: the decision compares every entry's projection against the selected statement's own,
and any difference in a projected field is CONFLICT. Fields §8 explicitly excludes from the
projection — run ID, run attempt, timestamp, bundle signature bytes, cert serial — are simply not in
`attestationStatementProjection`, so they cannot cause a false CONFLICT by construction rather than
by a decision-side filter someone could later widen.

## Decision 4: `paginationComplete` moves onto the present branch as well

Commit 4 put `paginationComplete: true` on `attestationAbsent` only, because "not found" is the
answer pagination changes. §8's duplicate rule makes it matter on the present branch too: "I found
one" is a different claim from "I found one and there were no others", and only the second supports
the semantic-duplicate check. `presentAttestation`/`scanPresentAttestation` therefore gain a required
`paginationComplete` boolean, and the decision reports CONFLICT when it is not `true` — a selection
made from a partial page is a selection nobody proved was correct.

## Files touched

- `.github/contracts/observation.schema.json` — `attestationAbsent.queried` retyped;
  new `$defs`: `scanAttestationSelectionTuple`, `sbomAttestationSelectionTuple`,
  `attestationStatementProjection`; `paginationComplete` + `duplicates` added to the present
  attestation shapes (all three of them: generic, scan, SBOM).
- `.github/scripts/publish-decision.sh` — tuple-agreement check (does the selected statement match
  what was queried), `paginationComplete` check, semantic-duplicate comparison.
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — migration + witnesses.
- `.github/scripts/publish-decision.mutations.py` — new rules.

## Test coverage from §8 / §10

§10 rows owned here: "attestationLookup: absent (paginationComplete: true, không khớp tuple) ⇒
CONFLICT" and "nhiều statement đáng tin khác nội dung/outcome ⇒ CONFLICT". Witnesses: a queried tuple
missing `reportDigest` on a scan kind; a SBOM tuple carrying `reportDigest`; `paginationComplete:
false` on a present attestation; two duplicates agreeing on every projected field (must PASS — this
is the idempotency case §8 exists to protect, and it is the one most likely to be broken by an
over-strict implementation); two duplicates differing on `outcome`; two differing on
`policy.ignoreFileDigest`; two differing only on run ID / timestamp (must PASS).
