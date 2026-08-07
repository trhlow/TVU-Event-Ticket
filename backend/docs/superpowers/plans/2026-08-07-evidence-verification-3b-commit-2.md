# Evidence verification 3b — commit 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the publish decision see the evidence set: two new top-level lookups (`monolithEvidenceSet`, `frontendEvidenceSet`), a real adopt/build-new/CONFLICT rule for the resume path where a workflow died after creating evidence but before writing a marker, and closing the self-assertion loophole by making a marker's `evidenceSetDigest` claim resolve against the same verified lookup rather than being trusted on its own word.

**Architecture:** `observation.schema.json` grows `lookups` from 8 to 10 required keys and gains `evidenceSetLookup`/`presentEvidenceSet` (loosely-typed four report/attestation pairs inside it, per spec §3 — commit 4 gives those pairs their real trust-boundary split). `publish-decision.sh` gains `evidence_set_problems()`, a function with the same shape as the existing `marker_problems()`, used from two call sites: `decide()`'s no-marker-yet path (adopt vs. build-new vs. CONFLICT) and a new cross-check inside `marker_problems()` itself (a marker's claimed `evidenceSetDigest` must resolve against a clean, matching lookup, or CONFLICT — spec §11 witness #1, "self-assertion đã bị đóng"). This second use touches every existing marker-bearing fixture across `publish-decision.test.sh` and `contract-agreement.test.sh`'s corpus, so this plan includes a dedicated migration task rather than treating it as collateral damage.

**Tech Stack:** Same as commit 1 — JSON Schema draft 2020-12, `jsonschema`/`referencing`, bash test harnesses, plus this commit's own subject, `publish-decision.sh` (pure-function Python embedded in bash, already established in this repo).

## Global Constraints

- **No fixture may be modified in a way that stops testing what it was written for.** The migration task in this plan is an explicit, deliberate exception to "never modify a committed fixture" — required because widening `lookups`' required set is a breaking schema change that invalidates every existing fixture lacking the two new keys, the same way any required-field addition would. What must NOT change is which rule each fixture is proving; Task 3 verifies this by re-running every existing suite and confirming no case's expected `state`/`actions` changed, only its lookups/evidence gained the new required fields.
- **No JSON Schema keyword ships without a fixture that would redden if it were deleted.** Same rule as commit 1. `presentEvidenceSet`'s own keywords need witnesses in `contract-agreement.test.sh`'s corpus (schema + decision agreement), same as `release-evidence-set.schema.json`'s did in commit 1's own corpus.
- **The four report/attestation pairs inside `evidenceSetLookup.present` are loosely typed this commit.** `reportLookup`/`attestationLookup` are each `oneOf: [presentObject, absent, error]` — the same shape `objectLookup` already has. Commit 4 (§5) gives them a real, separate trust-boundary split. Do not add richer typing here.
- **Re-resolve-before-write is documented debt, not enforced code.** `decide()` is a pure function over one snapshot; there is no publish job yet to enforce a two-phase re-resolve against. State this as a precondition in the schema/code header, the same way commit 1 documented lifecycle/`cleanupDebt`. Spec §11 witness #9 has no fixture in this commit — recorded as a gap for the publish job's own commit, not silently dropped.
- **`ABSENT` stays `ABSENT` when an evidence-set is adoptable — no new top-level state.** Nothing has been published yet in any of these cases; only `actions` gets richer, per-image (`adopt_<image>_evidence_set` / `build_new_<image>_evidence_set` instead of a flat `["build_new"]`). When both images have nothing to adopt, actions stay exactly `["build_new"]` — byte-for-byte the pre-3b behavior, so every untouched existing ABSENT fixture keeps passing.
- **Adopt requires every one of the four attestation pairs present, or the whole decision is CONFLICT.** Spec §3 / §11 witness #8: a tag missing one kind's attestation is refused outright, and the pipeline never signs supplementally afterward to launder an artifact already there. This is a decision for the *whole* observation (return `conflict(...)`, not a partial per-image adopt) when an evidence-set lookup is `present` but not clean.
- Every script sources or honours `PYTHON_BIN` / `PUBLISH_DECISION_BASH`, same as commit 1. `export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"` and `export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python`.

## File Structure

- `.github/contracts/observation.schema.json` — **modify**. `lookups` grows to 10 required keys; new `evidenceSetLookup`/`presentEvidenceSet`/`reportAttestationPair` `$defs`; `evidence` `$def` gains a required `evidenceSetDigest` sub-object.
- `.github/scripts/publish-decision.sh` — **modify**. `REQUIRED_LOOKUPS`, `LOOKUP_REPOSITORY`, `PRESENT_FIELDS` grow; kind-selection in `validate()` gains an `evidenceSet` branch; new `evidence_set_problems()` function; `decide()`'s no-marker-yet branch rewritten; `marker_problems()` gains the `evidenceSetDigest` cross-check.
- `.github/scripts/publish-decision.test.sh` — **modify**. The shared `observation()`/`marker()` builder functions gain the two new lookups and `evidenceSetDigest` defaults; the `ABSENT`-actions invariant check is rewritten; nine existing "happy path" call sites gain explicit evidence-set-lookup overrides (documented individually in Task 2); one new section of ten cases exercises adopt/build-new/CONFLICT and the marker cross-check directly.
- `.github/contracts/fixtures/` + `expectations.json` — **modify** (migration) and **create** (new witnesses). Every existing fixture gains the two new lookups; fixtures whose marker has `content` gain `evidenceSetDigest`; the two `valid/` fixtures with content (`prepared-only.json`, `published.json`) get a fully resolving evidence-set lookup and a recomputed envelope (their marker content changed, so the envelope's layer digest/size must be recomputed to match — same payload-binding rule this repo already enforces). New invalid fixtures witness `presentEvidenceSet`'s own schema keywords.
- `.github/scripts/publish-decision.mutations.py` — **modify**. New mutation rules for `evidence_set_problems()` and the two new lookups. Per commit 1's own lesson: do not run the full 20+ minute sweep while iterating, only once before the final commit.
- `.superpowers/sdd/progress.md` — **modify**. Ledger entry (gitignored, working memory only).

## Interfaces

- **Consumes:** `release-evidence-set.schema.json` is *not* referenced by this schema — `evidenceSetLookup` describes what the collector observed about a carrier, not the carrier's own bytes; those two schemas describe different documents and stay decoupled, same as `observation.schema.json` never `$ref`s `release-envelope.schema.json`'s manifest shape either, only its constants.
- **Produces:** `observation.schema.json#/$defs/evidenceSetLookup`, `#/$defs/presentEvidenceSet`, `#/$defs/reportAttestationPair` — consumed starting 3b commit 3 (scanner provenance) and commit 4 (the real report/attestation trust-boundary split). `publish-decision.sh`'s `evidence_set_problems(lookup, obs, where)` — a new public function later commits will likely extend rather than duplicate.

---

### Task 1: Schema shape — two lookups, evidenceSetLookup, and the marker's evidenceSetDigest claim

**Files:**
- Modify: `.github/contracts/observation.schema.json`

**Interfaces:**
- Produces: `#/$defs/evidenceSetLookup`, `#/$defs/presentEvidenceSet`, `#/$defs/reportAttestationPair`; `#/$defs/evidence` gains `evidenceSetDigest`.

- [ ] **Step 1: Grow `lookups`' required set and properties**

In `.github/contracts/observation.schema.json`, find the `lookups` property (`required` list starting `"finalMarker", "preparedMarker", ...`) and replace it:

```json
    "lookups": {
      "type": "object",
      "additionalProperties": false,
      "description": "Exactly ten, no more and no fewer. A missing one is a fact nobody established; an extra one is a misspelling of a key the collector meant to set, and both are unusable rather than partial.",
      "required": [
        "finalMarker", "preparedMarker",
        "monolithTag", "frontendTag",
        "monolithDigestObject", "frontendDigestObject",
        "monolithCandidate", "frontendCandidate",
        "monolithEvidenceSet", "frontendEvidenceSet"
      ],
      "properties": {
        "finalMarker": { "$ref": "#/$defs/markerLookup" },
        "preparedMarker": { "$ref": "#/$defs/markerLookup" },
        "monolithTag": { "$ref": "#/$defs/objectLookup" },
        "frontendTag": { "$ref": "#/$defs/objectLookup" },
        "monolithDigestObject": { "$ref": "#/$defs/skippableObjectLookup" },
        "frontendDigestObject": { "$ref": "#/$defs/skippableObjectLookup" },
        "monolithCandidate": { "$ref": "#/$defs/objectLookup" },
        "frontendCandidate": { "$ref": "#/$defs/objectLookup" },
        "monolithEvidenceSet": { "$ref": "#/$defs/evidenceSetLookup" },
        "frontendEvidenceSet": { "$ref": "#/$defs/evidenceSetLookup" }
      }
    }
```

(This also changes the description's "Exactly eight" to "Exactly ten" — do not leave the old number in place.)

- [ ] **Step 2: Add `evidenceSetLookup`, `presentEvidenceSet`, `reportAttestationPair` to `$defs`**

Find `skippableObjectLookup`'s closing (the last `$def` before the final `}`) and add after it:

```json
    "evidenceSetLookup": {
      "oneOf": [
        { "$ref": "#/$defs/presentEvidenceSet" },
        { "$ref": "#/$defs/absent" },
        { "$ref": "#/$defs/error" }
      ]
    },

    "presentEvidenceSet": {
      "type": "object",
      "additionalProperties": false,
      "description": "3b commit 2 (spec section 3): what the collector must prove before the decision may adopt an existing evidence-set instead of asking for a fresh scan. verification reuses the same shape a marker's own attestation check uses -- provenance is provenance whichever carrier it is attesting to. subjectMatches and layersValid are outcomes the collector computed against release-evidence-set.schema.json's shape (section 2); the decision does not re-parse a raw manifest here, matching section 8.6. The four reports pairs are loosely typed placeholders -- commit 4 gives reportLookup and attestationLookup their own real trust-boundary split (section 5); here each is only present/absent/error, wide enough to prove all four exist, not yet rich enough to say what a real one contains.",
      "required": ["status", "queriedRef", "carrierDigest", "verification", "subjectMatches", "layersValid", "reports"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "carrierDigest": { "$ref": "#/$defs/digest" },
        "verification": { "$ref": "#/$defs/verification" },
        "subjectMatches": {
          "type": "boolean",
          "description": "Whether the carrier's own subject descriptor names this image's digest. False, not absence: the collector asked and got an answer, and a false one is the exact case section 3 calls CONFLICT (subject/structure mismatch), not UNKNOWN."
        },
        "layersValid": {
          "type": "boolean",
          "description": "Whether the carrier has exactly four layers, the four required mediaTypes, no duplicates -- release-evidence-set.schema.json's own shape, already frozen in commit 1. The decision trusts this boolean rather than re-deriving it from raw bytes."
        },
        "reports": {
          "type": "object",
          "additionalProperties": false,
          "required": ["sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"],
          "properties": {
            "sbom": { "$ref": "#/$defs/reportAttestationPair" },
            "vulnerabilityScan": { "$ref": "#/$defs/reportAttestationPair" },
            "layerSecretScan": { "$ref": "#/$defs/reportAttestationPair" },
            "filesystemSecretScan": { "$ref": "#/$defs/reportAttestationPair" }
          }
        }
      }
    },

    "reportAttestationPair": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reportLookup", "attestationLookup"],
      "properties": {
        "reportLookup": { "$ref": "#/$defs/objectLookup" },
        "attestationLookup": { "$ref": "#/$defs/objectLookup" }
      }
    }
```

- [ ] **Step 3: Add `evidenceSetDigest` to the `evidence` `$def`**

Find `"evidence": { ... "required": ["sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"], ... }` and replace the whole block:

```json
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "description": "Four separate results, because they answer different questions. A single overall pass hides which of them was never run. evidenceSetDigest nests here rather than becoming an eighth top-level markerContent key (spec section 2) -- it is one more fact about evidence, not a new category of fact about the release.",
      "required": ["sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan", "evidenceSetDigest"],
      "properties": {
        "sbom": { "$ref": "#/$defs/perImageEvidence" },
        "vulnerabilityScan": { "$ref": "#/$defs/perImageEvidence" },
        "layerSecretScan": { "$ref": "#/$defs/perImageEvidence" },
        "filesystemSecretScan": { "$ref": "#/$defs/perImageEvidence" },
        "evidenceSetDigest": {
          "type": "object",
          "additionalProperties": false,
          "required": ["monolith", "frontend"],
          "description": "3b commit 2: the digest of the evidence-set carrier the marker claims for each image. A marker no longer verifies evidence itself (section 3) -- this is a cross-check, not a source of truth: the decision resolves it against monolithEvidenceSet/frontendEvidenceSet's own already-established verification, and disagreement is CONFLICT, not a fact this field could assert on its own.",
          "properties": {
            "monolith": { "$ref": "#/$defs/digest" },
            "frontend": { "$ref": "#/$defs/digest" }
          }
        }
      }
    },
```

- [ ] **Step 4: Validate the schema is well-formed JSON**

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PYTHON_BIN" -c "import json; json.load(open('.github/contracts/observation.schema.json', encoding='utf-8')); print('json ok')"
```

Expected: `json ok`.

- [ ] **Step 5: Commit**

This task alone leaves every existing fixture rejected by the schema (they lack the two new required lookups and, where they carry marker content, `evidenceSetDigest`) — that is expected and fixed in Task 3, not this one. Do not attempt to make any suite pass yet.

```bash
git add .github/contracts/observation.schema.json
git commit -m "contract(ci): let the decision see the evidence set (1/5)

Schema shape: lookups grows from 8 to 10 required keys
(monolithEvidenceSet, frontendEvidenceSet); evidenceSetLookup/
presentEvidenceSet/reportAttestationPair added, matching spec section 3 --
carrier facts (subjectMatches, layersValid), provenance facts (verification,
reusing the same shape a marker's own attestation check uses), and four
loosely-typed report/attestation pairs (commit 4 gives them a real
trust-boundary split). evidence gains a required evidenceSetDigest, nested
inside the existing key rather than becoming an eighth top-level markerContent
field, per spec section 2's explicit instruction not to.

This intentionally leaves the existing fixture corpus schema-invalid --
Task 3 migrates it. Not run against any suite yet."
```

---

### Task 2: Decision logic — evidence_set_problems, the adopt/build-new/CONFLICT path, and the marker cross-check

**Files:**
- Modify: `.github/scripts/publish-decision.sh`
- Modify: `.github/scripts/publish-decision.test.sh`

**Interfaces:**
- Consumes: `#/$defs/evidenceSetLookup`, `#/$defs/presentEvidenceSet` (Task 1).
- Produces: `evidence_set_problems(lookup, obs, where)` — used here from two call sites (the no-marker-yet adopt path, and `marker_problems()`'s new cross-check) and available to later commits.

This task does three things in `publish-decision.sh`, then updates the test harness to match, then adds new test coverage.

- [ ] **Step 1: Grow the lookup constants**

Replace:
```python
REQUIRED_LOOKUPS = (
    "finalMarker", "preparedMarker",
    "monolithTag", "frontendTag",
    "monolithDigestObject", "frontendDigestObject",
    "monolithCandidate", "frontendCandidate",
)

MARKER_LOOKUPS = ("finalMarker", "preparedMarker")

TOP_LEVEL_KEYS = ("schemaVersion", "commit", "environment", "expected", "lookups")
EXPECTED_KEYS = ("sourceRepository", "repositories", "frontendConfigFingerprint",
                 "signerWorkflow", "registry")

REPOSITORY_ROLES = ("release", "monolith", "frontend")

# Which repository each lookup must have been queried in. Written out rather than inferred from the
# name, because inference needs an `else` branch and 3b adds exactly two *EvidenceSet lookups that
# belong to an image's repository -- they would be pinned to release silently and correctly-looking.
LOOKUP_REPOSITORY = {
    "finalMarker": "release",
    "preparedMarker": "release",
    "monolithTag": "monolith",
    "monolithDigestObject": "monolith",
    "monolithCandidate": "monolith",
    "frontendTag": "frontend",
    "frontendDigestObject": "frontend",
    "frontendCandidate": "frontend",
}
```
with:
```python
REQUIRED_LOOKUPS = (
    "finalMarker", "preparedMarker",
    "monolithTag", "frontendTag",
    "monolithDigestObject", "frontendDigestObject",
    "monolithCandidate", "frontendCandidate",
    "monolithEvidenceSet", "frontendEvidenceSet",
)

MARKER_LOOKUPS = ("finalMarker", "preparedMarker")
EVIDENCE_SET_LOOKUPS = ("monolithEvidenceSet", "frontendEvidenceSet")

TOP_LEVEL_KEYS = ("schemaVersion", "commit", "environment", "expected", "lookups")
EXPECTED_KEYS = ("sourceRepository", "repositories", "frontendConfigFingerprint",
                 "signerWorkflow", "registry")

REPOSITORY_ROLES = ("release", "monolith", "frontend")

# Which repository each lookup must have been queried in. Written out rather than inferred from the
# name, because inference needs an `else` branch and 3b adds exactly two *EvidenceSet lookups that
# belong to an image's repository -- they would be pinned to release silently and correctly-looking.
LOOKUP_REPOSITORY = {
    "finalMarker": "release",
    "preparedMarker": "release",
    "monolithTag": "monolith",
    "monolithDigestObject": "monolith",
    "monolithCandidate": "monolith",
    "monolithEvidenceSet": "monolith",
    "frontendTag": "frontend",
    "frontendDigestObject": "frontend",
    "frontendCandidate": "frontend",
    "frontendEvidenceSet": "frontend",
}
```

- [ ] **Step 2: Add the `evidenceSet` field-set kind**

Replace:
```python
PRESENT_FIELDS = {
    "marker": ({"status", "queriedRef", "markerDigest", "verification", "ociEnvelope"},
               {"status", "queriedRef", "markerDigest", "verification", "ociEnvelope", "content"}),
    "object": ({"status", "queriedRef", "digest"},
               {"status", "queriedRef", "digest"}),
}
```
with:
```python
PRESENT_FIELDS = {
    "marker": ({"status", "queriedRef", "markerDigest", "verification", "ociEnvelope"},
               {"status", "queriedRef", "markerDigest", "verification", "ociEnvelope", "content"}),
    "object": ({"status", "queriedRef", "digest"},
               {"status", "queriedRef", "digest"}),
    "evidenceSet": ({"status", "queriedRef", "carrierDigest", "verification", "subjectMatches",
                     "layersValid", "reports"},
                    {"status", "queriedRef", "carrierDigest", "verification", "subjectMatches",
                     "layersValid", "reports"}),
}
```

- [ ] **Step 3: Select the `evidenceSet` kind in `validate()`**

Find (inside `validate()`'s per-lookup loop):
```python
            kind = "marker" if name in MARKER_LOOKUPS else "object"
```
Replace with:
```python
            kind = ("marker" if name in MARKER_LOOKUPS
                    else "evidenceSet" if name in EVIDENCE_SET_LOOKUPS
                    else "object")
```

- [ ] **Step 4: Run `publish-decision.test.sh` to confirm it now fails on the two new required keys**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.test.sh 2>&1 | tail -3
```

Expected: `passed=77 failed=104` — every case whose observation goes through `validate()` now reports `observation is unusable: lookups missing: monolithEvidenceSet, frontendEvidenceSet` (state `UNKNOWN`) instead of its intended verdict. This is RED for the right reason: Step 5 fixes the shared builder that every case uses.

- [ ] **Step 5: Add the two lookups to the shared `observation()` builder, and evidence-set-lookup constants**

In `.github/scripts/publish-decision.test.sh`, find:
```bash
MARKER_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333
FP=fea7afe794dacc6140c57ac4d8406f6ff97eb763c279c679f8fb89fcfa0f9477
```
Replace with:
```bash
MARKER_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333
FP=fea7afe794dacc6140c57ac4d8406f6ff97eb763c279c679f8fb89fcfa0f9477
MONO_ES=sha256:5555555555555555555555555555555555555555555555555555555555555555
FRONT_ES=sha256:6666666666666666666666666666666666666666666666666666666666666666
```

Find the `marker()` function's python heredoc start:
```python
  python_json '
import hashlib, json, sys
overrides = json.loads(sys.argv[1] or "{}")
mono, front, sha, fp = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
```
Replace with:
```python
  python_json '
import hashlib, json, sys
overrides = json.loads(sys.argv[1] or "{}")
mono, front, sha, fp = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
mono_es, front_es = sys.argv[8], sys.argv[9]
```

Find the `marker()` function's `evidence` dict:
```python
    "evidence": {
      kind: {"monolith": {"digest": "sha256:" + letter*64, "subjectDigest": mono,
                          "predicateType": "https://tvu.example/" + kind, "passed": True},
             "frontend": {"digest": "sha256:" + letter*63 + "e", "subjectDigest": front,
                          "predicateType": "https://tvu.example/" + kind, "passed": True}}
      for kind, letter in (("sbom", "a"), ("vulnerabilityScan", "b"),
                           ("layerSecretScan", "c"), ("filesystemSecretScan", "d"))
    },
```
Replace with (no apostrophes anywhere in the new comment lines — this whole block is inside a bash single-quoted string, and an apostrophe here breaks the quoting silently, producing a bash syntax error far from the actual mistake):
```python
    "evidence": {
      **{
        kind: {"monolith": {"digest": "sha256:" + letter*64, "subjectDigest": mono,
                            "predicateType": "https://tvu.example/" + kind, "passed": True},
               "frontend": {"digest": "sha256:" + letter*63 + "e", "subjectDigest": front,
                            "predicateType": "https://tvu.example/" + kind, "passed": True}}
        for kind, letter in (("sbom", "a"), ("vulnerabilityScan", "b"),
                             ("layerSecretScan", "c"), ("filesystemSecretScan", "d"))
      },
      # 3b commit 2: matches MONO_ES/FRONT_ES, the carrierDigest present_evidence_set below
      # produces by default -- a bare marker call and a bare present_evidence_set call agree by
      # construction, the same way a bare marker call already agrees with MONO/FRONT by default.
      "evidenceSetDigest": {"monolith": mono_es, "frontend": front_es},
    },
```

Find the closing call of the `marker()` heredoc:
```bash
' "${1:-}" "${2:-$MONO}" "${3:-$FRONT}" "$SHA" "$FP" "$RELEASE_REPO" "$script_dir"
```
Replace with:
```bash
' "${1:-}" "${2:-$MONO}" "${3:-$FRONT}" "$SHA" "$FP" "$RELEASE_REPO" "$script_dir" "$MONO_ES" "$FRONT_ES"
```

Find:
```bash
absent_release="$(absent_in "$RELEASE_REPO")"
absent_mono="$(absent_in "$MONOLITH_REPO")"
absent_fe="$(absent_in "$FRONTEND_REPO")"
# A digest object cannot be queried before a marker names one, so a clean slate skips it. Claiming
# absence there would assert an observation nobody made.
skipped='{"status":"skipped","reason":"no_claimed_digest","queriedRef":null}'
```
Replace with:
```bash
absent_release="$(absent_in "$RELEASE_REPO")"
absent_mono="$(absent_in "$MONOLITH_REPO")"
absent_fe="$(absent_in "$FRONTEND_REPO")"
# A digest object cannot be queried before a marker names one, so a clean slate skips it. Claiming
# absence there would assert an observation nobody made.
skipped='{"status":"skipped","reason":"no_claimed_digest","queriedRef":null}'

# present_evidence_set <repo> <carrierDigest> -- a clean, fully-attested, adoptable evidence-set
# lookup. Matches marker()'s default evidenceSetDigest when called with MONO_ES/FRONT_ES, so a
# bare marker() and a bare present_evidence_set() agree by construction, the same pairing
# present_in() already gives MONO/FRONT.
present_evidence_set() {
  local repo="$1" digest="$2"
  local pair='{"reportLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'","digest":"'"$digest"'"},
               "attestationLookup":{"status":"present","queriedRef":"'"$repo"'@'"$digest"'","digest":"'"$digest"'"}}'
  cat <<EOF
{"status":"present","queriedRef":"$repo@$digest","carrierDigest":"$digest",
 "verification":{"attestationVerified":true,"subjectDigest":"$digest",
                  "signerRepository":"owner/name","signerWorkflow":".github/workflows/publish.yml",
                  "sourceRevision":"$SHA","predicateType":"https://tvu.example/evidence-set","policyPassed":true},
 "subjectMatches":true,"layersValid":true,
 "reports":{"sbom":$pair,"vulnerabilityScan":$pair,"layerSecretScan":$pair,"filesystemSecretScan":$pair}}
EOF
}
present_mono_es="$(present_evidence_set "$MONOLITH_REPO" "$MONO_ES")"
present_front_es="$(present_evidence_set "$FRONTEND_REPO" "$FRONT_ES")"
```

Find the `observation()` function:
```bash
# observation <final> <prepared> <monoTag> <frontTag> [monoObj] [frontObj] [monoCand] [frontCand]
observation() {
  cat <<EOF
{"schemaVersion":1,"commit":"$SHA","environment":"production",
 "expected":{"sourceRepository":"owner/name",
             "repositories":{"release":"owner/name/release","monolith":"owner/name/monolith","frontend":"owner/name/frontend"},
             "frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml","registry":"ghcr.io"},
 "lookups":{"finalMarker":$1,"preparedMarker":$2,"monolithTag":$3,"frontendTag":$4,
            "monolithDigestObject":${5:-$(present_in "$MONOLITH_REPO" "$MONO")},
            "frontendDigestObject":${6:-$(present_in "$FRONTEND_REPO" "$FRONT")},
            "monolithCandidate":${7:-$absent_mono},"frontendCandidate":${8:-$absent_fe}}}
EOF
}
```
Replace with:
```bash
# observation <final> <prepared> <monoTag> <frontTag> [monoObj] [frontObj] [monoCand] [frontCand]
#             [monoEvidenceSet] [frontEvidenceSet]
#
# The two evidence-set lookups default to absent: every existing caller of observation() is
# testing something about markers, tags or digest objects, and defaulting to "nothing to adopt"
# keeps every one of those cases asking the same question it always did instead of accidentally
# also exercising 3b's adopt path. Cases that DO want to exercise adopt/CONFLICT pass $9/$10.
observation() {
  cat <<EOF
{"schemaVersion":1,"commit":"$SHA","environment":"production",
 "expected":{"sourceRepository":"owner/name",
             "repositories":{"release":"owner/name/release","monolith":"owner/name/monolith","frontend":"owner/name/frontend"},
             "frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml","registry":"ghcr.io"},
 "lookups":{"finalMarker":$1,"preparedMarker":$2,"monolithTag":$3,"frontendTag":$4,
            "monolithDigestObject":${5:-$(present_in "$MONOLITH_REPO" "$MONO")},
            "frontendDigestObject":${6:-$(present_in "$FRONTEND_REPO" "$FRONT")},
            "monolithCandidate":${7:-$absent_mono},"frontendCandidate":${8:-$absent_fe},
            "monolithEvidenceSet":${9:-$absent_mono},"frontendEvidenceSet":${10:-$absent_fe}}}
EOF
}
```

- [ ] **Step 6: Run again — confirm the same RED count as Step 4, minus nothing yet (the subject still lacks the new logic)**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.test.sh 2>&1 | tail -3
```

Expected: `passed=172 failed=9`. The 9 failures are specific "happy path" call sites that build a fully valid marker via a bare `marker()` call and were relying on its default content being trustworthy for something else the case is testing (migration checksums, tag/digest-object agreement) — they now fail because `evidence_set_problems` doesn't exist yet (Step 7) and because they don't pass matching evidence-set-lookup overrides (Step 11 fixes the call sites; Step 7-8 add the function and branch these fixtures will exercise).

- [ ] **Step 7: Add `evidence_set_problems()` and the marker cross-check**

In `.github/scripts/publish-decision.sh`, find the end of `marker_problems()` (the `evidence` semantic-checks `else:` block, right after the `for kind in (...)` loop that ends with the `passed` check, and before `problems.extend(inventory_problems(...))`):

```python
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

    problems.extend(inventory_problems(content.get("flywayInventory"), images.get("monolith"),
                                       f"{where}.content.flywayInventory"))
    return problems
```

Replace with (this adds the cross-check inside the existing `else:` block, still indented at the same level as the `for kind in (...)` loop above it, and adds `evidence_set_problems()` as a new top-level function right after `marker_problems()` returns):

```python
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

        # 3b commit 2 (spec section 3): the marker no longer verifies evidence itself, it only
        # claims a digest and the decision resolves that claim against the lookup that already did
        # the verifying. A marker asserting evidenceSetDigest with nothing to back it, or a digest
        # that disagrees with what monolithEvidenceSet/frontendEvidenceSet actually observed, is
        # exactly the self-assertion section 1 exists to close -- CONFLICT, not trusted on its word.
        evidence_set_digest = evidence.get("evidenceSetDigest")
        if type(evidence_set_digest) is not dict:
            problems.append(f"{where}.content.evidence.evidenceSetDigest must be an object")
        else:
            for image in IMAGES:
                claimed_digest = evidence_set_digest.get(image)
                if type(claimed_digest) is not str or not DIGEST.fullmatch(claimed_digest):
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} is not a "
                                    f"digest")
                    continue
                lookup = obs["lookups"][f"{image}EvidenceSet"]
                if lookup["status"] != "present":
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} claims "
                                    f"{claimed_digest}, but the {image} evidence-set lookup is "
                                    f"{lookup['status']}, not present -- the claim does not resolve")
                    continue
                set_problems = evidence_set_problems(lookup, obs, f"lookups.{image}EvidenceSet")
                if set_problems:
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} claims "
                                    f"{claimed_digest}, but the {image} evidence-set is not "
                                    f"trustworthy: {'; '.join(set_problems)}")
                elif lookup["carrierDigest"] != claimed_digest:
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} is "
                                    f"{claimed_digest}, but the {image} evidence-set lookup resolved "
                                    f"{lookup['carrierDigest']}")

    problems.extend(inventory_problems(content.get("flywayInventory"), images.get("monolith"),
                                       f"{where}.content.flywayInventory"))
    return problems


def evidence_set_problems(lookup, obs, where):
    """Everything wrong with a present evidence-set lookup. Empty means it may be adopted, or a
    marker's evidenceSetDigest claim against it may be trusted."""
    problems = []
    expected = obs["expected"]

    verification = lookup.get("verification")
    if type(verification) is not dict:
        problems.append(f"{where}.verification is missing; the collector must record what it "
                        f"actually verified, not repeat the carrier's own claim")
        return problems

    carrier_digest = lookup.get("carrierDigest")
    if type(carrier_digest) is not str or not DIGEST.fullmatch(carrier_digest):
        problems.append(f"{where}.carrierDigest is not a sha256 reference")
    if verification.get("subjectDigest") != carrier_digest:
        problems.append(f"{where}.verification.subjectDigest is "
                        f"{verification.get('subjectDigest')!r}, not the carrier it describes")
    if verification.get("attestationVerified") is not True:
        problems.append(f"{where}.verification.attestationVerified is "
                        f"{verification.get('attestationVerified')!r}, must be boolean true")
    if verification.get("signerRepository") != expected["sourceRepository"]:
        problems.append(f"{where} signed by {verification.get('signerRepository')!r}, expected "
                        f"{expected['sourceRepository']!r}")
    if verification.get("signerWorkflow") != expected["signerWorkflow"]:
        problems.append(f"{where} signed by workflow {verification.get('signerWorkflow')!r}, "
                        f"expected {expected['signerWorkflow']!r}")
    if verification.get("sourceRevision") != obs["commit"]:
        problems.append(f"{where}.verification.sourceRevision is "
                        f"{verification.get('sourceRevision')!r}, expected {obs['commit']!r}")
    if verification.get("policyPassed") is not True:
        problems.append(f"{where}.verification.policyPassed is "
                        f"{verification.get('policyPassed')!r}, must be boolean true")

    if lookup.get("subjectMatches") is not True:
        problems.append(f"{where}.subjectMatches is {lookup.get('subjectMatches')!r}, the "
                        f"carrier's subject does not name this image")
    if lookup.get("layersValid") is not True:
        problems.append(f"{where}.layersValid is {lookup.get('layersValid')!r}, the carrier does "
                        f"not have the required four report layers")

    reports = lookup.get("reports")
    if type(reports) is not dict:
        problems.append(f"{where}.reports is missing")
        return problems
    for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):
        pair = reports.get(kind)
        if type(pair) is not dict:
            problems.append(f"{where}.reports.{kind} is missing")
            continue
        report_lookup = pair.get("reportLookup")
        if type(report_lookup) is not dict or report_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.reportLookup is not present; adopt requires "
                            f"every report to already exist, not a partial set")
        attestation_lookup = pair.get("attestationLookup")
        if type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present":
            # Section 3: a tag that exists but is missing a kind's attestation is CONFLICT, and the
            # pipeline does not sign supplementally afterward to launder an artifact already there.
            problems.append(f"{where}.reports.{kind}.attestationLookup is not present; adopting "
                            f"without every kind's attestation would sign on trust rather than "
                            f"verify it")
    return problems
```

- [ ] **Step 8: Rewrite `decide()`'s no-marker-yet branch**

Find:
```python
    if not prepared_present:
        stray = [image for image in IMAGES if tags[image]["status"] == "present"]
        stray += [f"{image} digest object" for image in IMAGES
                  if objects[image]["status"] == "present"]
        if stray:
            # Anything found without a marker to explain it is unexplained, not absent. A genuinely
            # clean slate has no digest to have queried, which is what "skipped" records.
            return conflict("object(s) present with no prepared marker to anchor them: "
                            + ", ".join(stray), cleanup_debt)
        return decision("ABSENT", ["build_new"], "nothing published for this commit", cleanup_debt)
```
Replace with:
```python
    if not prepared_present:
        stray = [image for image in IMAGES if tags[image]["status"] == "present"]
        stray += [f"{image} digest object" for image in IMAGES
                  if objects[image]["status"] == "present"]
        if stray:
            # Anything found without a marker to explain it is unexplained, not absent. A genuinely
            # clean slate has no digest to have queried, which is what "skipped" records.
            return conflict("object(s) present with no prepared marker to anchor them: "
                            + ", ".join(stray), cleanup_debt)

        # 3b commit 2 (spec section 3): evidence-set creation precedes the prepared marker that
        # references it, so a workflow that dies in between must be resumable -- the decision has to
        # see an already-verified evidence-set and say adopt, not silently re-derive ABSENT and send
        # the next run to re-derive evidence that already exists and was already attested.
        evidence_sets = {image: lookups[f"{image}EvidenceSet"] for image in IMAGES}
        actions = []
        adoptable = []
        for image in IMAGES:
            lookup = evidence_sets[image]
            if lookup["status"] == "absent":
                actions.append(f"build_new_{image}_evidence_set")
                adoptable.append(False)
                continue
            # status is "present": "error" already returned via the failures[] gate at the top of
            # decide(), before any lookup here is inspected, so present is the only status left.
            set_problems = evidence_set_problems(lookup, obs, f"lookups.{image}EvidenceSet")
            if set_problems:
                # Section 3's table: provenance/subject/structure mismatch, or a tag missing any
                # kind's attestation, is CONFLICT -- never a partial adopt, never a supplemental
                # sign to launder an artifact that is already there.
                return conflict(f"{image} evidence-set is not adoptable: "
                                + "; ".join(set_problems), cleanup_debt)
            actions.append(f"adopt_{image}_evidence_set")
            adoptable.append(True)

        if not any(adoptable):
            # Byte-for-byte the pre-3b behavior when neither image has anything to adopt: every
            # existing ABSENT fixture keeps passing unmodified, and a caller that only recognises
            # "build_new" is not silently handed a verb it was never told to expect.
            return decision("ABSENT", ["build_new"], "nothing published for this commit", cleanup_debt)
        return decision("ABSENT", actions,
                        "nothing published for this commit; existing evidence-set(s) may be reused",
                        cleanup_debt)
```

- [ ] **Step 9: Fix the `ABSENT`-actions invariant in the test harness**

The harness's own comparison checker enforces a blanket invariant that `ABSENT` must carry exactly `["build_new"]`, which the new per-image actions violate. In `.github/scripts/publish-decision.test.sh`, find:
```python
if state == "ABSENT" and actions != ["build_new"]:
    problems.append("ABSENT must be exactly [build_new], has %r" % (actions,))
```
Replace with:
```python
if state == "ABSENT" and actions != ["build_new"]:
    # 3b commit 2: ABSENT stays ABSENT even when an evidence-set already exists to adopt -- nothing
    # has been published yet -- but the actions say which image(s) can skip a fresh scan. Anything
    # other than plain build_new must name exactly one action per image, each either build_new_* or
    # adopt_* for that image and no other.
    per_image = {
        "monolith": {"build_new_monolith_evidence_set", "adopt_monolith_evidence_set"},
        "frontend": {"build_new_frontend_evidence_set", "adopt_frontend_evidence_set"},
    }
    actions_set = set(actions)
    if (len(actions) != 2
            or len(actions_set & per_image["monolith"]) != 1
            or len(actions_set & per_image["frontend"]) != 1):
        problems.append("ABSENT must be [build_new] or exactly one build_new_*_evidence_set/"
                        "adopt_*_evidence_set action per image, has %r" % (actions,))
```

- [ ] **Step 10: Run — confirm exactly the 9 Step-6 failures remain**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.test.sh 2>&1 | tail -3
```

Expected: `passed=172 failed=9`, the same 9 named cases as Step 6 (`both tags missing`, `one tag missing`, `both tags right, final marker missing`, `final marker and both tags agree`, `a digest object skipped while the marker claims that digest`, `leftover candidate does not invalidate it`, `several repeatables share the absence of a version`, `a migration Flyway recorded no checksum for`, `migrations listed out of order still hash the same`) — all failing with `CONFLICT ... evidenceSetDigest must be an object` or similar, because `evidence_set_problems`/the cross-check now exist and correctly refuse a marker whose `evidenceSetDigest` doesn't resolve, but these 9 call sites don't pass a matching evidence-set lookup yet.

- [ ] **Step 11: Fix the 9 call sites**

In `.github/scripts/publish-decision.test.sh`, find each of these and replace exactly as shown (each adds `"" "" "" ""` to reach positions 5-8 unchanged, then `"$present_mono_es" "$present_front_es"` at 9-10 — except the two cases that already use $5-$7 for something else, noted individually):

```bash
assert_decision "both tags missing" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
assert_decision "one tag missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$absent_fe")" \
  PARTIAL '["promote_frontend_tag","publish_final_marker"]' false false
assert_decision "both tags right, final marker missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  PARTIAL '["publish_final_marker"]' false false
```
becomes:
```bash
assert_decision "both tags missing" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
assert_decision "one tag missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_frontend_tag","publish_final_marker"]' false false
assert_decision "both tags right, final marker missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["publish_final_marker"]' false false
```

Find:
```bash
assert_decision "final marker and both tags agree" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  COMPLETE '["verify_only"]' false false
```
Replace with:
```bash
assert_decision "final marker and both tags agree" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  COMPLETE '["verify_only"]' false false
```

Find (note: this one already uses $5 for `$skipped`, so only $6-$8 get `""`):
```bash
assert_decision "a digest object skipped while the marker claims that digest" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "$skipped")" \
  UNKNOWN '[]' false false
```
Replace with:
```bash
assert_decision "a digest object skipped while the marker claims that digest" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "$skipped" "" "" "" "$present_mono_es" "$present_front_es")" \
  UNKNOWN '[]' false false
```

Find (note: this one already uses $7 for a present candidate, so only $5/$6/$8 get `""`):
```bash
assert_decision "leftover candidate does not invalidate it" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "" "" "$(present_in "$MONOLITH_REPO" "$MONO")")" \
  COMPLETE '["verify_only"]' true false
```
Replace with:
```bash
assert_decision "leftover candidate does not invalidate it" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "" "" "$(present_in "$MONOLITH_REPO" "$MONO")" "" "$present_mono_es" "$present_front_es")" \
  COMPLETE '["verify_only"]' true false
```

Find (the three migration cases, each already using `marker '{"_migrations":...}'` with no positional overrides beyond $3/$4):
```bash
assert_decision "several repeatables share the absence of a version" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":null,"type":"SQL","script":"R__one.sql","checksum":1,"success":true},{"installedRank":2,"version":null,"type":"SQL","script":"R__two.sql","checksum":2,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# Flyway records no checksum for some entries, and a release must not be blocked by an absence
# Flyway itself produced.
assert_decision "a migration Flyway recorded no checksum for" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":null,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# The canonical form is ordered by installedRank, so the order the collector happened to read the
# table in cannot change the checksum. Both of these hash to the same value by construction: the
# fixture sorts before hashing, and the subject has to do the same or one of them is rejected.
assert_decision "migrations listed out of order still hash the same" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":2,"version":"2","type":"SQL","script":"V2__b.sql","checksum":2,"success":true},{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
```
Replace with (only the `observation(...)` call's trailing args change; the `marker '{"_migrations":...}'` payload is untouched):
```bash
assert_decision "several repeatables share the absence of a version" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":null,"type":"SQL","script":"R__one.sql","checksum":1,"success":true},{"installedRank":2,"version":null,"type":"SQL","script":"R__two.sql","checksum":2,"success":true}]}')" "$absent_mono" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# Flyway records no checksum for some entries, and a release must not be blocked by an absence
# Flyway itself produced.
assert_decision "a migration Flyway recorded no checksum for" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":null,"success":true}]}')" "$absent_mono" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# The canonical form is ordered by installedRank, so the order the collector happened to read the
# table in cannot change the checksum. Both of these hash to the same value by construction: the
# fixture sorts before hashing, and the subject has to do the same or one of them is rejected.
assert_decision "migrations listed out of order still hash the same" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":2,"version":"2","type":"SQL","script":"V2__b.sql","checksum":2,"success":true},{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true}]}')" "$absent_mono" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
```

- [ ] **Step 12: Run — confirm the pre-existing corpus is fully green again**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.test.sh 2>&1 | tail -3
```

Expected: `passed=181 failed=0` — every pre-existing case passes, none of their expected `state`/`actions` changed, only their inputs gained the two new required lookups (defaulted to absent) and, for the 9 fixed call sites, a matching evidence-set pair.

- [ ] **Step 13: Add the new test section exercising adopt/build-new/CONFLICT and the marker cross-check directly**

At the end of `.github/scripts/publish-decision.test.sh`, find:
```bash
assert_decision "a payload that is not an object" \
  "$(observation "$absent_release" "$(marker '{"_content_replace": "not an object"}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false

echo
echo "passed=$passed failed=$failed"
```
Replace with:
```bash
assert_decision "a payload that is not an object" \
  "$(observation "$absent_release" "$(marker '{"_content_replace": "not an object"}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false

echo
echo "== 3b commit 2: evidence-set adopt, build_new, and CONFLICT"
# damaged_evidence_set <python-statement> <base-json> -- takes present_evidence_set's own JSON and
# applies one edit via exec(), so each case changes exactly one fact and the rest of a clean,
# adoptable evidence-set stays intact.
damaged_evidence_set() {
  "$PYTHON" -c '
import json, sys
doc = json.loads(sys.argv[2])
exec(sys.argv[1])
print(json.dumps(doc))
' "$1" "$2"
}
assert_decision "nothing to adopt, nothing built: unchanged pre-3b behavior" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")" \
  ABSENT '["build_new"]' false false
assert_decision "one image adoptable, the other has nothing yet" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" "$present_mono_es")" \
  ABSENT '["adopt_monolith_evidence_set","build_new_frontend_evidence_set"]' false false
assert_decision "both images adoptable" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" "$present_mono_es" "$present_front_es")" \
  ABSENT '["adopt_monolith_evidence_set","adopt_frontend_evidence_set"]' false false
assert_decision "adopt refused: one kind is missing its attestation" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["reports"]["sbom"]["attestationLookup"] = {"status": "absent", "observedCode": 404, "queriedRef": "x:sha-x"}' "$present_mono_es")")" \
  CONFLICT '[]' false false
assert_decision "adopt refused: provenance names a different workflow" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["verification"]["signerWorkflow"] = "other.yml"' "$present_mono_es")")" \
  CONFLICT '[]' false false
assert_decision "adopt refused: subject does not match this image" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     "$(damaged_evidence_set 'doc["subjectMatches"] = False' "$present_mono_es")")" \
  CONFLICT '[]' false false
assert_decision "evidence-set lookup error surfaces through the same UNKNOWN gate as any other" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "" "" \
     '{"status":"error","code":503,"queriedRef":"ghcr.io/owner/name/monolith:sha-x"}')" \
  UNKNOWN '[]' false true
assert_decision "a marker's evidenceSetDigest claim resolves against a clean, matching evidence-set" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe" "" "" "" "" "$present_mono_es" "$present_front_es")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
assert_decision "a marker's evidenceSetDigest claim does not resolve: lookup absent" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "a marker's evidenceSetDigest claim does not resolve: digest disagrees" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe" "" "" "" "" \
     "$(damaged_evidence_set 'doc["carrierDigest"] = "sha256:" + "7"*64; doc["verification"]["subjectDigest"] = doc["carrierDigest"]' "$present_mono_es")" "$present_front_es")" \
  CONFLICT '[]' false false

echo
echo "passed=$passed failed=$failed"
```

- [ ] **Step 14: Run — confirm all ten new cases pass**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.test.sh 2>&1 | tail -3
```

Expected: `passed=191 failed=0` (181 + 10 new cases).

- [ ] **Step 15: shellcheck**

```bash
export PATH="$PATH:/c/Users/Hlow/AppData/Local/Programs/Python/Python312/Scripts"
tmp=$(mktemp -d)
for f in .github/scripts/publish-decision.sh .github/scripts/publish-decision.test.sh; do
  tr -d '\r' < "$f" > "$tmp/$(basename "$f")"
done
shellcheck --severity=warning -x --source-path="$tmp" "$tmp"/*.sh
```

Expected: no output, exit 0.

- [ ] **Step 16: Commit**

```bash
git add .github/scripts/publish-decision.sh .github/scripts/publish-decision.test.sh
git commit -m "contract(ci): let the decision see the evidence set (2/5)

evidence_set_problems() -- the same shape as marker_problems() -- used from
two call sites: decide()'s no-marker-yet path (adopt vs. build_new vs.
CONFLICT per image, section 3's table) and a new cross-check inside
marker_problems() itself (a marker's evidenceSetDigest claim must resolve
against a clean, matching lookup or CONFLICT -- section 11 witness #1,
closing the self-assertion loophole section 1 names as 3b's whole reason to
exist). ABSENT stays ABSENT when evidence exists to adopt; actions become
per-image (adopt_<image>_evidence_set / build_new_<image>_evidence_set)
instead of a flat build_new, and fall back to exactly [\"build_new\"] when
neither image has anything -- byte-for-byte the pre-3b behavior.

Widened the shared observation()/marker() test builders (2 new lookups,
evidenceSetDigest default) rather than editing fixtures piecemeal; fixed 9
existing call sites that build a fully-valid marker for testing something
else (migration checksums, tag/digest-object agreement) to also pass a
matching evidence-set pair, since their default marker content now makes a
resolvable claim. Rewrote the harness's own ABSENT-actions invariant, which
hardcoded [\"build_new\"] as the only legal value.

RED at passed=77 failed=104 after growing REQUIRED_LOOKUPS (every case's
observation became structurally unusable). GREEN at passed=181 failed=0
after widening the builders and fixing the 9 call sites -- the entire
pre-existing corpus, byte-for-byte the same expected state/actions. Ten new
cases added exercising adopt/build_new/CONFLICT and the marker cross-check
directly: passed=191 failed=0. shellcheck clean."
```

---

### Task 3: Migrate the existing `contract-agreement.test.sh` fixture corpus

**Files:**
- Modify: every file under `.github/contracts/fixtures/valid/` and `.github/contracts/fixtures/invalid-*/`
- No modification to `.github/contracts/fixtures/expectations.json` (no file is added or removed, only their content changes)

**Interfaces:**
- Consumes: `evidence_set_problems`, `evidenceSetLookup`/`presentEvidenceSet` (Tasks 1-2).

Every fixture under `.github/contracts/fixtures/` was written before `lookups` required 10 keys, so all 25 currently fail schema validation on the two missing keys. This is the deliberate, documented exception to "never modify a committed fixture" named in Global Constraints — required by any required-field addition, the same as it would be for any other schema. What must not change is which rule each fixture proves; this task's Step 4 verification is built around confirming that.

- [ ] **Step 1: Run to confirm the corpus is currently broken by Task 1's schema change**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | tail -3
```

Expected: `passed=12 failed=16` (`monolithEvidenceSet`/`frontendEvidenceSet` missing from every fixture's `lookups`).

- [ ] **Step 2: Add the two absent lookups to every fixture**

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PYTHON_BIN" - <<'PYEOF'
import json, pathlib

root = pathlib.Path(".github/contracts/fixtures")
absent_mono = {"status": "absent", "observedCode": 404, "queriedRef": "ghcr.io/owner/name/monolith:sha-x"}
absent_fe = {"status": "absent", "observedCode": 404, "queriedRef": "ghcr.io/owner/name/frontend:sha-x"}

changed = []
for f in root.rglob("*.json"):
    if f.name == "expectations.json":
        continue
    doc = json.loads(f.read_text(encoding="utf-8"))
    lookups = doc.get("lookups")
    if isinstance(lookups, dict) and "monolithEvidenceSet" not in lookups:
        lookups["monolithEvidenceSet"] = absent_mono
        lookups["frontendEvidenceSet"] = absent_fe
        f.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        changed.append(str(f.relative_to(root)))

print(f"changed {len(changed)} files")
assert len(changed) == 25, f"expected exactly 25 fixture files to change, got {len(changed)}"
PYEOF
```

Expected: `changed 25 files` and the assertion passes. (26 files under `fixtures/` minus `expectations.json` = 25 — every JSON fixture in the corpus is touched, since every one lacked the two new lookups.)

- [ ] **Step 3: Run — confirm this alone does not fully fix the corpus**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | tail -3
```

Expected: `passed=18 failed=10`. The remaining 10 failures are fixtures whose marker `content` now needs `evidenceSetDigest` too — the two new absent lookups alone satisfy `lookups`' required set, but any marker with `content.evidence` still fails Task 2's `evidenceSetDigest must be an object` check. If the count differs, list the failing names before continuing — do not assume which ones remain.

- [ ] **Step 4: Add `evidenceSetDigest` wherever a marker has content, and fully resolve it for the two `valid/` fixtures that need to reach a non-CONFLICT state**

```bash
"$PYTHON_BIN" - <<'PYEOF'
import json, pathlib

root = pathlib.Path(".github/contracts/fixtures")
MONO_ES = "sha256:5555555555555555555555555555555555555555555555555555555555555555"
FRONT_ES = "sha256:6666666666666666666666666666666666666666666666666666666666666666"

def present_evidence_set(repo, digest):
    pair = {
        "reportLookup": {"status": "present", "queriedRef": f"{repo}@{digest}", "digest": digest},
        "attestationLookup": {"status": "present", "queriedRef": f"{repo}@{digest}", "digest": digest},
    }
    return {
        "status": "present", "queriedRef": f"{repo}@{digest}", "carrierDigest": digest,
        "verification": {
            "attestationVerified": True, "subjectDigest": digest,
            "signerRepository": "owner/name", "signerWorkflow": ".github/workflows/ci.yml",
            "sourceRevision": "0123456789abcdef0123456789abcdef01234567",
            "predicateType": "https://tvu.example/evidence-set", "policyPassed": True,
        },
        "subjectMatches": True, "layersValid": True,
        "reports": {k: pair for k in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")},
    }

# These two are the only fixtures whose expected state (PARTIAL / COMPLETE) requires the
# evidence-set claim to actually resolve -- every other marker-bearing fixture is already expected
# CONFLICT for its own, unrelated reason, and an extra unresolved evidence-set claim just adds one
# more true contributing reason to a CONFLICT that was already going to happen.
RESOLVE = {"valid/prepared-only.json", "valid/published.json"}

changed = []
for f in root.rglob("*.json"):
    if f.name == "expectations.json":
        continue
    rel = str(f.relative_to(root)).replace("\\", "/")
    doc = json.loads(f.read_text(encoding="utf-8"))
    lookups = doc.get("lookups")
    if not isinstance(lookups, dict):
        continue
    touched = False
    for marker_name in ("finalMarker", "preparedMarker"):
        marker = lookups.get(marker_name)
        if not isinstance(marker, dict):
            continue
        content = marker.get("content")
        if not isinstance(content, dict):
            continue
        evidence = content.get("evidence")
        if isinstance(evidence, dict) and "evidenceSetDigest" not in evidence:
            evidence["evidenceSetDigest"] = {"monolith": MONO_ES, "frontend": FRONT_ES}
            touched = True
    if rel in RESOLVE:
        lookups["monolithEvidenceSet"] = present_evidence_set("ghcr.io/owner/name/monolith", MONO_ES)
        lookups["frontendEvidenceSet"] = present_evidence_set("ghcr.io/owner/name/frontend", FRONT_ES)
        touched = True
    if touched:
        f.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        changed.append(rel)

print(f"changed {len(changed)} files")
for c in sorted(changed):
    print(" ", c)
PYEOF
```

Expected: `changed 17 files` — 15 fixtures whose marker content gained `evidenceSetDigest` only, plus the 2 `RESOLVE` fixtures which also gained a fully resolving evidence-set lookup pair.

- [ ] **Step 5: Run — confirm only the two `RESOLVE` fixtures still fail, and see why**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | grep -E "^FAIL|passed="
```

Expected: `FAIL valid/prepared-only.json` and `FAIL valid/published.json`, both reporting a `state='CONFLICT'` where `PARTIAL`/`COMPLETE` was wanted, `passed=26 failed=2`. Run `"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.sh .github/contracts/fixtures/valid/prepared-only.json` directly to read the reason — it will name a payload-binding mismatch: the marker's `ociEnvelope.raw` layer digest/size no longer match `content` now that `content.evidence.evidenceSetDigest` was added, because content bytes changed but the envelope wrapping them was not recomputed. This is the same payload-binding rule this repo already enforces everywhere else (`envelope.py`'s `envelope_for`/`marker_digest`) — recomputing it, not disabling the check, is Step 6.

- [ ] **Step 6: Recompute the envelope for the two `RESOLVE` fixtures**

```bash
"$PYTHON_BIN" - <<'PYEOF'
import json, pathlib, sys

root = pathlib.Path(".github/contracts/fixtures")
sys.path.insert(0, ".github/scripts")
import envelope as envelope_module

for name in ("valid/prepared-only.json", "valid/published.json"):
    f = root / name
    doc = json.loads(f.read_text(encoding="utf-8"))
    for marker_name in ("finalMarker", "preparedMarker"):
        marker = doc["lookups"].get(marker_name)
        if not isinstance(marker, dict) or "content" not in marker:
            continue
        raw = envelope_module.envelope_for(marker["content"])
        digest = envelope_module.marker_digest(raw)
        marker["ociEnvelope"]["raw"] = raw
        marker["markerDigest"] = digest
        marker["verification"]["subjectDigest"] = digest
    f.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print("rewrote", name)
PYEOF
```

- [ ] **Step 7: Run — confirm the entire corpus is green**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | tail -3
```

Expected: `passed=28 failed=0`.

- [ ] **Step 8: Verify no fixture's proven rule changed — diff each fixture's expected `state`/`actions` in `expectations.json` against its value before this task**

`expectations.json` itself was never edited in this task (only the 26 fixture files were), so a confirmation that its content is unchanged is a confirmation that no test's expected verdict moved:

```bash
git diff --stat .github/contracts/fixtures/expectations.json
```

Expected: no output (the file has zero uncommitted changes at this point — nothing in this task touched it).

- [ ] **Step 9: Run the full local suite sweep**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
for s in publish-decision contract-agreement contract-agreement.report manifest-agreement \
         canonical envelope interpreter-override require-green-run evidence-set-schema; do
  echo -n "$s: "
  "$PUBLISH_DECISION_BASH" ".github/scripts/$s.test.sh" 2>&1 | tail -1
done
```

Expected: `publish-decision: passed=191 failed=0`, `contract-agreement: passed=28 failed=0`, `contract-agreement.report: passed=7 failed=0`, `manifest-agreement: passed=15 failed=0`, `canonical: passed=3 failed=0`, `envelope: passed=8 failed=0`, `interpreter-override: passed=11 failed=0`, `require-green-run: passed=22 failed=0`, `evidence-set-schema: passed=32 failed=0` — every suite at or above its Task-1/2 baseline. `common-sh-usage.test.sh` is intentionally excluded from this per-task sweep (it scans `backend/infra/production/scripts` too, unrelated to this task); run it once in Task 5's full sweep instead.

Do not run `publish-decision.mutations.py` here — it takes over 20 minutes; Task 5 runs it once, at the end.

- [ ] **Step 10: Commit**

```bash
git add .github/contracts/fixtures
git commit -m "contract(ci): let the decision see the evidence set (3/5)

Migrated the existing 25-fixture contract-agreement.test.sh corpus onto the
widened lookups (Task 1) and the marker evidenceSetDigest cross-check
(Task 2) -- a required-field addition invalidates every existing document
that predates it, the same as any other schema change of this shape.

All 25 fixtures gained monolithEvidenceSet/frontendEvidenceSet (absent).
15 of those whose marker carries content additionally gained
evidence.evidenceSetDigest, resolving to a placeholder digest that never
matches any lookup -- harmless, since all 15 are already expected CONFLICT
for their own, pre-existing reason (attestation not verified, wrong signer,
migration checksum mismatch, etc.); an extra unresolved evidence-set claim
is one more true contributing reason, not a changed verdict.

Two fixtures (valid/prepared-only.json, valid/published.json) needed the
claim to actually resolve, since they are the corpus's only PARTIAL/COMPLETE
cases with marker content: gave them a fully clean, matching evidence-set
lookup pair, then recomputed each marker's ociEnvelope/markerDigest/
verification.subjectDigest from the changed content -- the same
payload-binding rule already enforced everywhere else in this suite, applied
to content this task itself changed.

expectations.json was not touched: every fixture still proves the exact rule
it always did, confirmed by git diff --stat reporting zero changes to that
file. passed=28 failed=0 (was passed=12 failed=16 immediately after Task 1's
schema change). Full sibling-suite sweep clean, all at or above baseline."
```

---

### Task 4: Witness `presentEvidenceSet`'s own schema keywords

**Files:**
- Create: `.github/contracts/fixtures/invalid-structure/evidence-set-missing-subject-matches.json`
- Create: `.github/contracts/fixtures/invalid-structure/evidence-set-extra-field.json`
- Create: `.github/contracts/fixtures/invalid-structure/evidence-set-reports-missing-a-kind.json`
- Create: `.github/contracts/fixtures/invalid-structure/evidence-set-pair-missing-attestation-lookup.json`
- Modify: `.github/contracts/fixtures/expectations.json`

**Interfaces:**
- Consumes: `#/$defs/presentEvidenceSet`, `#/$defs/reportAttestationPair` (Task 1); the two `RESOLVE`d `valid/` fixtures from Task 3 (used as the base to mutate).

Task 1 added new schema keywords; Task 3 only migrated existing fixtures onto them without adding anything that would prove them load-bearing. This task closes that gap — the same "no keyword ships without a fixture that would redden if deleted" rule commit 1 established, applied to `presentEvidenceSet`'s own new keywords: `subjectMatches`'s presence, the object's closed field set, `reports`' four required kinds, and `reportAttestationPair`'s two required lookups. This is not exhaustive coverage of every leaf keyword in the new schema shape (that is the kind of gap a whole-branch review is positioned to find, same as it did for commit 1) — it covers the four highest-value gaps a straightforward reading finds.

- [ ] **Step 1: Write the four fixtures**

Each is `valid/published.json` (as it stands after Task 3 — i.e. already carrying a resolving `monolithEvidenceSet`) with exactly one change inside `lookups.monolithEvidenceSet`:

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PYTHON_BIN" - <<'PYEOF'
import json, pathlib

root = pathlib.Path(".github/contracts/fixtures")
base = json.loads((root / "valid/published.json").read_text(encoding="utf-8"))

def write(name, doc):
    (root / "invalid-structure" / name).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")

# subjectMatches removed entirely (required)
d1 = json.loads(json.dumps(base))
del d1["lookups"]["monolithEvidenceSet"]["subjectMatches"]
write("evidence-set-missing-subject-matches.json", d1)

# an unknown key added (additionalProperties: false)
d2 = json.loads(json.dumps(base))
d2["lookups"]["monolithEvidenceSet"]["annotations"] = {}
write("evidence-set-extra-field.json", d2)

# reports is missing one of its four required kinds
d3 = json.loads(json.dumps(base))
del d3["lookups"]["monolithEvidenceSet"]["reports"]["vulnerabilityScan"]
write("evidence-set-reports-missing-a-kind.json", d3)

# a reportAttestationPair missing its required attestationLookup
d4 = json.loads(json.dumps(base))
del d4["lookups"]["monolithEvidenceSet"]["reports"]["sbom"]["attestationLookup"]
write("evidence-set-pair-missing-attestation-lookup.json", d4)

print("wrote 4 fixtures")
PYEOF
```

- [ ] **Step 2: Add all four to `expectations.json`**

Two of these are caught by `validate()`'s own closed-field-set check on `presentEvidenceSet` (raises `Invalid`, so the decision reaches `UNKNOWN` before ever looking at `reports`' internals). The other two are only caught deeper, inside `evidence_set_problems()`'s per-kind loop, invoked here from `marker_problems()`'s cross-check on `valid/published.json`'s own marker (which claims this exact evidence-set) — that path returns problems rather than raising, so the marker is judged untrustworthy and the decision reaches `CONFLICT`, not `UNKNOWN`. Do not file all four the same way; this split is real, not an inconsistency to paper over.

```bash
"$PYTHON_BIN" - <<'PYEOF'
import json, pathlib
root = pathlib.Path(".github/contracts/fixtures")
exp = json.loads((root / "expectations.json").read_text(encoding="utf-8"))
exp["invalid-structure/evidence-set-missing-subject-matches.json"] = \
    {"schema": "rejects", "state": "UNKNOWN", "actions": []}
exp["invalid-structure/evidence-set-extra-field.json"] = \
    {"schema": "rejects", "state": "UNKNOWN", "actions": []}
exp["invalid-structure/evidence-set-reports-missing-a-kind.json"] = \
    {"schema": "rejects", "state": "CONFLICT", "actions": []}
exp["invalid-structure/evidence-set-pair-missing-attestation-lookup.json"] = \
    {"schema": "rejects", "state": "CONFLICT", "actions": []}
(root / "expectations.json").write_text(json.dumps(exp, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print("updated")
PYEOF
```

- [ ] **Step 3: Run — confirm all four pass with their filed verdicts**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | tail -3
```

Expected: `passed=32 failed=0` (28 from Task 3 + 4 new).

- [ ] **Step 4: Hand-verify attribution for one representative keyword**

```bash
cp .github/contracts/observation.schema.json /tmp/obs-verify-backup.json
```

Remove `"additionalProperties": false` from `presentEvidenceSet` (Task 1), run the suite. Expected: `passed=31 failed=1`, the one failure is `invalid-structure/evidence-set-extra-field.json`, reporting `the schema accepted it; this rule lives only in the decision function` — the decision has no independent check for an unexpected key inside `presentEvidenceSet` (unlike the field-set checks `validate()` does perform), so this keyword is schema-only and this is exactly the shape of gap this step exists to catch. Restore:

```bash
cp /tmp/obs-verify-backup.json .github/contracts/observation.schema.json
"$PUBLISH_DECISION_BASH" .github/scripts/contract-agreement.test.sh 2>&1 | tail -3
```

Expected: `passed=32 failed=0` again.

- [ ] **Step 5: Commit**

```bash
git add .github/contracts/fixtures
git commit -m "contract(ci): let the decision see the evidence set (4/5)

Four witnesses for presentEvidenceSet's own new schema keywords, closing
the gap Task 3's pure migration left open: subjectMatches required, the
object's closed field set, reports' four required kinds, and
reportAttestationPair's two required lookups. Not exhaustive -- covers the
four highest-value gaps a straightforward reading finds, same scope
discipline as commit 1's own per-task witnesses; a whole-branch review is
better positioned to find anything narrower that survives.

Two of the four are UNKNOWN (caught by validate()'s own closed-field-set
check before decide() looks at reports' internals); two are CONFLICT
(caught only inside evidence_set_problems(), invoked here via
marker_problems()'s cross-check on valid/published.json's own marker,
which claims this exact evidence-set) -- verified by running each, not
assumed from the other three tasks' pattern.

passed=32 failed=0. Hand-verified additionalProperties:false on
presentEvidenceSet is load-bearing: removing it reddens exactly
evidence-set-extra-field.json, with the decision reporting the rule lives
only in the schema."
```

---

### Task 5: Mutation rules, full suite sweep, ledger, and push

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: nothing new. This task closes the commit out.

- [ ] **Step 1: Add mutation rules for the new guards**

In `.github/scripts/publish-decision.mutations.py`, find the `MUTATIONS = {` dict and add three entries (placement anywhere inside the dict is fine; grouped here for readability):

```python
    "evidence_set_adopt_ignores_problems": (
        'if set_problems:\n'
        '                # Section 3\'s table: provenance/subject/structure mismatch, or a tag missing any\n'
        '                # kind\'s attestation, is CONFLICT -- never a partial adopt, never a supplemental\n'
        '                # sign to launder an artifact that is already there.\n'
        '                return conflict(f"{image} evidence-set is not adoptable: "\n'
        '                                + "; ".join(set_problems), cleanup_debt)',
        'if False:\n'
        '                return conflict("unreachable", cleanup_debt)'),
    "evidence_set_attestation_pair_unchecked": (
        'if type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present":',
        "if False:"),
    "marker_evidence_set_digest_unchecked": (
        'evidence_set_digest = evidence.get("evidenceSetDigest")\n'
        '        if type(evidence_set_digest) is not dict:',
        'evidence_set_digest = evidence.get("evidenceSetDigest")\n'
        '        if False:'),
```

(Follow the existing dict's exact style: each value is a 2-tuple of `(exact substring to find, replacement)`. Read a few neighboring entries first — some multi-line ones are indentation-sensitive, matching the subject file's own indentation exactly. If a `find` substring does not match on the real subject file byte-for-byte because Task 2 formatted something differently than shown above, adjust the mutation's `find` string to match what Task 2 actually committed, not what changes elsewhere in this plan.)

- [ ] **Step 2: Run the full local suite sweep (excluding the mutation runner)**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
for s in publish-decision contract-agreement contract-agreement.report manifest-agreement \
         canonical envelope interpreter-override require-green-run common-sh-usage \
         evidence-set-schema; do
  echo -n "$s: "
  "$PUBLISH_DECISION_BASH" ".github/scripts/$s.test.sh" 2>&1 | tail -1
done
```

Expected: every suite reports `passed=N failed=0` with no suite's `N` lower than it was after Task 4 (`publish-decision` 191, `contract-agreement` 32, `contract-agreement.report` 7, `manifest-agreement` 15, `canonical` 3, `envelope` 8, `interpreter-override` 11, `require-green-run` 22, `common-sh-usage` 6, `evidence-set-schema` 32).

- [ ] **Step 3: Run the mutation sweep — only now, once**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/publish-decision.mutations.py
```

This takes over 20 minutes; do not run it earlier in this task or in any earlier task. Expected: `all N mutations caught` (N = the pre-existing mutation count plus the 3 added in Step 1). If any mutation survives, read which one — a surviving mutation on a guard this plan added means a fixture claimed to witness that guard does not actually kill it; go back to the relevant task (2 or 4) and fix the fixture, do not weaken or delete the mutation to make it pass.

- [ ] **Step 4: shellcheck over both script directories**

```bash
export PATH="$PATH:/c/Users/Hlow/AppData/Local/Programs/Python/Python312/Scripts"
tmp=$(mktemp -d)
for f in backend/infra/production/scripts/*.sh .github/scripts/*.sh; do
  tr -d '\r' < "$f" > "$tmp/$(basename "$f")"
done
shellcheck --severity=warning -x --source-path="$tmp" "$tmp"/*.sh
```

Expected: no output, exit 0.

- [ ] **Step 5: Update the ledger**

Append to `.superpowers/sdd/progress.md` (gitignored, not committed to the repo):

```
## 3b commit 2: let the decision see the evidence set

Complete (commits <fill in the four short SHAs after committing>).
observation.schema.json's lookups grows 8 -> 10 (monolithEvidenceSet,
frontendEvidenceSet); evidenceSetLookup/presentEvidenceSet/
reportAttestationPair added, loosely typed per spec section 3 (commit 4
gives the four report/attestation pairs their real trust-boundary split).
publish-decision.sh gains evidence_set_problems(), used from decide()'s
no-marker-yet path (adopt/build_new/CONFLICT per image) and from a new
cross-check inside marker_problems() (a marker's evidenceSetDigest claim
must resolve against a clean, matching lookup -- closes spec section 11
witness #1, the self-assertion loophole section 1 names as 3b's whole
reason to exist).

The marker cross-check touches every existing marker-bearing fixture, not
just new ones -- migrated the shared publish-decision.test.sh builders and
the entire contract-agreement.test.sh corpus (25 fixtures widened, 15 of
those plus 2 fully resolved) rather than treating it as collateral damage.
No fixture's proven rule changed; expectations.json itself was untouched
by the migration (git diff --stat confirmed empty).

Final: publish-decision.test.sh 191/0 (181 pre-existing + 10 new), 
contract-agreement.test.sh 32/0 (28 migrated + 4 new witnesses for
presentEvidenceSet's own keywords). Mutation sweep: all N caught (fill in
count after running).

Re-resolve-before-write (spec section 3, witness #9) remains documented
debt -- no writer exists yet to enforce it against. The four report/
attestation pairs stay loosely typed. Tag policy stays out of scope.

Next: 3b commit 3, "freeze what the scanners are and what they scan"
(spec section 7) -- scanner provenance split between vuln/secret scans,
extraction method, byte cap. Then commit 4 (the real report/attestation
trust-boundary split this commit's loose typing defers), commit 5 (verdict
recompute), commit 6 (stop trusting a SBOM for a verdict it doesn't make),
commit 7 (attestation selection by tuple). Then 3a commit 6 (freeze the
payload), then the collector, then the publish job.
```

- [ ] **Step 6: Commit, push, and read CI**

```bash
git add .github/scripts/publish-decision.mutations.py
git commit -m "contract(ci): let the decision see the evidence set (5/5)

Three new mutation rules for evidence_set_problems() and the marker
evidenceSetDigest cross-check -- all N mutations caught (fill in from the
sweep's own output). Full local suite sweep clean at or above every prior
baseline. shellcheck clean over both script directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then `gh run watch <id> --exit-status`), and separately confirm CI actually exercised the changed suites rather than merely reporting green:

```bash
gh run view <run-id> --log 2>/dev/null | grep -iE "publish-decision\.test|contract-agreement\.test|passed="
```

Expected to see `passed=191 failed=0` and `passed=32 failed=0` attributed to `publish-decision.test.sh`'s and `contract-agreement.test.sh`'s own output lines in the CI log, not merely inferred from an overall green checkmark.

---

## Self-Review

**Spec coverage** — spec §3 line by line against Tasks 1-4 (Task 5 is process-only: mutation rules, the full sweep, the ledger, and the push — it implements no new spec requirement):
- Two new top-level lookups (8→10) → Task 1.
- `evidenceSetLookup` = present/absent(404)/error, and at present proves tag-resolves/carrier-exists/subject-correct/four-layers-correct/reports-are-members → Task 1's `presentEvidenceSet` (the "reports are members, not floating blobs" half is a collector-side guarantee this schema's `reports` pairs assume rather than re-derive, same as `layersValid` assumes `release-evidence-set.schema.json`'s own shape rather than re-parsing raw bytes — documented in Task 1's Step 2 description).
- Four report/attestation pairs inside `evidenceSetLookup.present`, not in the marker → Task 1.
- Adopt = no re-scan + re-verify + missing attestation ⇒ CONFLICT, never supplemental signing → Task 2's `evidence_set_problems()` and `decide()` rewrite.
- "Tag tồn tại nhưng khác" table (no tag/adoptable/mismatch/error → create/adopt/CONFLICT/UNKNOWN) → Task 2.
- Re-resolve tag before writing → explicitly out of scope, documented debt (Global Constraints, Task 1's schema header would be the natural place — confirm this landed in the `presentEvidenceSet` description during Task 1, not merely in this plan).
- Marker's `evidenceSetDigest` under `evidence`, cross-checked not self-verified → Task 1 (schema) + Task 2 (`marker_problems()` cross-check) + Task 3 (migrating every existing marker fixture onto it).
- Spec §11 witnesses touched by this commit: #1 (self-assertion closed) → Task 2. #4 (lookup error doesn't leak into marker-read errors) → already covered by the existing top-of-`decide()` error gate, extended automatically to the two new lookups, confirmed by the "evidence-set lookup error surfaces through the same UNKNOWN gate" case in Task 2. #5 (adopt when evidence-set present + marker absent + provenance matches) → Task 2. #8 (missing attestation ⇒ CONFLICT, no supplemental sign) → Task 2. #9 (tag re-resolve) → explicitly not witnessed, documented gap.

**Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" anywhere in the tasks above; every fixture is complete JSON or a complete, runnable script; every code change is shown in full, not described.

**Type consistency** — `evidence_set_problems(lookup, obs, where)`'s signature is identical everywhere it's called (Task 2's two call sites, Task 4's hand-verification prose). `EVIDENCE_SET_LOOKUPS`, `MONO_ES`/`FRONT_ES`, `present_mono_es`/`present_front_es` are named identically across Task 2's steps. The `RESOLVE` set in Task 3 (`{"valid/prepared-only.json", "valid/published.json"}`) is the same two files Task 4 builds its witnesses from.

**Known, deliberate gaps carried forward** (not to be rediscovered as if new): re-resolve-before-write has no fixture (Decision 1, no writer exists yet); the four report/attestation pairs stay loosely typed (Decision 2, commit 4's job); Task 4's four witnesses are not exhaustive coverage of every `presentEvidenceSet` leaf keyword (a whole-branch review, following commit 1's own precedent, is the right place to find what a straightforward per-task pass misses — expect this, don't be surprised by it).
