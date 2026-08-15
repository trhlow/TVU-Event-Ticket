# Release manifest contract — 3a commit 5b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the decision judge the *shape* of the OCI manifest a marker travelled in, so that every choice OCI leaves optional is pinned to one value and one payload.

**Architecture:** A new contract file `release-envelope.schema.json` holds four `$defs`; `observation.schema.json` stops carrying its own copy of the envelope shape and `$ref`s into it. The decision gains fourteen guards — eight table-driven constant comparisons, four structural rules, two payload-binding rules — each with its own witness and its own mutation. A new suite `manifest-agreement.test.sh` holds the three statements of the constants to each other.

**Tech Stack:** bash + embedded Python 3.12, JSON Schema 2020-12, `jsonschema==4.26.0`, `referencing==0.37.0`.

## Global Constraints

- Spec: `backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md`, sections 2, 5.6, 5.7, 5.8, 7, 9, 10. Read them before Task 1.
- Branch `ci/ghcr-publish`. Base commit: `ec99f47`.
- **`PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"` must be exported** before running any suite on this workstation. Bare `bash` is WSL's and cannot exec the interpreter; without it `contract-agreement.test.sh` reports 3/21 and the mutation runner refuses every run.
- `PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python`.
- **The mutation runner's only meaningful output is the line `all N mutations caught`.** `publish-decision.mutations.test.sh` tests the *runner*, not the mutations; it is green while the runner correctly refuses a red baseline. Never record it as evidence that mutations ran.
- **Every witness that mutates `raw` must recompute `markerDigest` from its own mutated `raw`** (spec §5.2) and set `verification.subjectDigest` to match. Change `raw` without recomputing and the digest-equality guard refuses the observation first: right verdict, wrong rule, and the new guard stays deletable with the suite green.
- `shellcheck` **is** installed (`.../Python312/Scripts/shellcheck`). Before pushing, lint `tr -d '\r'` copies: the working tree is CRLF, so an unstripped run reports SC1017 on every line and says nothing about CI.
- **No commit may leave the tree red.** Observe RED, then fix; record the RED in the commit body.
- No Flyway checksum may move. A moved checksum is the signal this stopped being a shape change.
- GitNexus indexes neither `.github` nor any `.py`/`.sh`/JSON file here. `impact` and `detect_changes` cannot speak about any file this plan touches; `changed=0` after these commits is correct, not a failure.
- Do not merge PR #23. Do not run `git commit --amend --no-verify`.

## File Structure

| File | Responsibility |
|---|---|
| `.github/contracts/release-envelope.schema.json` | **Create.** Four `$defs`: `rawEnvelope`, `observedEnvelope`, `markerEnvelope`, `constants`. |
| `.github/contracts/observation.schema.json` | **Modify.** `$defs/ociManifest` and `$defs/ociEnvelope` are deleted; `presentMarker.ociEnvelope` `$ref`s the new file. |
| `.github/scripts/envelope.py` | **Modify.** Three constants join `__all__`. No value changes. |
| `.github/scripts/publish-decision.sh` | **Modify.** The constants table, the structural guards, the binding guards, and the hoisted self-contradiction check. |
| `.github/scripts/publish-decision.test.sh` | **Modify.** Five new escapes, fifteen new or rewritten cases. |
| `.github/scripts/publish-decision.mutations.py` | **Modify.** Fourteen new entries; two re-anchored. |
| `.github/scripts/manifest-agreement.test.sh` | **Create.** The two checks of spec §9 that are checkable at 5b. |
| `.github/workflows/ci.yml` | **Modify.** Runs the new suite, in the same commit that creates it. |

---

### Task 1: The envelope schema file, and the observation pointing at it

**Files:**
- Create: `.github/contracts/release-envelope.schema.json`
- Modify: `.github/contracts/observation.schema.json`
- Test: `.github/scripts/contract-agreement.test.sh` (run only — no edits)

**Interfaces:**
- Produces: `release-envelope.schema.json` with `$id` `https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/release-envelope.schema.json` and `$defs` named exactly `rawEnvelope`, `observedEnvelope`, `markerEnvelope`, `constants`. Task 5 reads `$defs/constants` by those names.

- [ ] **Step 1: Read what is being moved**

Run:
```bash
cd /d/TVU-Event-Ticket/.github/contracts
python -c "
import json
s = json.load(open('observation.schema.json'))
print(json.dumps(s['\$defs']['ociEnvelope'], indent=2))
print(json.dumps(s['\$defs']['ociManifest'], indent=2))
"
```

Both blocks move **verbatim**, descriptions included. They are not rewritten here: a move and an edit in one step means a later reviewer cannot tell which one changed behaviour.

- [ ] **Step 2: Create `release-envelope.schema.json`**

`rawEnvelope` is the current `ociManifest` body verbatim. `observedEnvelope` is the current `ociEnvelope` body verbatim except that its `raw.$ref` changes from `#/$defs/ociManifest` to `#/$defs/rawEnvelope`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/release-envelope.schema.json",
  "title": "The OCI manifest a release marker travels in",
  "description": "Three descriptions of one artifact and the constants they share. rawEnvelope is what the registry holds, observedEnvelope is what a collector reports about it, markerEnvelope is what the publish job is allowed to push. They are deliberately not one schema: a schema that both describes bad bytes and constrains good ones says nothing precise about either.",
  "$defs": {
    "rawEnvelope": { "COPY": "the current observation.schema.json#/$defs/ociManifest, unchanged" },
    "observedEnvelope": { "COPY": "the current observation.schema.json#/$defs/ociEnvelope, with raw.$ref pointing at #/$defs/rawEnvelope" },
    "constants": {
      "description": "The single documentary source of every value section 2 pins. Not loaded at runtime: envelope.py states them in Python and publish-decision.sh imports them from there, because the decision must run without the contracts directory beside it and because the mutation runner copies only the scripts. manifest-agreement.test.sh is what holds the three statements together; see spec section 9.",
      "type": "object",
      "additionalProperties": false,
      "required": ["manifestMediaType", "artifactType", "emptyConfig", "predicateTypes"],
      "properties": {
        "manifestMediaType": { "const": "application/vnd.oci.image.manifest.v1+json" },
        "artifactType": { "const": "application/vnd.tvu.release-manifest.v1+json" },
        "emptyConfig": {
          "type": "object",
          "additionalProperties": false,
          "required": ["mediaType", "digest", "size", "data"],
          "properties": {
            "mediaType": { "const": "application/vnd.oci.empty.v1+json" },
            "digest": { "const": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" },
            "size": { "const": 2 },
            "data": { "const": "e30=" }
          }
        },
        "predicateTypes": {
          "type": "object",
          "additionalProperties": false,
          "required": ["markerProvenance", "sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"],
          "properties": {
            "markerProvenance": { "const": "https://slsa.dev/provenance/v1" },
            "sbom": { "const": "https://spdx.dev/Document/v2.3" },
            "vulnerabilityScan": { "const": "https://evts.id.vn/attestations/vulnerabilityScan/v1" },
            "layerSecretScan": { "const": "https://evts.id.vn/attestations/layerSecretScan/v1" },
            "filesystemSecretScan": { "const": "https://evts.id.vn/attestations/filesystemSecretScan/v1" }
          }
        }
      }
    },
    "markerEnvelope": {
      "description": "What the publish job must build before it pushes. Nothing validates against this yet -- the producer does not exist, and inventing a consumer so the schema has work to do would measure the consumer. Its constant half is held by the drift check in manifest-agreement.test.sh; its structural half -- the exact field sets, the forbidden subject, the forbidden annotations -- is a debt the publish job's commit pays. Spec section 7.",
      "type": "object",
      "additionalProperties": false,
      "required": ["schemaVersion", "mediaType", "artifactType", "config", "layers"],
      "properties": {
        "schemaVersion": { "const": 2 },
        "mediaType": { "$ref": "#/$defs/constants/properties/manifestMediaType" },
        "artifactType": { "$ref": "#/$defs/constants/properties/artifactType" },
        "config": { "$ref": "#/$defs/constants/properties/emptyConfig" },
        "layers": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["mediaType", "digest", "size"],
            "properties": {
              "mediaType": { "$ref": "#/$defs/constants/properties/artifactType" },
              "digest": { "$ref": "./observation.schema.json#/$defs/digest" },
              "size": { "type": "integer", "minimum": 0 }
            }
          }
        }
      }
    }
  }
}
```

Replace the two `"COPY"` placeholders with the actual blocks read in Step 1. **A `"COPY"` string left in the file is a plan failure, not a shortcut** — the schema would accept anything.

Note the `./observation.schema.json#/$defs/digest` reference: it points *back*, which is what makes the registry from commit `75f30f7` load-bearing in both directions.

- [ ] **Step 3: Point the observation at it and delete its copies**

In `observation.schema.json`, delete `$defs/ociManifest` and `$defs/ociEnvelope` entirely, then change the `ociEnvelope` property of `presentMarker` from `{"$ref": "#/$defs/ociEnvelope"}` to:

```json
{ "$ref": "release-envelope.schema.json#/$defs/observedEnvelope" }
```

Keep any sibling `description` the property already carries.

- [ ] **Step 4: RED — prove the reference is actually followed**

Temporarily change that `$ref` to `release-envelope.schema.json#/$defs/noSuchDef` and run:

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
bash .github/scripts/contract-agreement.test.sh
```

Expected: failures naming an unresolvable reference — **not** a green run. A green run here means the `$ref` is being ignored and every envelope rule in this plan is decorative. If it comes back green, stop and report: the registry is not wired the way `75f30f7` claims.

Restore the correct `$ref`.

- [ ] **Step 5: GREEN**

```bash
bash .github/scripts/contract-agreement.test.sh
bash .github/scripts/contract-agreement.report.test.sh
bash .github/scripts/publish-decision.test.sh
```

Expected: `contract-agreement` 24/0 (unchanged — the shape it validates is identical, only its address changed), `report` 7/0, `publish-decision` 158/0.

- [ ] **Step 6: Commit**

```bash
git add .github/contracts/
git commit -m "contract(ci): give the envelope a schema of its own"
```

Body must record: what moved verbatim, that the observation now `$ref`s rather than copies, that `markerEnvelope` ships without a validator and why, and the result of the Step 4 RED.

---

### Task 2: Restore the two guards 5b is about to blind (spec §5.8)

**Files:**
- Modify: `.github/scripts/publish-decision.sh` (the block at `:565`–`:578`)
- Modify: `.github/scripts/publish-decision.test.sh` (the case at `:426`, the case at `:434`)
- Modify: `.github/scripts/publish-decision.mutations.py` (`marker_fork_ignored`, `same_digest_different_content`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a decision in which "same digest, different content" answers **UNKNOWN** and "different artifacts" answers **CONFLICT**. Tasks 3 and 4 rely on those being two different verdicts.

This task runs **before** any shape guard exists, so its RED is attributable to it alone. Doing it after Task 3 means two changes competing for the same red lines — the condition that produced seven vacuous witnesses in this project already.

- [ ] **Step 1: Understand why the current isolation dies**

Read `publish-decision.sh:565`. The final/prepared comparison runs only `if not final_problems and not prepared_problems`. Task 3 makes a `subject` in `raw` a problem, so the case at `:426` — which isolates the identity guard using `_envelope_subject` — will route around the guard entirely and still print CONFLICT. Green, and proving nothing.

Task 4 then makes `:576` unreachable outright: with payload binding in force, two problem-free markers sharing a digest share a raw, hence a layer digest, hence a content. No verdict split rescues it while it sits behind that gate.

- [ ] **Step 2: Hoist the self-contradiction check and change its verdict**

An observation claiming one digest for two different payloads cannot be reasoned about at all, so it is UNKNOWN by spec §8 invariant 5 — the guard's own comment already says "the observation contradicts itself". Being unusable does not depend on either marker being otherwise well formed, so it is checked before the problem gate rather than behind it.

Replace lines 565–578 of `publish-decision.sh` with:

```python
    # Checked before the problem gate below, not inside it. An observation naming one digest for two
    # different payloads is unusable whatever else is wrong with it, and once payload binding is in
    # force no problem-free pair can reach a comparison placed behind that gate -- the rule would be
    # unreachable rather than merely unwitnessed. UNKNOWN, not CONFLICT: nothing here can choose
    # which half of a self-contradicting observation to believe, and that is the collector's problem
    # to re-run, not an operator's to adjudicate.
    if final_present and prepared_present and "content" in final and "content" in prepared:
        require(final["markerDigest"] != prepared["markerDigest"]
                or canonical_bytes(final["content"]) == canonical_bytes(prepared["content"]),
                f"final and prepared markers share digest {final['markerDigest']} but their "
                f"content differs; the observation contradicts itself")

    if final_present and prepared_present and not final_problems and not prepared_problems:
        # Promotion re-tags one artifact, so the final and prepared markers are the same object
        # under two names. Comparing only content.images accepted two genuinely different artifacts
        # that happen to agree about the images -- with different evidence, or a different
        # inventory, or signed at different times.
        if final["markerDigest"] != prepared["markerDigest"]:
            return conflict(f"final marker {final['markerDigest']} and prepared marker "
                            f"{prepared['markerDigest']} are different artifacts", cleanup_debt)
```

The `"content" in` tests are required: after 5a a marker whose envelope forbids a payload legitimately has no `content`, and indexing it would crash rather than decide.

- [ ] **Step 3: Re-witness both guards**

In `publish-decision.test.sh`, replace the case at `:426` and its comment block (lines 408–426) with:

```bash
# Two markers that are genuinely different artifacts. Each is internally consistent -- its own
# content, its own envelope derived from that content, its own digest recomputed from that envelope
# -- so neither carries a problem and the comparison gate above is open. The digests differ because
# the contents do, which after the shape guards is the only way two valid envelopes can differ at
# all, and the artefact-identity guard is the only rule left that can answer.
#
# The previous witness used `_envelope_subject` and stopped working the moment a subject became a
# problem: the marker turned untrustworthy, the gate closed, and CONFLICT arrived from a different
# rule while the suite stayed green.
assert_decision "final and prepared are different artifacts" \
  "$(observation "$(marker)" "$(marker '{"content":{"environment":"staging"}}')" \
     "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  CONFLICT '[]' false false
```

Then change the expected state of the case at `:434` (`same marker digest but different content`) from `CONFLICT` to `UNKNOWN`, and extend its comment with a sentence saying the verdict moved because a self-contradicting observation is unusable rather than adjudicable.

> `marker '{"content": ...}'` merges **after** the envelope is derived, so that case keeps the unmutated digest beside mutated content — which is exactly the contradiction it witnesses. The new case above must instead reach the harness path that re-derives; confirm by reading `publish-decision.test.sh:100-106` before writing it, and if the merge order means the digest is not recomputed, add an explicit `_content_before_envelope` escape rather than typing a digest by hand.

- [ ] **Step 4: RED**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
bash .github/scripts/publish-decision.test.sh
```

Run this **after editing the tests but before editing the decision**, by stashing the decision change. Expected: exactly two failures — the renamed identity case, and `same marker digest but different content` reporting CONFLICT where UNKNOWN was asked for. Any third failure is collateral and must be understood before continuing.

- [ ] **Step 5: GREEN, and prove each guard is individually deletable-into-red**

```bash
bash .github/scripts/publish-decision.test.sh
```
Expected: 158/0.

Then, by hand, twice:
1. Replace the hoisted `require(...)` condition with `require(True, "x")` → expect exactly 1 failure, `same marker digest but different content`.
2. Replace `if final["markerDigest"] != prepared["markerDigest"]:` with `if False:` → expect exactly 1 failure, `final and prepared are different artifacts`.

If either deletion leaves the suite green, the witness is vacuous and the task is not done. Restore after each.

- [ ] **Step 6: Re-anchor the mutations**

In `publish-decision.mutations.py`, `marker_fork_ignored` keeps its anchor. Replace `same_digest_different_content` with:

```python
    "self_contradicting_observation_ignored": (
        'require(final["markerDigest"] != prepared["markerDigest"]',
        "require(True,  # "),
```

Verify the anchor string appears exactly once in the subject; a `STALE` report means it does not.

- [ ] **Step 7: Run the mutation runner**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
python .github/scripts/publish-decision.mutations.py
```
Expected final line: `all 48 mutations caught`. Anything else — including a refused red baseline — is a failure, not a note.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/publish-decision.sh .github/scripts/publish-decision.test.sh .github/scripts/publish-decision.mutations.py
git commit -m "contract(ci): tell a contradictory observation from a forked one"
```

---

### Task 3: The twelve shape guards of section 2

**Files:**
- Modify: `.github/scripts/envelope.py` (`__all__` only)
- Modify: `.github/scripts/publish-decision.sh`
- Modify: `.github/scripts/publish-decision.test.sh`
- Modify: `.github/scripts/publish-decision.mutations.py`

**Interfaces:**
- Consumes: `envelope.MANIFEST_MEDIA_TYPE`, `ARTIFACT_TYPE`, `EMPTY_CONFIG_MEDIA_TYPE`, `EMPTY_CONFIG_DIGEST`, `EMPTY_CONFIG_SIZE`, `EMPTY_CONFIG_DATA`.
- Produces: `ENVELOPE_CONSTANTS`, `CONFIG_FIELDS`, `LAYER_FIELDS`, `at_path`, `MISSING` in `publish-decision.sh`. Task 4 appends to the same guard block. Task 5 reads `ENVELOPE_CONSTANTS` by name.

- [ ] **Step 1: Widen `envelope.py`'s `__all__`**

```python
__all__ = ["envelope_for", "marker_digest",
           "MANIFEST_MEDIA_TYPE", "ARTIFACT_TYPE",
           "EMPTY_CONFIG_MEDIA_TYPE", "EMPTY_CONFIG_DIGEST",
           "EMPTY_CONFIG_SIZE", "EMPTY_CONFIG_DATA"]
```

No value changes. The decision is about to import all six, and the three that were outside `__all__` were the reason the 5a review warned that 5b might restate them instead.

- [ ] **Step 2: Write the twelve failing cases**

In `publish-decision.test.sh`, add these escapes beside the existing `_envelope_*` block (after `_envelope_subject`, before `def merge`):

```python
# Section 2 pins every choice OCI leaves optional, so each of these produces a manifest that is
# structurally fine and forbidden. Each recomputes the digest from its own mutated raw: without
# that, the digest-equality guard from 5a refuses the observation first and the rule the case was
# written for is never consulted.
def _reseal(base):
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]

if "_envelope_const" in overrides:
    path, value = overrides.pop("_envelope_const")
    node = base["ociEnvelope"]["raw"]
    for step in path[:-1]:
        node = node[step]
    node[path[-1]] = value
    _reseal(base)
if "_envelope_extra_field" in overrides:
    # An extra key in a descriptor whose field set section 2 closes.
    where, key = overrides.pop("_envelope_extra_field")
    node = base["ociEnvelope"]["raw"]["config"] if where == "config" \
        else base["ociEnvelope"]["raw"]["layers"][0]
    node[key] = "extra"
    _reseal(base)
if "_envelope_annotations" in overrides:
    # Forbidden by absence of the key, not by an empty object: the two spellings are different bytes
    # and therefore different digests, so "empty or absent" would not be one rule.
    level = overrides.pop("_envelope_annotations")
    raw_manifest = base["ociEnvelope"]["raw"]
    node = {"manifest": raw_manifest, "config": raw_manifest["config"],
            "layer": raw_manifest["layers"][0]}[level]
    node["annotations"] = {"org.opencontainers.image.created": "2026-08-05T00:00:00Z"}
    _reseal(base)
```

Then add the cases, in a new section near the other envelope cases:

```bash
echo
echo "== the envelope is the one shape section 2 allows"
# Each constant is its own case because each is its own line in ENVELOPE_CONSTANTS. A single case
# for "the config is wrong" would leave three of the four config constants with no evidence that
# anything depends on them.
assert_decision "an envelope declaring the wrong schemaVersion" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["schemaVersion"], 3]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope declaring the wrong manifest mediaType" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["mediaType"], "application/vnd.docker.distribution.manifest.v2+json"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope declaring the wrong artifactType" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["artifactType"], "application/vnd.example.other.v1+json"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose config is not the empty config" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["config", "mediaType"], "application/vnd.oci.image.config.v1+json"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose config digest names other bytes" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["config", "digest"], "sha256:8888888888888888888888888888888888888888888888888888888888888888"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose config size is not two" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["config", "size"], 3]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose config carries other embedded data" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["config", "data"], "eyJhIjoxfQ=="]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose layer declares the wrong mediaType" \
  "$(observation "$absent_release" "$(marker '{"_envelope_const": [["layers", 0, "mediaType"], "application/octet-stream"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose config carries a field section 2 closes out" \
  "$(observation "$absent_release" "$(marker '{"_envelope_extra_field": ["config", "urls"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope whose layer carries a field section 2 closes out" \
  "$(observation "$absent_release" "$(marker '{"_envelope_extra_field": ["layer", "urls"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
# One case per level. oras push writes a layer title and the ORAS docs show a manifest created
# timestamp, so two of these three are what the tool does by default rather than hypotheticals.
assert_decision "an envelope annotated at the manifest level" \
  "$(observation "$absent_release" "$(marker '{"_envelope_annotations": "manifest"}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope annotated at the config level" \
  "$(observation "$absent_release" "$(marker '{"_envelope_annotations": "config"}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "an envelope annotated at the layer level" \
  "$(observation "$absent_release" "$(marker '{"_envelope_annotations": "layer"}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
```

And flip the tripwire — find the case named `a raw carrying a subject is not yet judged`, rename it and change its expectation:

```bash
# A marker is the root of a release, so it hangs under nothing. (3b's evidence set is the opposite
# and deliberately so: it hangs under the image it describes.) This case asserted PARTIAL until this
# commit, as a tripwire -- it flipping to CONFLICT is how the subject guard proves it is wired.
assert_decision "a raw carrying a subject" \
  "$(observation "$absent_release" "$(marker '{"_envelope_subject": true}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
```

- [ ] **Step 3: Run to verify they fail**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
bash .github/scripts/publish-decision.test.sh
```

Expected: **exactly 14 failures** (13 new cases + the flipped tripwire), all reporting PARTIAL where CONFLICT was asked for. A case failing with UNKNOWN instead means its escape broke the observation rather than the envelope — fix the escape, not the expectation.

- [ ] **Step 4: Implement the table and the structural guards**

At module level in `publish-decision.sh`, beside the other constants, extend the import and add:

```python
from envelope import (ARTIFACT_TYPE, EMPTY_CONFIG_DATA, EMPTY_CONFIG_DIGEST,
                      EMPTY_CONFIG_MEDIA_TYPE, EMPTY_CONFIG_SIZE, MANIFEST_MEDIA_TYPE)

# One rule per line, so deleting one is one mutation with one witness. Folding the four config
# constants behind a single comparison would let one witness redden the deletion of all four, and
# three of them would then have no evidence that anything depends on them -- the same defect this
# suite has already been repaired for seven times, one level finer.
ENVELOPE_CONSTANTS = (
    (("schemaVersion",), 2),
    (("mediaType",), MANIFEST_MEDIA_TYPE),
    (("artifactType",), ARTIFACT_TYPE),
    (("config", "mediaType"), EMPTY_CONFIG_MEDIA_TYPE),
    (("config", "digest"), EMPTY_CONFIG_DIGEST),
    (("config", "size"), EMPTY_CONFIG_SIZE),
    (("config", "data"), EMPTY_CONFIG_DATA),
    (("layers", 0, "mediaType"), ARTIFACT_TYPE),
)
CONFIG_FIELDS = frozenset({"mediaType", "digest", "size", "data"})
LAYER_FIELDS = frozenset({"mediaType", "digest", "size"})
# A sentinel rather than None: a manifest may legitimately hold a null somewhere, and "absent" and
# "present and null" are different findings.
MISSING = object()


def at_path(node, path):
    """The value at a path in a raw manifest, or MISSING if any step of it is not there."""
    for step in path:
        if type(step) is int:
            if type(node) is not list or len(node) <= step:
                return MISSING
        elif type(node) is not dict or step not in node:
            return MISSING
        node = node[step]
    return node
```

Then in `marker_problems`, inside the branch where all three flags are true — immediately after the existing `if not one_layer:` block — add:

```python
        # Only once raw has been shown to be the bytes it names is there any point judging its
        # shape: a raw that fails that is a retyping, and the shape of a retyping is not evidence
        # about the artifact.
        raw_manifest = envelope["raw"]
        for path, expected in ENVELOPE_CONSTANTS:
            found = at_path(raw_manifest, path)
            if found is MISSING or type(found) is not type(expected) or found != expected:
                shown = "absent" if found is MISSING else repr(found)
                problems.append(f"{where} envelope {'.'.join(str(s) for s in path)} is {shown}, "
                                f"not {expected!r}")
        config = raw_manifest.get("config")
        if type(config) is dict and set(config) != CONFIG_FIELDS:
            problems.append(f"{where} envelope config declares {sorted(config)}, not "
                            f"{sorted(CONFIG_FIELDS)}")
        if one_layer and type(layers[0]) is dict and set(layers[0]) != LAYER_FIELDS:
            problems.append(f"{where} envelope layer declares {sorted(layers[0])}, not "
                            f"{sorted(LAYER_FIELDS)}")
        # A marker is the root of a release, so it hangs under nothing. 3b's evidence set carries a
        # subject on purpose; do not generalise this rule to it.
        if "subject" in raw_manifest:
            problems.append(f"{where} envelope carries a subject; a marker hangs under nothing")
        # Forbidden by the key being absent, not by it being empty: {} and no key at all are
        # different bytes and therefore different digests, so "empty or absent" is two artifacts.
        for level, node in (("manifest", raw_manifest), ("config", config),
                            ("layer", layers[0] if one_layer else None)):
            if type(node) is dict and "annotations" in node:
                problems.append(f"{where} envelope carries annotations at the {level} level")
```

`type(found) is not type(expected)` is not redundant with `!=`: `True == 1` in Python, so without it a `schemaVersion` of `True` would satisfy a constant of `1`, and a boolean where an integer belongs is exactly the kind of thing `schema-version-is-boolean.json` exists to catch elsewhere.

- [ ] **Step 5: Run to verify they pass**

```bash
bash .github/scripts/publish-decision.test.sh
```
Expected: `passed=171 failed=0` (158 + 13). Report the measured number; do not assume it.

```bash
bash .github/scripts/contract-agreement.test.sh
```
Expected: 24/0. A change here means a fixture's envelope violates section 2, which is a finding about the fixture and must be reported before it is fixed.

- [ ] **Step 6: Add the twelve mutations**

In `publish-decision.mutations.py`:

```python
    "envelope_constants_unchecked": (
        "        for path, expected in ENVELOPE_CONSTANTS:", "        for path, expected in ():"),
    "envelope_schema_version_unpinned": (
        '    (("schemaVersion",), 2),', ""),
    "envelope_manifest_media_type_unpinned": (
        '    (("mediaType",), MANIFEST_MEDIA_TYPE),', ""),
    "envelope_artifact_type_unpinned": (
        '    (("artifactType",), ARTIFACT_TYPE),', ""),
    "envelope_config_media_type_unpinned": (
        '    (("config", "mediaType"), EMPTY_CONFIG_MEDIA_TYPE),', ""),
    "envelope_config_digest_unpinned": (
        '    (("config", "digest"), EMPTY_CONFIG_DIGEST),', ""),
    "envelope_config_size_unpinned": (
        '    (("config", "size"), EMPTY_CONFIG_SIZE),', ""),
    "envelope_config_data_unpinned": (
        '    (("config", "data"), EMPTY_CONFIG_DATA),', ""),
    "envelope_layer_media_type_unpinned": (
        '    (("layers", 0, "mediaType"), ARTIFACT_TYPE),', ""),
    "envelope_config_field_set_open": (
        "        if type(config) is dict and set(config) != CONFIG_FIELDS:", "        if False:"),
    "envelope_layer_field_set_open": (
        "        if one_layer and type(layers[0]) is dict and set(layers[0]) != LAYER_FIELDS:",
        "        if False:"),
    "envelope_subject_allowed": (
        '        if "subject" in raw_manifest:', "        if False:"),
    "envelope_annotations_allowed": (
        '            if type(node) is dict and "annotations" in node:', "            if False:"),
```

That is thirteen entries: one per constant, one for the loop itself, and one per structural rule. The loop entry matters — without it, deleting the whole loop is caught only incidentally.

- [ ] **Step 7: Run the mutation runner**

```bash
python .github/scripts/publish-decision.mutations.py
```

Expected final line: `all 61 mutations caught` (48 + 13). Each per-constant mutation must redden **exactly one** case — its own. If one reddens two, two witnesses are answering for one rule and one of them is vacuous; report which, do not paper over it.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/
git commit -m "contract(ci): pin every choice OCI leaves to the producer"
```

Body records: the measured suite count, `all 61 mutations caught`, the tripwire flip, and that no Flyway checksum moved.

---

### Task 4: Payload binding (spec §5.7)

**Files:**
- Modify: `.github/scripts/publish-decision.sh`
- Modify: `.github/scripts/publish-decision.test.sh`
- Modify: `.github/scripts/publish-decision.mutations.py`

**Interfaces:**
- Consumes: `at_path`, the guard block from Task 3, `canonical_bytes`.
- Produces: nothing later tasks read.

Invariant 4 claims the collector verifies payload binding, and nothing ever has. With section 2 closing the layer's field set, `digest` and `size` are the only free fields left in the manifest — and they are exactly what ties the envelope to the document the decision goes on to read.

- [ ] **Step 1: Write the two failing cases**

Escape, beside the others:

```python
if "_envelope_layer_field" in overrides:
    # The layer descriptor stops describing the payload. Everything else stays canonical, so the
    # only rule that can answer is the one binding the envelope to its content.
    field, value = overrides.pop("_envelope_layer_field")
    base["ociEnvelope"]["raw"]["layers"][0][field] = value
    _reseal(base)
```

Cases:

```bash
# The envelope and the payload stop being about each other. Without these two rules the manifest is
# canonical, the digest is honest, and the content underneath it is whatever the collector felt
# like reporting -- which is what invariant 4 claimed was verified and never was.
assert_decision "a layer digest naming bytes other than the payload" \
  "$(observation "$absent_release" "$(marker '{"_envelope_layer_field": ["digest", "sha256:9999999999999999999999999999999999999999999999999999999999999999"]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
assert_decision "a layer size that is not the payload's size" \
  "$(observation "$absent_release" "$(marker '{"_envelope_layer_field": ["size", 999999]}')" \
     "$absent_mono" "$absent_fe")" CONFLICT '[]' false false
```

- [ ] **Step 2: Run to verify they fail**

Expected: exactly 2 failures, both PARTIAL where CONFLICT was asked for.

- [ ] **Step 3: Implement**

Append to the same guard block in `marker_problems`, after the annotations loop, inside the branch that already knows `content` is present:

```python
        # Two rules, not one, for the same reason digestVerified and sizeVerified are two booleans:
        # a size is checked to bound a download and a digest is checked to identify what arrived.
        if one_layer and "content" in marker and type(layers[0]) is dict:
            payload = canonical_bytes(marker["content"])
            payload_digest = "sha256:" + hashlib.sha256(payload).hexdigest()
            if layers[0].get("digest") != payload_digest:
                problems.append(f"{where} envelope layer names {layers[0].get('digest')!r} but the "
                                f"content hashes to {payload_digest}")
            if layers[0].get("size") != len(payload):
                problems.append(f"{where} envelope layer declares size {layers[0].get('size')!r} "
                                f"but the content is {len(payload)} bytes")
```

- [ ] **Step 4: Run to verify they pass**

```bash
bash .github/scripts/publish-decision.test.sh
bash .github/scripts/contract-agreement.test.sh
```
Expected: 173/0 and 24/0. If any fixture now fails, its envelope was never bound to its content — report it as a finding about the fixture before touching anything.

- [ ] **Step 5: Confirm the hoist from Task 2 held**

```bash
bash .github/scripts/publish-decision.test.sh 2>&1 | grep "same marker digest but different content"
```
Expected: passing, still UNKNOWN. This is the one measurement that proves Task 2 was necessary: with the check left behind the problem gate, payload binding would have taken this case over and the rule would be unreachable, not merely unwitnessed.

- [ ] **Step 6: Add the two mutations**

```python
    "payload_binding_digest_unchecked": (
        '            if layers[0].get("digest") != payload_digest:', "            if False:"),
    "payload_binding_size_unchecked": (
        '            if layers[0].get("size") != len(payload):', "            if False:"),
```

- [ ] **Step 7: Run the mutation runner**

Expected final line: `all 63 mutations caught`.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/
git commit -m "contract(ci): tie the envelope to the payload it claims to carry"
```

---

### Task 5: `manifest-agreement.test.sh`, and CI running it

**Files:**
- Create: `.github/scripts/manifest-agreement.test.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `release-envelope.schema.json#/$defs/constants` (Task 1), `envelope.py`'s constants (Task 3), `ENVELOPE_CONSTANTS` in `publish-decision.sh` (Task 3).

Spec §9 states four things the suite must prove. Items 1 and 2 concern `release-manifest.schema.json`, which commit 6 creates; only items 3 and 4 are checkable now. **The suite must not pretend otherwise** — a stub asserting `True` for items 1 and 2 is a green line that means nothing.

The schema file and the script must land with the workflow change **in one commit**. A suite nobody runs checks nothing.

- [ ] **Step 1: Write the suite**

Model it on `contract-agreement.test.sh`: same `script_dir`/`repo_root` preamble, same `python-bin.sh` sourcing, same refusal to skip when a dependency is missing. Two checks:

**Check 1 — the constants do not drift.** Load `$defs/constants` from `release-envelope.schema.json`, import `envelope.py`, and parse `ENVELOPE_CONSTANTS` out of `publish-decision.sh` by executing the decision's module preamble in a namespace. Assert all three agree on: manifest mediaType, artifactType, the four config values, and the five predicate URIs. The five URIs exist only in the schema today; assert they are *present and exactly these strings*, so that when 3b brings them into the decision there is something for a new statement to disagree with.

**Check 2 — no schema gate before the decision.** For each of `invalid-structure/migration-without-installed-rank.json` and `invalid-structure/evidence-missing-layer-secret-scan.json`: assert the observation schema **rejects** it and the decision nonetheless reaches **CONFLICT**. Then, for the eight `invalid-semantics/` fixtures whose expected state is CONFLICT: assert the schema **accepts** them and the decision still reaches CONFLICT. Read the expected states from `expectations.json` rather than hard-coding them.

Report format follows the sibling suites: one line per check, `passed=N failed=M` at the end, exit 1 on any failure.

- [ ] **Step 2: Prove each check can go red**

Three deliberate breakages, restored after each:
1. Change `artifactType` in `release-envelope.schema.json` to a different string → Check 1 fails naming that constant.
2. Change one predicate URI in the schema → Check 1 fails naming it.
3. Point Check 2 at a fixture whose expected state is UNKNOWN → Check 2 fails.

A check that cannot be made to fail is not a check. Record all three results.

- [ ] **Step 3: Wire it into `ci.yml`**

In the step named `Check the contract and the decision still agree`, after the `contract-agreement.report.test.sh` line:

```yaml
          # The envelope constants are stated three times -- in the schema, in envelope.py, and in
          # the decision -- because a .json and a .py cannot reference each other and the decision
          # must run without the contracts directory beside it. This is what holds the three
          # together, and section 9 item 4's witnesses that schema validation is not the gate.
          bash .github/scripts/manifest-agreement.test.sh
```

It goes in that step, not the earlier one: it needs the same pinned `jsonschema` and `referencing`.

- [ ] **Step 4: Run everything**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
for s in publish-decision contract-agreement contract-agreement.report envelope canonical \
         interpreter-override publish-decision.mutations require-green-run manifest-agreement; do
  echo "== $s"; bash ".github/scripts/$s.test.sh" 2>&1 | tail -2
done
python .github/scripts/publish-decision.mutations.py 2>&1 | tail -3
```

Expected: every suite green, `all 63 mutations caught`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/manifest-agreement.test.sh .github/workflows/ci.yml
git commit -m "contract(ci): hold the three statements of the envelope constants together"
```

---

### Task 6: Lint, push, and verify CI

**Files:** none modified unless lint finds something.

- [ ] **Step 1: shellcheck exactly as CI runs it**

```bash
tmp="$(mktemp -d)"
for f in .github/scripts/*.sh backend/infra/production/scripts/*.sh; do
  mkdir -p "$tmp/$(dirname "$f")"; tr -d '\r' < "$f" > "$tmp/$f"
done
(cd "$tmp" && shellcheck --severity=warning -x --source-path=SCRIPTDIR \
   .github/scripts/*.sh backend/infra/production/scripts/*.sh)
echo "rc=$?"
```

Expected: `rc=0`. This is the step whose absence made CI red on `e434d36` over an SC2164 that came from a plan verbatim. The `tr -d '\r'` is not optional: the working tree is CRLF and an unstripped run reports SC1017 on every line while saying nothing about CI.

- [ ] **Step 2: Confirm no Flyway checksum moved**

```bash
git diff main --stat -- .github/contracts/fixtures/
git diff main -- .github/contracts/fixtures/ | grep -c '"checksum"' || true
```

Expected: `0` changed checksum lines. This plan touches no fixture at all; any fixture diff is a finding.

- [ ] **Step 3: Push and read CI**

```bash
git push origin ci/ghcr-publish
gh pr checks 23 --watch
```

Expected: 10/10 pass, including `lint`. **CI is the verdict, not the local run** — record the run's conclusion, not an expectation of it.

- [ ] **Step 4: Update the ledger**

Append to `.superpowers/sdd/progress.md` under a `## Commit 5b execution` heading: the measured suite counts, the mutation total, which mutations reddened more than one case (if any), the three deliberate breakages from Task 5 Step 2, and anything found that this plan got wrong. That last one is not optional — six of the seven vacuous-witness occurrences in this project were found by an implementer contradicting the plan they were handed.

---

## Self-review notes

**Spec coverage.** §2's thirteen rules: one in 5a (layer count), eight in Task 3's table, four in Task 3's structural guards. §5.6 → Task 3. §5.7 → Task 4. §5.8 → Task 2. §7's four `$defs` → Task 1. §7's "markerEnvelope ships without a validator" → Task 1 Step 2, recorded in the schema's own description. §9 items 3 and 4 → Task 5; items 1 and 2 are commit 6's and are explicitly out of scope. §10's "wired into ci.yml in the same commit" → Task 5 Step 3 and Step 5, one commit.

**Known open, carried to the final whole-branch review.** No *fixture* witnesses the `content` conditional added in 5a — a two-layer content-less marker belongs in `invalid-semantics/`, but `fixture-envelopes.py` regenerates digests rather than authoring fixtures, so it needs its own decision. Unchanged by this plan.

**Deliberate deviation from the approved design.** The design said `:576` would become `require()` → UNKNOWN *in place*. Planning it exposed that payload binding (Task 4) makes any check behind the `:565` problem gate unreachable, not merely unwitnessed — a per-marker problem closes the gate before a cross-marker comparison is reached. Task 2 therefore hoists the check above the gate as well as changing its verdict. Same two decisions, one extra move, and Task 4 Step 5 measures that the move was what made it work.
