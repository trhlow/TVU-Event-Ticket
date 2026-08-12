# 3b commit 3 — "freeze what the scanners are and what they scan" — implementation decisions

> This is an addendum to `2026-07-30-evidence-verification-contract-design.md` §7, which is the
> authoritative requirements source and is not restated here. This document only resolves the
> implementation-level questions §7 leaves open, so a plan can be written against a single answer
> rather than each task re-deriving one. Section numbers below reference the master spec.

## Scope of this commit

- Create three new standalone predicate schemas at
  `.github/contracts/predicates/{vulnerabilityScan,layerSecretScan,filesystemSecretScan}.schema.json`.
  These validate the raw in-toto attestation *predicate* a scanner produces — not any part of
  `observation.schema.json`, and not `$ref`'d from it. `observation.schema.json`'s
  `reportLookup`/`attestationLookup` stay the loosely-typed 3-branch placeholder commit 2 left them
  as; giving them a real trust boundary (§5) is commit 4's job, not this one.
- Record the extraction method (crane export vs. crane blob, whiteout applied vs. skipped) and the
  eight-row byte-cap table as normative `description` text on the new schemas — documented
  contract, not enforced code. No scanner script exists yet to enforce them; that's the collector
  (spec §12, scheduled after every 3a/3b commit lands).
- Explicitly **not** in this commit: any change to `publish-decision.sh`, `observation.schema.json`,
  or `release-evidence-set.schema.json`; any real scanning/extraction code; wiring these schemas
  into anything that runs them against a live attestation.

## Decision 1: three separate schema files, not one with a discriminated union

§7's table draws the line at exactly one axis per schema: `vulnerabilityScan` carries vulnerability
DB identity + digest/updatedAt and **never** ruleset/config fields; `layerSecretScan` and
`filesystemSecretScan` carry ruleset/config version + digest and **never** vulnerability DB fields.
A single schema with an `if predicateType == ... then ...` conditional would let a bug in the
conditional silently admit a vuln-DB field into a secret-scan predicate — exactly the kind of
self-assertion loophole commit 2 closed for markers. Three independent schemas make the exclusion
structural (`additionalProperties: false` on each, no shared object to leak through), matching
`release-evidence-set.schema.json`'s own precedent of one `$def` per shape rather than one
polymorphic shape.

## Decision 2: `layerSecretScan` and `filesystemSecretScan` are two schemas, not one parameterized by extraction method

Both scan the same subject (`subject = image digest`, per spec — no rename needed) and share every
required field (scanner name+version, ruleset/config version+digest, `findings`, timestamp). They
differ only in *what already happened before the scanner ran* (per-layer extraction with whiteouts
skipped vs. flattened rootfs with whiteouts applied) — a fact about the pipeline, not about the
predicate's own shape. Two schemas were chosen anyway, over one shared `$def` plus a `scanKind`
enum, because §7 treats them as two named predicate types the collector selects attestations by
(spec §8's selection tuple includes `predicate type`) — collapsing them into one schema would make
that tuple's predicate-type axis unable to distinguish a layer scan from a filesystem scan when
picking which attestation answers which question.

## Decision 3: `findings` reuses `observation.schema.json`'s existing shape and cap, not a new one

`observation.schema.json` already has no `findings` array (that's `evidenceLookup`'s state, not the
predicate's) — this is new. The predicate's `findings` cap (100 entries + `truncated: true`) and
ordering rule (schema-defined, not scanner-decided, so canonicalization is stable per §9) are
written directly into these three schemas, since the target of the cap is the predicate itself, not
an observation. `severity` and `fixAvailable` are the two fields §6 says a future verdict recompute
(commit 5) will aggregate by; both are required on every finding now so commit 5 has something to
aggregate without a schema change of its own.

## Decision 4: byte caps and extraction method are `description` prose, not schema keywords

JSON Schema has no keyword for "the tool that produced this had a 2 GiB per-layer cap" — that's a
fact about a pipeline step that ran *before* this document existed, not a shape constraint on the
document itself. Per commit 1's `cleanupDebt` precedent and commit 2's re-resolve-before-write
precedent: stated as a precondition in the schema's own `description`, not faked as an enforced
`maxLength` or similar that would imply a check nothing currently performs. `findings: 100 items +
truncated` is the one row of the table that *is* independently a shape rule (`maxItems` cannot
express "100 then set a flag", so this is `items` count checked by the harness's own fixture, same
class of gap as `layersValid` in commit 2 — a collector-side guarantee this schema assumes).

## Files touched

- `.github/contracts/predicates/vulnerabilityScan.schema.json` — new.
- `.github/contracts/predicates/layerSecretScan.schema.json` — new.
- `.github/contracts/predicates/filesystemSecretScan.schema.json` — new.
- `.github/contracts/predicates-fixtures/valid/*.json` — new, one clean fixture per schema.
- `.github/contracts/predicates-fixtures/invalid/*.json` — new, one fixture per broken rule (a
  vuln-DB field on a secret-scan predicate, a ruleset field on a vulnerability predicate, missing
  scanner version, `findings` over 100 without `truncated`, etc.).
- `.github/contracts/predicates-fixtures/expectations.json` — new, `{filename: "accepts"|"rejects"}`
  only, same shape as commit 1's `evidence-set-fixtures/expectations.json`.
- `.github/scripts/predicates-schema.test.sh` — new harness, modeled on
  `evidence-set-schema.test.sh`.
- `.github/workflows/ci.yml` — one new line in the existing "Check the contract and the decision
  still agree" step.
- `.superpowers/sdd/progress.md` — ledger entry.
- **Not touched:** `observation.schema.json`, `release-evidence-set.schema.json`,
  `publish-decision.sh`, `publish-decision.mutations.py` — none of these consume these schemas yet.

## Test coverage from spec §11 / §7

No spec §11 witness numbers reference §7 directly (§11's witness list is `observation.schema.json`
/ `decide()`-scoped). This commit's own correctness is exercised entirely by the new
`predicates-fixtures/` corpus: one accept per schema, one reject per exclusion rule in §7's table,
one reject for the `findings` cap. Nothing here is wired into `publish-decision.test.sh` or
`contract-agreement.test.sh` — those corpora are unaffected by this commit, matching commit 1's own
precedent that a new standalone schema's fixtures live in their own directory and test file.
