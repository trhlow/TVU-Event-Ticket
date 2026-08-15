# 3a commit 6 — "freeze the release manifest payload as a schema" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Not scratch-verified against a live worktree before writing** — same caveat as the immediately
> preceding 3b commits 6/7's own plans. Every checkpoint number is a prediction; confirm the real
> number at each step. This plan WAS written after reading the full master spec
> (`backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md`, all of sections
> 1-10) and the actual current state of `.github/contracts/observation.schema.json`,
> `.github/contracts/release-envelope.schema.json`, `.github/scripts/publish-decision.sh` (the exact
> line numbers cited below), and `.github/scripts/envelope.py` — not guessed from the spec's prose
> alone.

**Goal:** Create `.github/contracts/release-manifest.schema.json` — the strict, producer-side subset
of `markerContent` the publish job will eventually be allowed to write — and make the DECISION (not
just the schema) independently enforce the five predicate-type constants exactly, per spec section
10's own explicit requirement: "Phải đồng thời thêm enforcement predicate exact vào decision, test và
mutations — không có nó, fixture predicate sai không thể ra CONFLICT."

**Architecture:** `release-manifest.schema.json` is `{"allOf": [{"$ref": ".../observation.schema.json#/$defs/markerContent"}, {tighter consts}]}` — every valid manifest is provably a `markerContent`, not merely tested to look like one (spec section 3). The five predicate-URI constants already live in `release-envelope.schema.json#/$defs/constants.predicateTypes` (added in 3a commit 5b, confirmed present in the current file) — this commit adds a FOURTH place they must agree (`release-manifest.schema.json`'s own `const` values), extending the existing three-source drift test (`envelope.py` ↔ `release-envelope.schema.json` ↔ `publish-decision.sh`) to four, per spec section 9's own explicit note ("Commit 6 thêm nguồn thứ tư").

**Plan Decision A — the decision-level predicate-exactness enforcement is added at exactly two of the**
**four existing `predicateType` check sites in `publish-decision.sh`, not all four.** Confirmed by
reading the actual code: `marker_problems()` has two `predicateType` checks — one at line ~369
(`verification.predicateType`, the marker's own SLSA provenance attestation) and one inside the
per-kind evidence loop at line ~575 (`evidence.<kind>.<image>.predicateType`). `evidence_set_problems()`
has a THIRD, structurally identical-looking check at line ~776 (`verification.predicateType`) — but
that one belongs to the evidence-SET's own carrier attestation, whose predicate is
`https://tvu.example/evidence-set` (a 3b-owned constant, confirmed present in the fixture corpus,
**not** one of 3a's five constants in `release-envelope.schema.json#/$defs/constants.predicateTypes`).
That third site stays exactly as-is (non-empty-string only) — tightening it would be inventing a
constant spec section 7's own table does not name. Only the two `marker_problems()` sites tighten.

**Plan Decision B — `release-manifest.schema.json`'s own predicate `const` values are literal strings,**
**not `$ref`s to `release-envelope.schema.json#/$defs/constants.predicateTypes`.** JSON Schema's `$ref`
resolves to a schema (something with `type`/`const`/etc.), and `constants.predicateTypes.sbom` is
already a `{"const": "..."}` schema — a `$ref` to it would work syntactically for THAT one field, but
spec section 3's own worked example shows manifest-tightening as inline `const` values directly in the
`allOf`'s second branch, and section 9's drift test explicitly expects to compare the manifest schema's
own literal string against the other three sources (a `$ref` would make the "fourth source" a
non-independent alias of the first, defeating the point of the drift test — if `constants.predicateTypes.sbom`
silently changed, a `$ref`-based fourth source would "agree" by construction, never catching the drift
the test exists to catch). Literal, independently-typed strings it is — matching this contract's own
established "duplication over composition when `additionalProperties:false` objects would make
composition unsafe or would defeat a drift check" precedent (commit 5/6/7 of 3b all made the same
choice for the same reason).

**Tech Stack:** Same as prior 3a/3b commits — JSON Schema draft 2020-12, Python 3.10+ decision script,
bash test harnesses.

## Global Constraints

- `additionalProperties: false` at every object level. `allOf` composition works correctly here only
  because the second branch TIGHTENS existing keys and adds no new ones (spec section 3's own
  mechanical warning) — do not add any property to the manifest schema that `markerContent` doesn't
  already have.
- Fixtures for this schema go in **`.github/contracts/release-manifest-fixtures/`**, a directory that
  does not exist yet — NOT `.github/contracts/fixtures/`. `contract-agreement.test.sh` globs
  `fixtures/` for every `*.json` and requires an `expectations.json` entry for each one; a manifest
  fixture placed there would redden that suite for two independent reasons (spec section 9's own
  explicit warning).
- Registry network access is forbidden in the test — the `referencing.Registry` retrieve function
  must `raise`, never fall back to fetching `$id` URLs over the network (already established practice
  from 3b commit 5b-ii, carry it forward here for the same registry).
- Do not touch the pagination mechanism, byte caps, the collector, or the publish job — all out of
  scope per spec section 1's own explicit boundary list, and per the three inviolable rules at the
  top of the spec: 3a must never be used to assert evidence is trustworthy (that's 3b's job, already
  done), and the publish job must not be merged/enabled on 3a alone.
- `evidence_set_problems()`'s own `verification.predicateType` check (the evidence-SET carrier's
  predicate, `https://tvu.example/evidence-set`) is explicitly OUT OF SCOPE for tightening — see Plan
  Decision A. Do not touch it.
- Existing fixture corpus already uses the five correct constant URI values throughout (confirmed by
  grep across `.github/contracts/fixtures/` before writing this plan: `verification.predicateType`
  and every `evidence.<kind>.*.predicateType` already match `release-envelope.schema.json`'s own
  constants exactly, no `tvu.id.vn` leftovers). This means the decision-level tightening (Task 2)
  should NOT require migrating existing fixtures' predicate values — but Task 3 must still confirm
  this by running the full corpus after Task 2 lands, not assume it from this plan's own claim.
- **Known environment artifacts on this Windows dev machine** (documented across 3b commits 5-7,
  carried forward): `PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"`,
  `PYTHON_BIN` pointed at a real interpreter with `jsonschema`/`referencing`; `Argument list too long`
  on large observations is a pre-existing local-only artifact — check each FAIL line paired with its
  own next line's text (`publish-decision.test.sh`'s two-line harness format) or the FAIL line itself
  (`contract-agreement.test.sh`/`manifest-agreement.test.sh`'s one-line concatenated format) for the
  substring before treating any failure as real; the mutation runner refuses to run when its own
  baseline is red, use the established local tolerant-wrapper technique for due diligence only — CI's
  unmodified run is authoritative.
- **Mutation-isolation discipline** (found real bugs from this exact failure mode four times across
  3b commits 5, 6, and 7 tonight): a new guard in a shared code path can silently blind an older
  guard's witness, or be itself structurally unwitnessable if a stronger/parallel guard in the same
  call chain always co-fires. Verify every new witness case by removing ONLY its own guard from a
  local, uncommitted copy of `publish-decision.sh` and confirming that specific case alone goes red —
  do not trust a green suite alone.
- Full-corpus jsonschema re-validation (load schema + registry, iterate every fixture, compare
  `errors` non-empty vs. `expectations.json`'s `"schema"` field) must be run independently by whoever
  closes each fixture-touching task — this caught a real regression in 3b commit 6's own Task 3
  (a migration silently un-broke a fixture's deliberately-invalid schema-rejection field) that the
  functional suite's green output alone did not reveal.

---

## File Structure

- `.github/contracts/release-manifest.schema.json` — **create**. `allOf` composition per spec
  section 3: `$ref` to `observation.schema.json#/$defs/markerContent`, plus a second branch tightening
  `evidence.sbom.*.predicateType`/`evidence.<scan>.*.predicateType` to per-kind `const`,
  `evidence.<scan>.*.passed`/`evidence.sbom.*.documentValidated`/`flywayInventory.migrations[].success`
  to `const: true` (per spec section 3's table — these `const:true` tightenings are schema-only, no
  new decision logic needed, since the decision already requires them to be boolean `true` for
  `passed`/`documentValidated`/`success` to avoid CONFLICT; the manifest schema narrowing to `const`
  is the producer-side promise, not a new runtime check).
- `.github/scripts/envelope.py` — **modify**. Add `PREDICATE_TYPES` dict (the fourth source, mirroring
  `release-envelope.schema.json#/$defs/constants.predicateTypes`'s five keys/values exactly).
- `.github/scripts/publish-decision.sh` — **modify**. `marker_problems()`'s two predicateType checks
  (verification-level and per-kind evidence-level) tighten from "non-empty string" to "exact match
  against the right `PREDICATE_TYPES` constant" (Plan Decision A).
- `.github/contracts/release-manifest-fixtures/` — **create** (new directory). Manifest-shaped
  fixtures for spec section 9's two commit-6-owned witnesses (subset is real, subset is strict).
- `.github/scripts/manifest-agreement.test.sh` — **modify**. Extended with the two new subset
  witnesses (already exists, already wired into `ci.yml` from 3a commit 5b — do not create a new
  file or re-wire it, extend the existing one).
- `.github/contracts/fixtures/` + `.github/scripts/publish-decision.test.sh` — **modify**. New witness
  cases proving the two decision-level predicate-exactness guards from Task 2 are load-bearing (a
  marker with a wrong-but-nonempty predicateType must now CONFLICT where it previously wouldn't).
- `.github/scripts/publish-decision.mutations.py` — **modify**. New mutation rules.
- `.superpowers/sdd/progress.md` — ledger entry.

## Interfaces

- Consumes: `#/$defs/markerContent` (existing, in `observation.schema.json`), `envelope.py`'s existing
  `ENVELOPE_CONSTANTS`-adjacent import pattern (`from envelope import (...)` at the top of
  `publish-decision.sh`'s embedded Python).
- Produces: `PREDICATE_TYPES` (a dict: `{"markerProvenance": ..., "sbom": ..., "vulnerabilityScan": ...,
  "layerSecretScan": ..., "filesystemSecretScan": ...}`), consumed by exactly two call sites in
  `marker_problems()` (Plan Decision A).
- `release-manifest.schema.json`'s own predicate `const` values are literal, independently-typed
  strings (Plan Decision B) — not consumed by any Python code; they are checked ONLY by
  `manifest-agreement.test.sh`'s own three-vs-four-source drift comparison (Task 5) and by
  `jsonschema` validation directly (Task 4's subset-strictness witness).

---

### Task 1: Schema — `release-manifest.schema.json` and the fourth constant source

**Files:**
- Create: `.github/contracts/release-manifest.schema.json`
- Modify: `.github/scripts/envelope.py`

**Interfaces:**
- Consumes: `observation.schema.json#/$defs/markerContent` (existing, `$ref`'d, not modified).
- Produces: `release-manifest.schema.json` itself; `envelope.py`'s new `PREDICATE_TYPES` dict.

- [ ] **Step 1: Add `PREDICATE_TYPES` to `envelope.py`**

Read the current file (`.github/scripts/envelope.py`) in full first — it is short (under 60 lines as
of the previous commit). Find the existing constant block (`MANIFEST_MEDIA_TYPE`, `ARTIFACT_TYPE`,
`EMPTY_CONFIG_MEDIA_TYPE`, etc.) and the module's `__all__` list. Add, immediately after the existing
constants:

```python
PREDICATE_TYPES = {
    "markerProvenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
}
```

Add `"PREDICATE_TYPES"` to the module's `__all__` list (find the exact current list and append to it
— do not guess its current contents, read them).

These five string values must be typed EXACTLY as they appear in
`.github/contracts/release-envelope.schema.json#/$defs/constants.predicateTypes` (read that file's
current content directly before typing these — do not copy from this plan's prose, copy from the
real file, in case of any drift between when this plan was written and when Task 1 runs).

- [ ] **Step 2: Create `release-manifest.schema.json`**

Read `.github/contracts/observation.schema.json`'s current `markerContent` `$def` in full first (its
exact structure, after 3b's commits 2-7 changed `evidence`'s shape substantially — do not assume the
shape described in the master spec's own prose, which predates 3b; read the real, current schema).
Also read `.github/contracts/release-envelope.schema.json`'s `$id` value (needed for the `$ref`
target's URL form) and its own file structure for a model of how this project writes multi-file
`$ref`-based schemas.

Write:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/release-manifest.schema.json",
  "description": "3a commit 6 (spec section 3): the payload the publish job will eventually be allowed to write. Every valid document here is provably a markerContent (the allOf's first branch), not merely tested to resemble one -- the second branch only tightens keys markerContent already has, never adds a new one, which is what makes the allOf compose safely under markerContent's own additionalProperties:false.",
  "allOf": [
    { "$ref": "./observation.schema.json#/$defs/markerContent" },
    {
      "type": "object",
      "properties": {
        "evidence": {
          "type": "object",
          "properties": {
            "sbom": {
              "type": "object",
              "properties": {
                "monolith": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://spdx.dev/Document/v2.3" },
                    "documentValidated": { "const": true }
                  }
                },
                "frontend": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://spdx.dev/Document/v2.3" },
                    "documentValidated": { "const": true }
                  }
                }
              }
            },
            "vulnerabilityScan": {
              "type": "object",
              "properties": {
                "monolith": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/vulnerabilityScan/v1" },
                    "passed": { "const": true }
                  }
                },
                "frontend": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/vulnerabilityScan/v1" },
                    "passed": { "const": true }
                  }
                }
              }
            },
            "layerSecretScan": {
              "type": "object",
              "properties": {
                "monolith": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/layerSecretScan/v1" },
                    "passed": { "const": true }
                  }
                },
                "frontend": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/layerSecretScan/v1" },
                    "passed": { "const": true }
                  }
                }
              }
            },
            "filesystemSecretScan": {
              "type": "object",
              "properties": {
                "monolith": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/filesystemSecretScan/v1" },
                    "passed": { "const": true }
                  }
                },
                "frontend": {
                  "type": "object",
                  "properties": {
                    "predicateType": { "const": "https://evts.id.vn/attestations/filesystemSecretScan/v1" },
                    "passed": { "const": true }
                  }
                }
              }
            }
          }
        },
        "flywayInventory": {
          "type": "object",
          "properties": {
            "migrations": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "success": { "const": true }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

**This exact JSON was constructed from the master spec's own table in section 3 (predicateType/passed/
documentValidated/success tightenings) without independently re-reading `markerContent`'s CURRENT
post-3b field paths for `evidence.sbom.monolith`/`evidence.vulnerabilityScan.monolith`/etc.** — Step 2's
own opening instruction says to read the real schema first; if the actual current path to a given
evidence entry differs from what's shown here (for instance if 3b renamed a key this plan doesn't know
about), correct this block to match the real, current `markerContent` shape, not this literal text.
Confirm via Step 3 immediately after.

**`marker provenance` (`verification.predicateType`) is NOT tightened in this schema.** Spec section 3's
own table only lists `evidence.*.predicateType` entries and the three boolean fields — `verification`
lives OUTSIDE `content` (it's the collector's own record, not part of `markerContent`, confirmed by
`markerContent`'s own `required` list containing `commit`/`environment`/.../`evidence`/`flywayInventory`
but not `verification`). The manifest schema only describes the PAYLOAD (`content`), not the collector's
verification record — `verification.predicateType`'s exactness is a decision-level-only guard (Task 2),
with no schema-level manifest counterpart, since `release-manifest.schema.json`'s whole subject is
`markerContent`, which never includes `verification` at all.

- [ ] **Step 3: Confirm the schema is well-formed JSON and resolves against the registry**

Run:
```bash
python -c "import json; json.load(open('.github/contracts/release-manifest.schema.json', encoding='utf-8')); print('ok')"
```
Expected: `ok`.

Then confirm the `$ref` actually resolves (not just that the file parses) by loading it through the
SAME `referencing.Registry` pattern `contract-agreement.test.sh`/`manifest-agreement.test.sh` already
use (read one of those files' own registry-construction code first, reuse the identical pattern — do
not invent a new one). Report the real result; if the `$ref` fails to resolve, fix the `$id`/`$ref`
pair before proceeding, do not guess.

- [ ] **Step 4: Commit**

```bash
git add .github/contracts/release-manifest.schema.json .github/scripts/envelope.py
git commit -m "contract(ci): freeze the release manifest payload as a schema (1/5)

release-manifest.schema.json (spec section 3): every valid manifest is
provably a markerContent via allOf, not merely tested to resemble one.
Second branch only tightens keys markerContent already has (five
predicateType consts, three outcome-boolean consts to true) -- adds no
new key, which is what allows allOf to compose safely under
markerContent's own additionalProperties:false. Fixtures for this
schema will not go in .github/contracts/fixtures/ (a separate
directory is Task 3's job) -- placing them there would redden
contract-agreement.test.sh for two independent reasons per spec
section 9.

envelope.py gains PREDICATE_TYPES, the fourth source (spec section 9:
envelope.py <-> release-envelope.schema.json <-> publish-decision.sh
<-> this new manifest schema) that manifest-agreement.test.sh's own
drift test (Task 5) will extend to cover.

Not run against any suite yet -- this is a new, standalone file with
no existing fixture corpus to break."
```

---

### Task 2: Decision logic — exact predicate-type enforcement

**Files:**
- Modify: `.github/scripts/publish-decision.sh`

**Interfaces:**
- Consumes: `PREDICATE_TYPES` (Task 1).
- Produces: two tightened checks inside `marker_problems()`.

- [ ] **Step 1: Import `PREDICATE_TYPES`**

Find (near the top of the embedded Python, the existing `from envelope import (...)` line):

```python
from envelope import (ARTIFACT_TYPE, EMPTY_CONFIG_DATA, EMPTY_CONFIG_DIGEST,
                      EMPTY_CONFIG_MEDIA_TYPE, EMPTY_CONFIG_SIZE, MANIFEST_MEDIA_TYPE)
```

Replace with:

```python
from envelope import (ARTIFACT_TYPE, EMPTY_CONFIG_DATA, EMPTY_CONFIG_DIGEST,
                      EMPTY_CONFIG_MEDIA_TYPE, EMPTY_CONFIG_SIZE, MANIFEST_MEDIA_TYPE,
                      PREDICATE_TYPES)
```

- [ ] **Step 2: Tighten `marker_problems()`'s `verification.predicateType` check**

Find (inside `marker_problems()`, around line 369 of the current file — confirm by context, this is
the FIRST `predicate = verification.get("predicateType")` block in the file, immediately followed by
the `policyPassed` check):

```python
    predicate = verification.get("predicateType")
    if type(predicate) is not str or not predicate:
        # Which statement was verified, not merely that something was. An attestation of one
        # predicate type says nothing about the claim another predicate type would have made.
        problems.append(f"{where}.verification.predicateType is {predicate!r}, must be a non-empty "
                        f"string naming what was attested")
```

Replace with:

```python
    predicate = verification.get("predicateType")
    if predicate != PREDICATE_TYPES["markerProvenance"]:
        # 3a commit 6 (spec section 7/10): the marker's own provenance attestation must name
        # exactly the one predicate type this contract pins, not merely any non-empty string. A
        # non-empty-but-wrong predicate type used to pass this check silently -- an attestation of
        # SOME statement is not an attestation of THIS one, and section 10 requires the decision
        # itself catch this, not only the manifest schema a producer might not even validate
        # against.
        problems.append(f"{where}.verification.predicateType is {predicate!r}, expected "
                        f"{PREDICATE_TYPES['markerProvenance']!r}")
```

- [ ] **Step 3: Tighten the per-kind `evidence.<kind>.<image>.predicateType` check**

Find (inside `marker_problems()`'s per-kind/per-image evidence loop, the check shared by both the
`sbom` and `scan` branches — confirm by context, it is BEFORE the `if kind == "sbom":`/`elif
entry.get("passed")...` split that 3b commit 6 introduced):

```python
                predicate = entry.get("predicateType")
                if type(predicate) is not str or not predicate:
                    problems.append(f"{where}.content.evidence.{kind}.{image}.predicateType is "
                                    f"{predicate!r}, must name what the document states")
```

Replace with:

```python
                predicate = entry.get("predicateType")
                if predicate != PREDICATE_TYPES[kind]:
                    # 3a commit 6 (spec section 7/10): each evidence kind's predicate type is one
                    # of the five constants this contract pins -- PREDICATE_TYPES is keyed
                    # identically to EVIDENCE_REPORT_KINDS ("sbom", "vulnerabilityScan",
                    # "layerSecretScan", "filesystemSecretScan"), so this reads the one constant
                    # this specific kind is allowed to claim.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.predicateType is "
                                    f"{predicate!r}, expected {PREDICATE_TYPES[kind]!r}")
```

**Confirm `PREDICATE_TYPES`'s keys exactly match `EVIDENCE_REPORT_KINDS`'s four kind strings**
(`"sbom"`, `"vulnerabilityScan"`, `"layerSecretScan"`, `"filesystemSecretScan"`) before this step —
`PREDICATE_TYPES[kind]` will raise `KeyError` at runtime for any kind string that doesn't match one of
`PREDICATE_TYPES`'s five keys exactly (four evidence kinds plus `"markerProvenance"`, which is never
used as a loop `kind` value, only directly at Step 2's call site). Verify this by reading
`EVIDENCE_REPORT_KINDS`'s actual definition (`.github/scripts/publish-decision.sh`, search for
`EVIDENCE_REPORT_KINDS =`) before trusting this plan's own claim that the keys already align.

- [ ] **Step 4: Confirm no `SyntaxError` and no `KeyError` on existing fixtures**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | head -30`

Expected: per this plan's own Global Constraints (the existing corpus already uses the five correct
constant values throughout, confirmed by grep before this plan was written), the suite should stay at
its PRIOR baseline count with zero NEW failures — this task tightens a check that every existing
fixture already satisfies. If you see `FAIL` lines beyond the pre-existing baseline, or a Python
`KeyError`/`Traceback`, that means either the corpus has a predicate value this plan's own
pre-verification missed, or `PREDICATE_TYPES`'s keys don't align with `EVIDENCE_REPORT_KINDS`'s real
values — investigate and report the real cause rather than assuming.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/publish-decision.sh
git commit -m "contract(ci): freeze the release manifest payload as a schema (2/5)

marker_problems() tightens two predicateType checks from 'non-empty
string' to 'exact match against the one constant this contract pins'
(spec section 7/10, PREDICATE_TYPES from envelope.py): the marker's
own provenance attestation (verification.predicateType, against
markerProvenance) and each evidence kind's own predicate
(evidence.<kind>.<image>.predicateType, against PREDICATE_TYPES[kind]).
evidence_set_problems()'s own, structurally similar predicateType
check is deliberately untouched -- it belongs to the evidence-set
carrier's own predicate (https://tvu.example/evidence-set), a 3b-owned
constant outside this commit's five-constant scope.

Existing fixture corpus already uses the five correct values
throughout (confirmed by full-corpus grep before this plan was
written) -- baseline unchanged, no new fixture needed to keep the
suite green at this step; Task 4 adds witnesses proving a WRONG value
now produces CONFLICT where it previously would not have."
```

---

### Task 3: Fixture corpus — the manifest fixture directory and its own migration check

**Files:**
- Create: `.github/contracts/release-manifest-fixtures/` (new directory, populated in Task 4 — this
  task just confirms the corpus is otherwise unaffected).
- No changes expected to `.github/contracts/fixtures/` in this task — Task 2's tightening should not
  require any migration, per this plan's own Global Constraint.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: confirmation that Task 2's tightening genuinely required zero fixture changes, backed by
  a real, independent full-corpus check — not merely trusted from Task 2's own report.

- [ ] **Step 1: Run the full existing suite and confirm zero regressions**

```bash
bash .github/scripts/publish-decision.test.sh 2>&1 | tail -10
bash .github/scripts/contract-agreement.test.sh 2>&1 | tail -10
bash .github/scripts/manifest-agreement.test.sh 2>&1 | tail -10
```

Expected: every suite at its PRIOR baseline (check `.superpowers/sdd/progress.md`'s most recent
entries for the real current numbers before comparing — do not assume this plan's own predictions).
Zero new FAIL lines beyond the pre-existing Windows argv-length artifact (verify per this plan's own
Global Constraint: pair each FAIL line with its own output text).

- [ ] **Step 2: Independently re-validate the existing corpus's predicate values against the new constants**

Run a direct Python check (not through the harness) confirming every `verification.predicateType` and
`evidence.<kind>.*.predicateType` value across the ENTIRE `.github/contracts/fixtures/` corpus already
equals the corresponding `PREDICATE_TYPES` entry — this is the check that would have caught a fixture
this plan's own pre-writing grep missed. Write and run:

```python
import json, pathlib

PREDICATE_TYPES = {
    "markerProvenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
}

fixtures_dir = pathlib.Path(".github/contracts/fixtures")
mismatches = []

def walk_markers(doc, path):
    for marker_key in ("finalMarker", "preparedMarker"):
        marker = doc.get("lookups", {}).get(marker_key)
        if not isinstance(marker, dict) or marker.get("status") != "present":
            continue
        verification = marker.get("verification", {})
        pt = verification.get("predicateType")
        if pt is not None and pt != PREDICATE_TYPES["markerProvenance"]:
            mismatches.append((str(path), f"{marker_key}.verification.predicateType", pt))
        evidence = marker.get("content", {}).get("evidence", {})
        for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):
            per_image = evidence.get(kind)
            if not isinstance(per_image, dict):
                continue
            for image, entry in per_image.items():
                if not isinstance(entry, dict):
                    continue
                pt = entry.get("predicateType")
                if pt is not None and pt != PREDICATE_TYPES[kind]:
                    mismatches.append((str(path), f"{marker_key}.content.evidence.{kind}.{image}.predicateType", pt))

for path in sorted(fixtures_dir.rglob("*.json")):
    if path.name == "expectations.json":
        continue
    doc = json.loads(path.read_text(encoding="utf-8"))
    walk_markers(doc, path)

print(f"mismatches: {len(mismatches)}")
for m in mismatches:
    print(" ", m)
```

Also run the same check against every case built dynamically in `publish-decision.test.sh`'s own
`marker()` builder (read the builder's default predicateType values directly — confirm they already
equal `PREDICATE_TYPES`'s values, since the earlier suite run already proved this indirectly by staying
green, but confirm explicitly here too).

Expected: `mismatches: 0`. If any mismatch is found, this is real, unanticipated fixture debt this
plan's own pre-writing check missed — construct a migration for exactly those fixtures (do not touch
ones that already match), re-run, and note the discrepancy honestly in your report and the commit
message rather than silently absorbing it into Task 4's witness work.

- [ ] **Step 3: Create the (still-empty) manifest fixtures directory**

```bash
mkdir -p .github/contracts/release-manifest-fixtures
```

No files yet — Task 4 populates it. This step exists only so the directory is tracked by git before
Task 4's own commit (an empty directory is not tracked by git; if Task 4 is the first to add a file
there, this step is redundant and may be skipped, noted in the report either way).

- [ ] **Step 4: Commit (only if Step 2 found real mismatches to migrate; otherwise skip straight to Task 4)**

If Step 2 found zero mismatches (the expected outcome), there is nothing to commit for this task —
proceed directly to Task 4 and note in the ledger that Task 3 required no fixture changes, confirmed
by the full-corpus check above. If Step 2 found real mismatches, commit the migration:

```bash
git add .github/contracts/fixtures/
git commit -m "fix(ci): migrate stray predicate-type values found by 3a commit 6's Task 3 check

<describe the real fixtures found and fixed, with actual before/after values -- do not use this
placeholder text verbatim, this plan predicted zero mismatches and did not anticipate needing this
commit; if you are reading this in a real commit message, something this plan's own pre-writing
verification missed was found and fixed.>"
```

---

### Task 4: Witness fixtures — the two manifest-subset proofs and the two decision-level predicate guards

**Files:**
- Create: fixtures under `.github/contracts/release-manifest-fixtures/`.
- Modify: `.github/scripts/manifest-agreement.test.sh` (the two subset witnesses, spec section 9
  items 1-2).
- Modify: `.github/scripts/publish-decision.test.sh` (two new decision-level cases for Task 2's
  tightened guards).

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fixtures proving both the schema subset relationship (spec section 9) and the two new
  decision guards (Task 2) are load-bearing, individually isolation-verified per this plan's Global
  Constraints.

Four things need proving in total, per spec section 9 — items 3 (no constant drift) and 4 (no
schema-gate before decision) are **already witnessed** since 3a commit 5b (confirmed by the spec's own
text: "Điều 3 và 4 kiểm được ngay" and named existing fixtures
`invalid-structure/migration-without-installed-rank.json`,
`invalid-structure/evidence-missing-layer-secret-scan.json`) — this task does NOT need to add anything
for items 3-4, only extend item 3's drift comparison to the fourth source (Task 5's job, not this
task's). Only items 1-2 are new here:

1. **Subset is real** — a valid manifest fixture, embedded into an observation template at
   `lookups.finalMarker.content`, is accepted by `observation.schema.json` (this is guaranteed
   structurally by the `allOf`, per spec section 3 — the test catches a `$ref` resolving to the wrong
   file or a registry missing an entry, not a logic bug).
2. **Subset is strict** — at least one document valid per `markerContent` but rejected by
   `release-manifest.schema.json` — spec section 9's own suggested construction is an invented
   `predicateType` (a non-empty string that is not one of the five constants; `markerContent` accepts
   any non-empty string, `release-manifest.schema.json`'s tightened `const` rejects it).

Plus, this task also needs two decision-level cases proving Task 2's tightened checks are load-bearing
(not explicitly named by spec section 9, which is about the SCHEMA subset relationship, but required
by this plan's own Task 2 to have a witness, same discipline every other guard in this series has had):

3. A marker with a non-empty but WRONG `verification.predicateType` ⇒ CONFLICT (was previously
   accepted, since the old check only required non-empty).
4. A marker with a non-empty but WRONG `evidence.<kind>.<image>.predicateType` for one kind ⇒ CONFLICT.

- [ ] **Step 1: Build the "subset is real" fixture and test**

Read `manifest-agreement.test.sh`'s current structure in full first (it already tests items 3-4, so it
already has an observation-template-building helper and a registry-construction pattern — reuse them,
do not invent new ones). Construct a manifest-shaped document satisfying `release-manifest.schema.json`
in full (every `const`, every required field from `markerContent`), save it as
`.github/contracts/release-manifest-fixtures/valid-manifest.json` (or a more descriptive name — this
plan does not mandate an exact filename, choose one consistent with this project's own naming
conventions, e.g. `.github/contracts/fixtures/valid/*.json`'s style).

Add a case to `manifest-agreement.test.sh`: load this fixture, validate it directly against
`release-manifest.schema.json` (expect zero errors — proves the fixture itself is manifest-valid, a
precondition for the real test), then embed it at `lookups.finalMarker.content` inside a full
observation template and validate THAT against `observation.schema.json` (expect zero errors — proves
the subset relationship holds for this real document, not merely by the `allOf`'s own structural
guarantee, catching a `$ref`/registry wiring bug).

- [ ] **Step 2: Build the "subset is strict" fixture and test**

Take the same base document from Step 1, change exactly one field: `evidence.sbom.monolith.predicateType`
(or any one evidence kind) to an invented, non-empty string, e.g. `"https://example.invalid/not-a-real-predicate"`.
Save as a second fixture. Add a case: validate against `release-manifest.schema.json` (expect at least
one error — the `const` mismatch), AND validate the SAME document (still embedded at
`lookups.finalMarker.content` inside an observation) against `observation.schema.json` (expect zero
errors — `markerContent` only requires non-empty string, this document still satisfies that). Both
must hold simultaneously for this to be a real strictness witness, not an accidentally-invalid
document that fails both schemas.

- [ ] **Step 3: Run `manifest-agreement.test.sh` and confirm both new cases pass**

Run: `bash .github/scripts/manifest-agreement.test.sh 2>&1 | tail -20`

Expected: both new cases `ok`, prior baseline (17/17 per the spec's own current count, confirm the
real current number rather than trusting this plan) unchanged.

- [ ] **Step 4: Add the two decision-level cases to `publish-decision.test.sh`**

This plan does NOT write the exact `assert_decision` bodies — same deliberate omission this series has
used for every witness-fixture task since 3b commit 6, and for the same reason (mutation-isolation
risk: hand-writing a case without verifying it in isolation has produced a real, previously-uncaught
bug in EVERY witness task this series has run so far). Construct case 3 (wrong `verification.predicateType`)
and case 4 (wrong `evidence.<kind>.<image>.predicateType` for one kind), using this file's established
`marker('{"verification":{"predicateType":"..."}}')` / `marker('{"_content":{"evidence":{"<kind>":{"<image>":{"predicateType":"..."}}}}}')`
override patterns (both patterns already exist elsewhere in this file for OTHER fields — search for
`"verification":{"predicateType"` and `"_content":{"evidence"` to find the established construction
style before writing these two). For each: run the real suite, confirm the expected `CONFLICT` verdict,
then make a LOCAL, UNCOMMITTED copy of `publish-decision.sh` with ONLY the specific guard under test
reverted to its pre-Task-2 form (the `type(predicate) is not str or not predicate` check), re-run just
that case, confirm it now gives the WRONG verdict (accepts the bad predicate), then revert the local
copy. Only keep a case whose isolation you've actually confirmed this way.

- [ ] **Step 5: Run the full suite**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -20` and
`bash .github/scripts/manifest-agreement.test.sh 2>&1 | tail -10`.

Expected: every new case `ok`. Report the real `passed=N failed=0` lines.

- [ ] **Step 6: shellcheck**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings versus LF-normalized baseline (this Windows checkout has known
`core.autocrlf=true` CRLF noise — compare against the git-blob version before concluding anything
found is new).

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/release-manifest-fixtures/ .github/scripts/manifest-agreement.test.sh .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): freeze the release manifest payload as a schema (4/5)

Two manifest-subset witnesses (spec section 9 items 1-2, the only two
that needed this commit's own release-manifest.schema.json to exist --
items 3-4 already had witnesses since 3a commit 5b): a manifest-valid
document is also observation-valid (subset is real), and a document
valid per markerContent but carrying an invented predicateType is
rejected by the manifest schema alone (subset is strict). Plus two
decision-level cases proving Task 2's tightened predicateType guards
are load-bearing, individually isolation-verified by local guard
reversion. passed=<fill in from Step 5>."
```

---

### Task 5: Mutation rules, the fourth-source drift extension, full suite sweep, ledger, and push

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`
- Modify: `.github/scripts/manifest-agreement.test.sh` (extend the existing three-source drift
  comparison to four).
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: nothing — this is the commit's own completion.

- [ ] **Step 1: Extend the constant-drift test to the fourth source**

Read `manifest-agreement.test.sh`'s existing drift-comparison code (the part proving spec section 9
item 3 — `envelope.py` ↔ `release-envelope.schema.json` ↔ `publish-decision.sh`, already passing).
Add a fourth comparison: `release-manifest.schema.json`'s own five predicate `const` values (read
directly from the file, at the same JSON paths Task 1 Step 2 wrote them) must equal
`PREDICATE_TYPES`'s five values (from `envelope.py`, already one of the three existing sources). This
closes spec section 9's own explicit note: "Commit 6 thêm nguồn thứ tư."

- [ ] **Step 2: Add mutation rules for the new guards**

Read `.github/scripts/publish-decision.mutations.py`'s existing `MUTATIONS` dict fully first (naming
convention, `old`/`new` tuple style). Add rules disabling, one at a time:

- The `verification.predicateType` exact-match check (Task 2 Step 2).
- The per-kind `evidence.<kind>.<image>.predicateType` exact-match check (Task 2 Step 3).

- [ ] **Step 3: Targeted check of just these two new rules**

Same ad hoc-module-import technique established across 3b commits 5-7 (no built-in subset flag on the
real runner). Expected: both caught. If either survives, check first whether it is the same class of
guard-vs-guard collision found repeatedly this series before assuming the mutation itself is wrong.

- [ ] **Step 4: Full local suite sweep**

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
recent entries for the real current baselines).

- [ ] **Step 5: Full mutation sweep — do NOT wait hours for it locally**

Given how long the equivalent sweep took across 3b commits 5-7 on this machine (up to ~3 hours), do
NOT block on a local full sweep. Push after Steps 1-4 and the targeted check (Step 3) pass, and let
CI's own unmodified, much-faster run be authoritative — the established precedent this whole series
has followed since 3b commit 7. If time permits a local run anyway, use the established tolerant-
wrapper technique and expect it to report the same 2 already-accepted 3b-commit-5 survivors
(`scan_report_attestation_disagreement_ignored`, `marker_scan_recompute_ignored`) plus every new rule
from this commit caught — any OTHER survivor needs investigation before pushing.

- [ ] **Step 6: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings versus baseline.

- [ ] **Step 7: Update the ledger**

Append a `## 3a commit 6: freeze the release manifest payload as a schema` section to
`.superpowers/sdd/progress.md`, following this series' established structure: what changed, the two
Plan Decisions (A: which two of four predicateType sites tighten; B: literal consts not `$ref`s),
whether Task 3 found any real fixture mismatches (expected: none), final suite/mutation counts, and
the note that **THIS CLOSES THE ENTIRE 3a EPIC** (commits 0-6 all done) alongside the already-complete
3b epic — both halves of the release gate spec section 1 describes are now done.

- [ ] **Step 8: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py .github/scripts/manifest-agreement.test.sh .superpowers/sdd/progress.md
git commit -m "contract(ci): freeze the release manifest payload as a schema (5/5)

Two new mutation rules for the tightened predicateType guards -- both
caught in targeted verification. manifest-agreement.test.sh's own
constant-drift test extended to the fourth source (spec section 9:
release-manifest.schema.json's own predicate consts must agree with
envelope.py/release-envelope.schema.json/publish-decision.sh). Full
local suite sweep clean at or above every prior baseline. shellcheck
clean."
git push origin ci/ghcr-publish
```

Read the CI run (`gh run list --branch ci/ghcr-publish --limit 1`, then `gh run view --json jobs`,
then pull the `lint` job's log for `SURVIVED`/`caught` lines and `passed=` lines) as the real,
authoritative verification. Compare the survivor list against the 2 already-accepted ones from 3b
commit 5 — any other survivor is real and must be fixed, the same discipline applied throughout this
series (which found and fixed a real regression this exact way in 3b commits 6 AND 7, both only
visible on CI after a local wrapper's own limitations masked them).

This closes 3a commit 6, and with it, the entire 3a epic. Report the final, CI-confirmed state before
considering this commit — and this whole phase of the release-gate spec — done.

---

## Self-Review

**Spec coverage** — spec §§1,3,7,9,10 line by line against Tasks 1-5:
- `release-manifest.schema.json` as `allOf` subset, tightening only existing keys → Task 1.
- Fixtures in a NEW directory, not `fixtures/` → Task 1 (dir mention), Task 3 (dir creation), Task 4
  (population) — explicitly called out as a Global Constraint given §9's own explicit warning about
  this exact mistake.
- "Phải đồng thời thêm enforcement predicate exact vào decision, test và mutations" → Task 2 (decision),
  Task 4 (test/witness), Task 5 (mutations) — the plan's own central finding (this requirement is easy
  to miss reading only the schema-and-fixtures half of commit 6's description).
- Four things to prove (§9), items 1-2 new here, items 3-4 already witnessed since 5b → Task 4
  correctly scoped to only items 1-2 plus two decision-level guard witnesses of its own; item 3's own
  drift test EXTENDED (not re-created) in Task 5 to the fourth source, matching §9's own explicit
  "commit 6 thêm nguồn thứ tư" note.
- Not in scope, correctly excluded: pagination, byte caps, collector, publish job (§1's own boundary
  list); `evidence_set_problems()`'s own predicateType check (Plan Decision A, a 3b-owned constant
  outside this commit's five-constant table).

**Placeholder scan** — Task 1 Step 2's exact JSON is explicitly flagged as constructed WITHOUT
independently re-reading `markerContent`'s current post-3b field paths, with an explicit instruction
to correct it against the real schema before trusting it, and a Step 3 verification gate immediately
after that would catch a wrong path (the `$ref` would fail to resolve or the schema would reject a
valid manifest). Task 3's migration commit is conditional and explicitly says "do not use this
placeholder text verbatim" if real mismatches are found — named as a real possibility, not hidden.
Task 4 defers exact witness-case bodies for the established, now four-times-proven mutation-isolation
reason, with the same required local-verification procedure as every other witness task this series
has used successfully.

**Type consistency** — `PREDICATE_TYPES` defined once (Task 1, `envelope.py`), imported once (Task 2
Step 1), consumed at exactly two call sites (Task 2 Steps 2-3) with keys the plan explicitly requires
verifying align with `EVIDENCE_REPORT_KINDS`'s real values before trusting. `release-manifest.schema.json`'s
own five `const` values (Task 1) are read again only by Task 5's drift-test extension and Task 4's
schema-validation witnesses — no other consumer, matching the plan's own Interfaces section.
