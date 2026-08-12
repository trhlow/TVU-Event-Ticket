# Release manifest 3a, commit 5a — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a present marker carry the OCI envelope it travelled in, and make the decision prove that envelope is the bytes `markerDigest` names.

**Architecture:** `presentMarker` gains `ociEnvelope = {digestVerified, sizeVerified, parsed, raw}`. `raw` is conditional on all three booleans; `content` becomes conditional on the two verified booleans plus `len(raw.layers) == 1`. The decision recomputes `sha256(canonical_bytes(raw))` and refuses any marker whose `markerDigest` disagrees. A shared `envelope.py` builds envelopes for the suite and for the fixture generator, so those two never drift apart. No §2 shape constant is enforced by the decision in 5a — `raw` is any OCI manifest here; the eight shape guards land in 5b.

**Tech Stack:** bash + embedded Python 3.10+, JSON Schema draft 2020-12, `jsonschema` for the agreement suite.

## Global Constraints

- Spec: `backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md`, §2, §5, and §5.1–§5.5. Read §5.2 before writing any witness.
- Base commit: `ae021ee`. Branch `ci/ghcr-publish`. PR #23 stays a draft — do **not** merge, per the ledger's Merge decision.
- `schemaVersion` of the observation stays `1`.
- No script may name an interpreter. Use `PYTHON_BIN` via `python-bin.sh`, as the eight existing call sites do. (This rule covers `.github/scripts`; `ci.yml` is outside `interpreter-override.test.sh`'s scan.)
- Every command in this plan must be run with **both**: `PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python` and `PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"`. Without the second, bare `bash` resolves to WSL's and `contract-agreement.test.sh` reports 3/21 for reasons that are not findings.
- `shellcheck` is not installed on this workstation. CI's `lint` job is the only ShellCheck gate.
- **No Flyway inventory checksum may move.** `markerDigest` values are expected to change in Task 3; a `flywayInventory.checksum` change is the signal that something other than a shape change happened.
- Production is not deployed and must not be.
- **§5.2 is binding on every new witness:** a case must violate exactly one rule. If a witness mutates `raw`, it must carry a `markerDigest` computed from that mutated `raw`, or the digest guard refuses it first and the guard under test is never reached.

---

## File Structure

| File | Responsibility |
|---|---|
| `.github/scripts/envelope.py` | **Create.** Builds the OCI manifest for a payload and computes its digest. One source for the suite and the fixture generator. |
| `.github/scripts/envelope.test.sh` | **Create.** Pins `envelope_for` and `marker_digest` against golden values. |
| `.github/scripts/fixture-envelopes.py` | **Create.** Rewrites every fixture's `ociEnvelope` and `markerDigest` from its own `content`. Idempotent. |
| `.github/contracts/observation.schema.json` | **Modify.** `presentMarker` gains `ociEnvelope`; `content` and `raw` become conditional. |
| `.github/scripts/publish-decision.sh` | **Modify.** Envelope guards: three booleans, raw presence rule, digest equality. |
| `.github/scripts/publish-decision.test.sh` | **Modify.** `marker()` builds an envelope; new witnesses. |
| `.github/scripts/contract-agreement.test.sh` | **Modify.** Refuse a fixture whose `markerDigest` disagrees with its own `raw`. |
| `.github/scripts/publish-decision.mutations.py` | **Modify.** Six new mutations, 39 -> 45. |
| `.github/contracts/fixtures/**` (14 files) | **Modify**, by generator only. |

---

## Task 1: The envelope builder

**Files:**
- Create: `.github/scripts/envelope.py`
- Create: `.github/scripts/envelope.test.sh`

**Interfaces:**
- Consumes: `canonical.canonical_bytes` from commit 3 (`.github/scripts/canonical.py`).
- Produces: `envelope_for(content) -> dict`, `marker_digest(raw) -> str` (the `"sha256:"`-prefixed hex digest of `canonical_bytes(raw)`), and the module constants `MANIFEST_MEDIA_TYPE`, `ARTIFACT_TYPE`, `EMPTY_CONFIG_DIGEST`.

> **Why the constants live here in 5a.** 5b adds `release-envelope.schema.json` and the decision's own copies, and `manifest-agreement.test.sh` will then check the three against each other. Until it exists, `envelope.py` is the single source. Do not restate these values anywhere else in 5a.

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/envelope.test.sh`:

```bash
#!/usr/bin/env bash
# The envelope builder, pinned against values computed by hand once. If canonical_bytes changes, the
# digests below change with it and this suite is the first thing that says so.
set -uo pipefail
cd "$(dirname "$0")"
source "./python-bin.sh"

passed=0; failed=0
check() {
  local name="$1" want="$2" got
  got="$("$PYTHON" -c "$3" 2>&1)"
  if [[ "$got" == "$want" ]]; then echo "ok    $name"; ((passed++))
  else echo "FAIL  $name"; echo "      wanted: $want"; echo "      got:    $got"; ((failed++)); fi
}

check "an empty payload gives a one-layer manifest" "1" '
import envelope, json
print(len(envelope.envelope_for({})["layers"]))'

check "the layer digest is the digest of the canonical payload" \
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" '
import envelope
print(envelope.envelope_for({})["layers"][0]["digest"])'

check "the layer size is the length of the canonical payload" "2" '
import envelope
print(envelope.envelope_for({})["layers"][0]["size"])'

check "the config descriptor carries exactly four fields" \
  "data,digest,mediaType,size" '
import envelope
print(",".join(sorted(envelope.envelope_for({})["config"])))'

check "no annotations key at any of the three levels" "True" '
import envelope
e = envelope.envelope_for({})
print("annotations" not in e and "annotations" not in e["config"]
      and "annotations" not in e["layers"][0])'

check "no subject key" "True" '
import envelope
print("subject" not in envelope.envelope_for({}))'

check "marker_digest hashes the canonical form of the manifest" "True" '
import envelope, hashlib
from canonical import canonical_bytes
e = envelope.envelope_for({"a": 1})
print(envelope.marker_digest(e)
      == "sha256:" + hashlib.sha256(canonical_bytes(e)).hexdigest())'

check "a different payload gives a different marker digest" "True" '
import envelope
print(envelope.marker_digest(envelope.envelope_for({"a": 1}))
      != envelope.marker_digest(envelope.envelope_for({"a": 2})))'

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
```

- [ ] **Step 2: Run it and watch it fail**

```
PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python \
  bash .github/scripts/envelope.test.sh
```

Expected: all eight FAIL with `ModuleNotFoundError: No module named 'envelope'`.

- [ ] **Step 3: Write the module**

Create `.github/scripts/envelope.py`:

```python
"""The OCI manifest a marker travels in, built from the payload it carries.

Every choice OCI leaves optional is pinned here, because an unpinned choice means several valid
envelopes carry different digests and one SHA no longer reproduces one artifact. In 5a these values
are only used to *build* envelopes -- the decision does not yet judge the shape of a raw manifest.
5b adds release-envelope.schema.json and the decision's constants, and manifest-agreement.test.sh
then holds all three to this module.
"""
import hashlib

from canonical import canonical_bytes

__all__ = ["envelope_for", "marker_digest",
           "MANIFEST_MEDIA_TYPE", "ARTIFACT_TYPE", "EMPTY_CONFIG_DIGEST"]

MANIFEST_MEDIA_TYPE = "application/vnd.oci.image.manifest.v1+json"
ARTIFACT_TYPE = "application/vnd.tvu.release-manifest.v1+json"
EMPTY_CONFIG_MEDIA_TYPE = "application/vnd.oci.empty.v1+json"
EMPTY_CONFIG_DIGEST = "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
EMPTY_CONFIG_SIZE = 2
EMPTY_CONFIG_DATA = "e30="


def envelope_for(content):
    """The canonical envelope carrying `content`. No annotations key, no subject key, one layer."""
    payload = canonical_bytes(content)
    return {
        "schemaVersion": 2,
        "mediaType": MANIFEST_MEDIA_TYPE,
        "artifactType": ARTIFACT_TYPE,
        "config": {
            "mediaType": EMPTY_CONFIG_MEDIA_TYPE,
            "digest": EMPTY_CONFIG_DIGEST,
            "size": EMPTY_CONFIG_SIZE,
            "data": EMPTY_CONFIG_DATA,
        },
        "layers": [{
            "mediaType": ARTIFACT_TYPE,
            "digest": "sha256:" + hashlib.sha256(payload).hexdigest(),
            "size": len(payload),
        }],
    }


def marker_digest(raw):
    """The digest of a manifest as the registry would address it."""
    return "sha256:" + hashlib.sha256(canonical_bytes(raw)).hexdigest()
```

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: `passed=8 failed=0`.

- [ ] **Step 5: Wire it into CI**

In `.github/workflows/ci.yml`, beside the existing contract suite invocations (near line 291), add:

```yaml
          bash .github/scripts/envelope.test.sh
```

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/envelope.py .github/scripts/envelope.test.sh .github/workflows/ci.yml
git commit -m "contract(ci): build the envelope from the payload it carries"
```

---

## Task 2: `ociEnvelope` in the schema and the decision, booleans only

No digest equality yet, and no shape judgement. This task establishes that the field exists, that its three booleans are mandatory and typed, and that `raw` may only appear when all three are true.

**Files:**
- Modify: `.github/contracts/observation.schema.json` (`presentMarker`, around line 135)
- Modify: `.github/scripts/publish-decision.sh` (`marker_problems`)
- Modify: `.github/scripts/publish-decision.test.sh` (`marker()` helper, around line 52)

**Interfaces:**
- Consumes: `envelope_for` from Task 1.
- Produces: `marker()` in the suite accepts `_envelope` in its overrides object to replace the built envelope wholesale; `marker_problems` gains the envelope checks.

- [ ] **Step 1: Write the failing tests**

In `.github/scripts/publish-decision.test.sh`, after the existing `== a lookup may carry only the fields its own kind has` block, add:

```bash
echo
echo "== a present marker carries the envelope it travelled in"
for missing in digestVerified sizeVerified parsed; do
  assert_decision "an envelope missing $missing" \
    "$(observation "$(marker "{\"_envelope_del\": \"$missing\"}")" "$absent_release" \
       "$absent_mono" "$absent_fe")" \
    UNKNOWN '[]' false false
done
for wrong in '"yes"' '1' 'null'; do
  assert_decision "digestVerified is $wrong rather than a boolean" \
    "$(marker_obs "{\"ociEnvelope\": {\"digestVerified\": $wrong}}")" \
    UNKNOWN '[]' false false
done
assert_decision "no ociEnvelope at all" \
  "$(observation "$(marker '{"_envelope_absent": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
# raw exists only when all three checks passed. A raw sitting beside digestVerified:false is a
# document reporting bytes it was forbidden to read -- section 2 orders the size check, then the
# hash, then the parse, and nothing may be parsed before the descriptor matches.
for flag in digestVerified sizeVerified parsed; do
  assert_decision "raw present while $flag is false" \
    "$(marker_obs "{\"ociEnvelope\": {\"$flag\": false}}")" \
    UNKNOWN '[]' false false
done
assert_decision "raw absent while all three are true" \
  "$(observation "$(marker '{"_envelope_del_raw": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
# parsed:false is a completed check that came back negative: the producer published bytes that are
# not JSON. A verdict, not a defect in the observation.
assert_decision "bytes that matched the descriptor but are not JSON" \
  "$(observation "$(marker '{"_envelope_unparsed": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
for flag in digestVerified sizeVerified; do
  assert_decision "$flag is false" \
    "$(observation "$(marker "{\"_envelope_failed\": \"$flag\"}")" "$absent_release" \
       "$absent_mono" "$absent_fe")" \
    CONFLICT '[]' false false
done
```

Add the `marker_obs` shorthand immediately above that block — it exists so a case that only tweaks the marker does not restate the other three lookups:

```bash
# A one-marker observation, so envelope cases read as one line each.
marker_obs() { observation "$(marker "$1")" "$absent_release" "$absent_mono" "$absent_fe"; }
```

- [ ] **Step 2: Run and watch them fail**

```
PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python \
PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe" \
  bash .github/scripts/publish-decision.test.sh
```

Expected: the fourteen new cases FAIL. The three `CONFLICT` ones report `state='PREPARED'` or `'COMPLETE'`; the UNKNOWN ones likewise report a state rather than UNKNOWN, because nothing yet reads `ociEnvelope`. Record the exact count in the commit body.

- [ ] **Step 3: Teach `marker()` to build an envelope**

In `.github/scripts/publish-decision.test.sh`, inside the embedded Python of `marker()`, after `base` is fully constructed and after the `_migrations` block (so the envelope is built from the final content), insert:

```python
# The envelope is derived from the content, never typed alongside it: two statements of one fact
# drift, and this one is a hash. Overrides that change content therefore change the digest with it.
import envelope as envelope_module
sys.path.insert(0, sys.argv[8])

raw = envelope_module.envelope_for(base["content"])
base["ociEnvelope"] = {"digestVerified": True, "sizeVerified": True, "parsed": True, "raw": raw}
base["markerDigest"] = envelope_module.marker_digest(raw)
base["verification"]["subjectDigest"] = base["markerDigest"]

# Test-only escapes, each one shaping an observation the contract must refuse. They run before the
# generic merge so a case can both break the envelope and set an unrelated field.
if overrides.pop("_envelope_absent", False):
    del base["ociEnvelope"]
if "_envelope_del" in overrides:
    del base["ociEnvelope"][overrides.pop("_envelope_del")]
if overrides.pop("_envelope_del_raw", False):
    del base["ociEnvelope"]["raw"]
if overrides.pop("_envelope_unparsed", False):
    base["ociEnvelope"]["parsed"] = False
    del base["ociEnvelope"]["raw"]
if "_envelope_failed" in overrides:
    base["ociEnvelope"][overrides.pop("_envelope_failed")] = False
    del base["ociEnvelope"]["raw"]
```

The `sys.path.insert` line must move above the `import envelope as envelope_module` line — shown out of order here only to keep the diff in one block. Put the path insert first. `sys.argv[8]` is a new argument; extend the invocation at the end of `marker()`:

```bash
' "${1:-}" "${2:-$MONO}" "${3:-$FRONT}" "${4:-$MARKER_DIGEST}" "$SHA" "$FP" "$RELEASE_REPO" "$(dirname "$0")"
```

- [ ] **Step 4: Add `ociEnvelope` to the schema**

In `.github/contracts/observation.schema.json`, replace the `presentMarker` definition:

```json
    "presentMarker": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "queriedRef", "markerDigest", "verification", "ociEnvelope"],
      "properties": {
        "status": { "const": "present" },
        "queriedRef": { "type": "string", "minLength": 1 },
        "markerDigest": { "$ref": "#/$defs/digest" },
        "verification": { "$ref": "#/$defs/verification" },
        "ociEnvelope": { "$ref": "#/$defs/ociEnvelope" },
        "content": { "$ref": "#/$defs/markerContent" }
      }
    },

    "ociEnvelope": {
      "type": "object",
      "additionalProperties": false,
      "description": "The carrier the marker travelled in, and the outcome of the checks made on it before anything inside was read. Three booleans plus the manifest itself. layerCount, payloadDescriptor and annotationsAbsent are deliberately absent: all three are derivable from raw, and a derived field stated separately is an opportunity for two halves of one fact to disagree.",
      "required": ["digestVerified", "sizeVerified", "parsed"],
      "properties": {
        "digestVerified": {
          "type": "boolean",
          "description": "The downloaded bytes hashed to the digest the descriptor named."
        },
        "sizeVerified": {
          "type": "boolean",
          "description": "The declared size matched. Checked before the download, to bound it; a separate check at a separate moment, so it is declared separately and the decision demands both."
        },
        "parsed": {
          "type": "boolean",
          "description": "The verified bytes parsed as JSON. False is a verdict about the producer, not a defect in this observation."
        },
        "raw": {
          "$ref": "#/$defs/ociManifest",
          "description": "The manifest exactly as the registry holds it. Present only when all three booleans are true: parsing bytes whose descriptor has not matched is reading what the collector was forbidden to read."
        }
      },
      "if": {
        "properties": {
          "digestVerified": { "const": true },
          "sizeVerified": { "const": true },
          "parsed": { "const": true }
        },
        "required": ["digestVerified", "sizeVerified", "parsed"]
      },
      "then": { "required": ["raw"] },
      "else": { "not": { "required": ["raw"] } }
    },

    "ociManifest": {
      "type": "object",
      "description": "An OCI image manifest as bytes, not as an interpretation. No const anywhere: this must be able to describe the bad artifact the decision has to refuse, including one carrying annotations or a subject. artifactType is not declared [\"string\",\"null\"] either -- a manifest without one simply lacks the key, and writing null would turn real bytes into a reading of them.",
      "required": ["schemaVersion", "config", "layers"],
      "properties": {
        "schemaVersion": { "type": "integer" },
        "mediaType": { "type": "string" },
        "artifactType": { "type": "string" },
        "config": { "type": "object" },
        "layers": { "type": "array", "items": { "type": "object" } },
        "subject": { "type": "object" },
        "annotations": { "type": "object" }
      }
    },
```

- [ ] **Step 5: Teach the decision to read it**

In `.github/scripts/publish-decision.sh`, inside `marker_problems`, immediately after the `verification` block is fetched and before the attestation checks, insert:

```python
    envelope = marker.get("ociEnvelope")
    require(type(envelope) is dict, f"{where}.ociEnvelope must be an object")
    for flag in ("digestVerified", "sizeVerified", "parsed"):
        require(type(envelope.get(flag)) is bool,
                f"{where}.ociEnvelope.{flag} must be boolean")
    all_verified = all(envelope[flag] for flag in ("digestVerified", "sizeVerified", "parsed"))
    # raw is a document of bytes the collector was allowed to read. Present when it was not
    # allowed, or absent when it was, and the observation contradicts itself -- neither half can be
    # trusted, so this is UNKNOWN rather than a verdict about the producer.
    require(("raw" in envelope) == all_verified,
            f"{where}.ociEnvelope.raw is "
            f"{'present' if 'raw' in envelope else 'absent'} while the three checks say "
            f"{all_verified}")

    if not envelope["digestVerified"] or not envelope["sizeVerified"]:
        problems.append(f"{where} envelope failed verification: digestVerified="
                        f"{envelope['digestVerified']}, sizeVerified={envelope['sizeVerified']}")
    elif not envelope["parsed"]:
        problems.append(f"{where} envelope bytes matched the descriptor but are not JSON")
```

Note `require` raises `Invalid` and so reaches UNKNOWN, while `problems.append` reaches CONFLICT. That split is the whole point: a self-contradictory observation is unusable, a completed check that failed is a verdict.

- [ ] **Step 6: Run and watch them pass**

Same command as Step 2. Expected: `failed=0`, and the total rises by 14 from 137 to **151**. If the total differs, count the cases you actually added before changing anything else.

- [ ] **Step 7: Regenerate the fixtures' envelopes**

The 14 marker-bearing fixtures now fail the schema and the decision. They are fixed by generator in Task 3, which also fixes their digests. Do **not** hand-edit them. Run the agreement suite now and record that it is red:

```
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/contract-agreement.test.sh
```

Expected: 14 failures naming the marker fixtures. This is the state Task 3 resolves; do not commit here.

- [ ] **Step 8: Hold the commit**

Task 2 and Task 3 land as one commit, because between them the fixture set does not parse. Proceed directly to Task 3.

---

## Task 3: Digest equality, and every fixture's own digest

**Files:**
- Create: `.github/scripts/fixture-envelopes.py`
- Modify: `.github/scripts/publish-decision.sh`
- Modify: `.github/scripts/publish-decision.test.sh`
- Modify: `.github/scripts/contract-agreement.test.sh`
- Modify: `.github/contracts/fixtures/**` (14 files, by generator only)

**Interfaces:**
- Consumes: `envelope_for`, `marker_digest` from Task 1.
- Produces: nothing later tasks import; the generator is run by hand and its output is committed.

- [ ] **Step 1: Write the failing tests**

Append to the envelope block in `.github/scripts/publish-decision.test.sh`:

```bash
# Section 5.2. Each of these mutates raw AND carries the digest of the mutated raw, so the equality
# below holds and the only thing that can refuse the observation is the rule under test. Written the
# other way -- a mutated raw beside a stale digest -- every one of them would reach CONFLICT through
# the digest guard, and deleting the rule under test would leave them green.
assert_decision "a raw the marker digest does not name" \
  "$(observation "$(marker '{"_envelope_retag": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "a raw that is a retyped copy rather than the bytes themselves" \
  "$(observation "$(marker '{"_envelope_reorder": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
# The counterweight: a raw carrying a subject is a bad artifact, but in 5a no rule judges the shape
# of a manifest, so with its own digest recomputed it must pass. 5b is what turns this to CONFLICT,
# and this case is how 5b proves its guard did the turning.
assert_decision "a raw carrying a subject is not yet judged" \
  "$(observation "$(marker '{"_envelope_subject": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  PREPARED '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
```

Add the three escapes to `marker()`, beside the ones from Task 2:

```python
if overrides.pop("_envelope_retag", False):
    # The digest names a different object: the classic re-tag, where a marker points at bytes it
    # was not built from. Digest deliberately NOT recomputed -- this is the one case whose whole
    # subject is the mismatch.
    base["markerDigest"] = "sha256:" + "5" * 64
    base["verification"]["subjectDigest"] = base["markerDigest"]
if overrides.pop("_envelope_reorder", False):
    # Same fields, different bytes: a raw that was retyped rather than kept. The digest stays the
    # digest of the original manifest, so the recomputation is what catches it.
    base["ociEnvelope"]["raw"] = dict(base["ociEnvelope"]["raw"])
    base["ociEnvelope"]["raw"]["extraKey"] = "typed by hand"
if overrides.pop("_envelope_subject", False):
    base["ociEnvelope"]["raw"]["subject"] = {
        "mediaType": envelope_module.MANIFEST_MEDIA_TYPE,
        "digest": "sha256:" + "7" * 64, "size": 3}
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]
```

- [ ] **Step 2: Run and watch them fail**

Expected: `a raw the marker digest does not name` and `a raw that is a retyped copy` both report a state rather than CONFLICT. `a raw carrying a subject is not yet judged` should already pass — it is a guard against 5a over-reaching, not a RED.

- [ ] **Step 3: Add the equality check**

In `marker_problems`, immediately after the `elif not envelope["parsed"]:` branch from Task 2:

```python
    else:
        # Without this, raw is only a retyping of the manifest and a non-canonical envelope passes
        # unread -- which is the thing section 2 exists to stop. It also makes the "build once,
        # re-tag, never rebuild" invariant self-enforcing: two markers with one content have one
        # raw and therefore one digest.
        recomputed = "sha256:" + hashlib.sha256(canonical_bytes(envelope["raw"])).hexdigest()
        if recomputed != marker.get("markerDigest"):
            problems.append(f"{where}.ociEnvelope.raw hashes to {recomputed}, but the marker is "
                            f"named {marker.get('markerDigest')!r}")
```

- [ ] **Step 4: Run and watch them pass**

Expected: `failed=0`, total **154**.

- [ ] **Step 5: Write the fixture generator**

Create `.github/scripts/fixture-envelopes.py`:

```python
"""Rewrite every fixture's ociEnvelope and markerDigest from its own content.

Run by hand after any change to a fixture's marker content, then commit the result. Idempotent: a
second run on an unchanged tree writes nothing.

The placeholder digests these replace were all sha256:3333... -- fifteen markers naming one object.
Once the decision recomputes the digest, a shared placeholder is simply wrong, and each marker's
digest becomes a fact about its own payload.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from envelope import envelope_for, marker_digest

FIXTURES = pathlib.Path(__file__).parents[1] / "contracts" / "fixtures"


def refresh(marker):
    """True if this marker changed. A marker with no content cannot have a derived envelope."""
    if "content" not in marker:
        return False
    raw = envelope_for(marker["content"])
    digest = marker_digest(raw)
    before = (marker.get("ociEnvelope"), marker.get("markerDigest"))
    marker["ociEnvelope"] = {"digestVerified": True, "sizeVerified": True,
                            "parsed": True, "raw": raw}
    marker["markerDigest"] = digest
    if marker.get("verification", {}).get("subjectDigest") is not None:
        marker["verification"]["subjectDigest"] = digest
    return before != (marker["ociEnvelope"], marker["markerDigest"])


def main():
    changed = []
    for path in sorted(FIXTURES.rglob("*.json")):
        if path.name == "expectations.json":
            continue
        obs = json.loads(path.read_text(encoding="utf-8"))
        touched = False
        for lookup in obs.get("lookups", {}).values():
            if isinstance(lookup, dict) and lookup.get("status") == "present" \
                    and "markerDigest" in lookup:
                touched |= refresh(lookup)
        if touched:
            path.write_text(json.dumps(obs, indent=2) + "\n", encoding="utf-8", newline="\n")
            changed.append(path.name)
    print(f"rewrote {len(changed)} fixtures" + ("" if not changed else ": " + ", ".join(changed)))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run it, then run it again**

```
PYTHON_BIN=... $PYTHON_BIN .github/scripts/fixture-envelopes.py
PYTHON_BIN=... $PYTHON_BIN .github/scripts/fixture-envelopes.py
```

Expected: the first run reports 14 fixtures rewritten; the **second reports 0**. A second run that rewrites anything means the generator is not deterministic — stop and find out why before continuing.

- [ ] **Step 7: Confirm no Flyway checksum moved**

```bash
git diff -U0 .github/contracts/fixtures/ | grep -E '^[+-].*"checksum"' | grep -v '^[+-][+-]'
```

Expected: **no output**. Any line here means the generator touched content, not just the envelope, and the change is no longer a change of shape.

- [ ] **Step 8: Make a drifted fixture loud**

The fixture loop in `.github/scripts/contract-agreement.test.sh` is **Python**, not bash — it begins `for name in on_disk:` around line 120 and collects into a `problems` list closed by `report(name, problems)`. Add to that list, immediately after `document = json.loads(...)`:

```python
    # A fixture whose markerDigest disagrees with its own raw is a fixture nobody regenerated. For
    # a valid one the decision already refuses it, but an invalid-semantics fixture is CONFLICT
    # either way, so without this it would drift here forever and never say a word.
    drifted = [key for key, lookup in document.get("lookups", {}).items()
               if isinstance(lookup, dict) and isinstance(lookup.get("ociEnvelope"), dict)
               and "raw" in lookup["ociEnvelope"]
               and marker_digest(lookup["ociEnvelope"]["raw"]) != lookup.get("markerDigest")]
    if drifted:
        problems.append(f"markerDigest does not match its own raw in: {', '.join(sorted(drifted))}"
                        f" -- run fixture-envelopes.py")
```

and add the import beside the script's existing ones near the top of its embedded Python:

```python
from envelope import marker_digest
```

`sys.path` already carries the script directory in this file — confirm that before adding the import, and add the `sys.path.insert` only if it is missing.

- [ ] **Step 9: Run every suite**

```
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/publish-decision.test.sh
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/contract-agreement.test.sh
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/envelope.test.sh
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/canonical.test.sh
```

Expected: `154/0`, `24/0`, `8/0`, `3/0`.

- [ ] **Step 10: Commit Tasks 2 and 3 together**

```bash
git add .github/contracts .github/scripts
git commit
```

Body must record: the RED counts observed in Task 2 Step 2 and Task 3 Step 2; that 15 markerDigest values in 14 fixtures were regenerated by script and not by hand; that no Flyway checksum moved; and the suite totals.

---

## Task 4: `content` becomes conditional

**Files:**
- Modify: `.github/contracts/observation.schema.json`
- Modify: `.github/scripts/publish-decision.sh`
- Modify: `.github/scripts/publish-decision.test.sh`

- [ ] **Step 1: Write the failing tests**

```bash
echo
echo "== content exists only when there is exactly one payload to read"
# Two layers means no answer to "which one is the payload", so the collector must not parse either.
# Same rule as section 2's, one level down: nothing is read before it is identified.
assert_decision "two layers and no content" \
  "$(observation "$(marker '{"_envelope_two_layers": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "two layers but content anyway" \
  "$(observation "$(marker '{"_envelope_two_layers_with_content": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
assert_decision "content present while the digest check failed" \
  "$(observation "$(marker '{"_envelope_failed_with_content": "digestVerified"}')" \
     "$absent_release" "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
```

And the escapes in `marker()`:

```python
if overrides.pop("_envelope_two_layers", False):
    base["ociEnvelope"]["raw"]["layers"].append(dict(base["ociEnvelope"]["raw"]["layers"][0]))
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]
    del base["content"]
if overrides.pop("_envelope_two_layers_with_content", False):
    base["ociEnvelope"]["raw"]["layers"].append(dict(base["ociEnvelope"]["raw"]["layers"][0]))
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]
if "_envelope_failed_with_content" in overrides:
    base["ociEnvelope"][overrides.pop("_envelope_failed_with_content")] = False
    del base["ociEnvelope"]["raw"]
```

Note the first case deletes `content` and expects CONFLICT — the layer count is wrong, which is a verdict. The second keeps `content` where it is forbidden, which is a self-contradictory observation and therefore UNKNOWN.

- [ ] **Step 2: Run and watch them fail**

Expected: three failures. `content` is still unconditionally required, so the first case reports UNKNOWN where CONFLICT is wanted.

- [ ] **Step 3: Make the schema conditional**

Replace the `presentMarker` `required` line and add the conditional, keeping `content` in `properties` so `additionalProperties: false` still admits it on the `then` branch:

```json
      "required": ["status", "queriedRef", "markerDigest", "verification", "ociEnvelope"],
      "if": {
        "properties": {
          "ociEnvelope": {
            "properties": {
              "digestVerified": { "const": true },
              "sizeVerified": { "const": true },
              "raw": { "properties": { "layers": { "minItems": 1, "maxItems": 1 } },
                       "required": ["layers"] }
            },
            "required": ["digestVerified", "sizeVerified", "raw"]
          }
        },
        "required": ["ociEnvelope"]
      },
      "then": { "required": ["content"] },
      "else": { "not": { "required": ["content"] } }
```

- [ ] **Step 4: Make the decision agree**

The presence rule must sit **outside** the verdict branches, at the same level as the `raw` presence rule from Task 2 — not inside the `else` that runs only when both verifications passed. A marker whose digest check failed and which carries `content` anyway is a self-contradictory observation, and self-contradiction is UNKNOWN; putting the rule inside `else` would let it reach CONFLICT through the failure branch instead, and the witness for it would pass for the wrong reason. That is §5.2 arriving one level down.

In `marker_problems`, immediately after the `require(("raw" in envelope) == all_verified, ...)` line:

```python
    # A payload can be read only when the bytes were verified AND exactly one layer says which
    # bytes are the payload. Two layers is no answer to "which one", so nothing may be parsed --
    # section 2's rule, one level down. raw absent makes the count unanswerable, which is itself a
    # reason content cannot be here.
    layers = envelope["raw"].get("layers") if "raw" in envelope else None
    one_layer = isinstance(layers, list) and len(layers) == 1
    content_allowed = envelope["digestVerified"] and envelope["sizeVerified"] and one_layer
    require(("content" in marker) == content_allowed,
            f"{where}.content is {'present' if 'content' in marker else 'absent'} while the "
            f"envelope {'permits' if content_allowed else 'forbids'} it")
```

and the verdict itself, inside the existing `else` branch after the digest equality check:

```python
        if not one_layer:
            problems.append(f"{where} envelope carries "
                            f"{len(layers) if isinstance(layers, list) else 'no'} layers, "
                            f"expected exactly one")
```

Then guard every later use of `marker["content"]` in `marker_problems` behind `if "content" in marker:` — read the whole function and move the existing content checks inside that branch rather than leaving them to raise `KeyError` on a marker that is legitimately without one.

- [ ] **Step 5: Run and watch them pass**

Expected: `failed=0`, total **157**.

- [ ] **Step 6: Commit**

```bash
git add .github/contracts .github/scripts
git commit -m "contract(ci): let a marker without one readable payload say so"
```

---

## Task 5: Mutations, and the evidence that all of it is load-bearing

**Files:**
- Modify: `.github/scripts/publish-decision.mutations.py`

- [ ] **Step 1: Add the mutations**

```python
    # Section 5.2's own guard: every witness above carries a digest computed from its own raw, so
    # removing the equality must redden the two cases written for it and nothing else.
    "digest_not_recomputed": (
        'recomputed = "sha256:" + hashlib.sha256(canonical_bytes(envelope["raw"])).hexdigest()',
        'recomputed = marker.get("markerDigest")'),
    # A non-canonical envelope is exactly what section 2 exists to refuse, so recomputing with a
    # looser writer must not go unnoticed.
    "canonical_bytes_bypassed": (
        'hashlib.sha256(canonical_bytes(envelope["raw"])).hexdigest()',
        'hashlib.sha256(json.dumps(envelope["raw"]).encode()).hexdigest()'),
    "raw_allowed_when_unverified": (
        'require(("raw" in envelope) == all_verified,', "require(True,"),
    "envelope_failure_is_not_a_verdict": (
        'if not envelope["digestVerified"] or not envelope["sizeVerified"]:',
        "if False:"),
    "unparsed_bytes_ignored": (
        'elif not envelope["parsed"]:', "elif False:"),
    "content_gate_ignores_layer_count": (
        'require(("content" in marker) == one_layer,', "require(True,"),
```

- [ ] **Step 2: Run the whole runner**

```
PYTHON_BIN=... PUBLISH_DECISION_BASH=... $PYTHON_BIN .github/scripts/publish-decision.mutations.py
```

Expected: `all 45 mutations caught`, `baseline: suite green`, and zero lines containing `by timeout`.

Read every line. A `SURVIVED` is a finding: it means a guard was deleted and nothing objected, so the witnesses written for it are reaching their verdict some other way — §5.2's failure mode, arriving again. Do not weaken a test to silence it. A `STALE` means the anchor text no longer exists, so nothing was mutated; re-anchor it in this commit.

Check specifically that `digest_not_recomputed` reddens **2** cases and `content_gate_ignores_layer_count` reddens **2**. A much larger number means the witnesses are catching it collaterally rather than deliberately, which is the same defect one level up.

- [ ] **Step 3: Confirm the older mutations still anchor**

```bash
grep -c "STALE" <runner output>
```

Expected `0`. `same_digest_different_content` anchors on `canonical_bytes(final["content"])`, which Task 4 may have moved inside an `if`. If it went STALE, re-anchor rather than delete.

- [ ] **Step 4: Run every suite one more time**

All seven, with both env vars. Record the totals.

- [ ] **Step 5: Commit and push**

```bash
git add .github/scripts
git commit -m "test(ci): prove the envelope guards are load-bearing"
git push origin ci/ghcr-publish
```

- [ ] **Step 6: Read CI**

```bash
gh pr checks 23
```

`lint` is the only ShellCheck gate. Do not report the task complete until it is green.

---

## Deviations from the spec, stated rather than absorbed

- **Fixture count.** §5.4 says 15 marker instances in 14 files, measured 2026-08-04. If the generator reports a different number, the spec is stale again — say so rather than adjusting quietly.
- **`envelope.py` holds the §2 constants during 5a.** The spec places them in `release-envelope.schema.json`, which does not exist until 5b. One source now, three checked against each other by `manifest-agreement.test.sh` in 5b.
- **`a raw carrying a subject is not yet judged` asserts PREPARED, not CONFLICT.** In 5a no rule judges manifest shape. The case exists so 5b can prove its own guard flipped it, and 5b must change this line — it is a deliberate tripwire, not an oversight.
- **Task 2 does not commit.** Between Tasks 2 and 3 the fixtures do not parse, and the plan forbids committing a red tree. They land as one commit.
