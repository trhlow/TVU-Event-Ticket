# Evidence verification 3b — commit 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the shape of an evidence-set carrier manifest (spec §2, A′) in a schema nothing has ever validated against yet, with a fixture corpus that proves every rule in it is load-bearing.

**Architecture:** A new standalone JSON Schema, `release-evidence-set.schema.json`, structurally identical in spirit to `release-envelope.schema.json`'s `markerEnvelope` but for the OCI manifest that carries the four evidence reports (SBOM, vulnerability scan, layer secret scan, filesystem secret scan) for one image. It reuses — via cross-file `$ref`, never restates — the constants `release-envelope.schema.json` already owns (`manifestMediaType`, `emptyConfig`) and the digest pattern `observation.schema.json` already owns. A new, self-contained test script (`evidence-set-schema.test.sh`) runs a fixture corpus through it and asserts accept/reject, mirroring `contract-agreement.test.sh`'s registry-building and reporting code but with no decision-calling half, because the decision function does not see evidence-set carriers yet — that starts at 3b commit 2.

**Tech Stack:** JSON Schema draft 2020-12, `jsonschema==4.26.0` + `referencing==0.37.0` (already pinned repo-wide), bash test harness following the repo's existing `*.test.sh` conventions.

## Global Constraints

- **No fixture may be modified once committed.** If a fixture turns out wrong, that is a finding to fix in the next commit, not silently in this one.
- **No JSON Schema keyword ships without a fixture that would redden if it were deleted.** This is not a style preference — `release-envelope.schema.json` shipped in commit 5b with zero witnesses on its entire validated content (found by whole-branch review: deleting both its `$defs` left every contract suite green). Every task below ends with a hand-verified attribution step for exactly this reason.
- **This schema does not gain a Python counterpart in this commit.** There is no collector yet (spec header: "Collector không được bắt đầu trước khi schema 3b đóng băng"), so there is no consumer that would need these constants restated in Python. Introducing one now would be inventing a consumer to give the schema work to do, which `markerEnvelope`'s own header explicitly says not to do.
- **Tag policy is not encoded in this schema.** `evidence-monolith-sha-<commit>` / `evidence-frontend-sha-<commit>` are registry-level facts (which tag points at this manifest), not JSON-shape facts about the manifest's bytes. They become checkable in 3b commit 2, when `evidenceSetLookup` exists to observe them.
- **Byte caps (spec §7) are not encoded in this schema either.** They gate what a collector is allowed to fetch, not what a fetched document may contain. Out of scope until the collector exists.
- Every script sources or honours `PYTHON_BIN` / `PUBLISH_DECISION_BASH` the way every other script in `.github/scripts` and `backend/infra/production/scripts` does. `bash` on PATH on the Windows dev machine is WSL's and cannot see the interpreter a script was started with — this has cost real time on this branch before. Use `python-bin.sh`'s `$PYTHON` in the new test script, exactly as `contract-agreement.test.sh` does.
- Environment for local verification: `export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"` and `export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python`.

## File Structure

- `.github/contracts/release-evidence-set.schema.json` — **create**. The schema itself.
- `.github/contracts/evidence-set-fixtures/valid/*.json` — **create**. Two fixtures (monolith, frontend), each a complete, schema-valid evidence-set manifest.
- `.github/contracts/evidence-set-fixtures/invalid/*.json` — **create**. One fixture per broken rule, built up task by task.
- `.github/contracts/evidence-set-fixtures/expectations.json` — **create**. `{filename: "accepts"|"rejects"}`, nothing else — there is no decision to assert `state`/`actions` against yet, unlike `.github/contracts/fixtures/expectations.json`.
- `.github/scripts/evidence-set-schema.test.sh` — **create**. The harness.
- `.github/workflows/ci.yml` — **modify**. One new line in the existing "Check the contract and the decision still agree" step.
- `.superpowers/sdd/progress.md` — **modify**. Ledger entry (gitignored, not part of the repo's own history, but the project's working memory across sessions).

This is deliberately a **separate fixtures directory**, not a subdirectory of `.github/contracts/fixtures/`. `contract-agreement.test.sh` does `fixtures.rglob("*.json")` over the entire `fixtures/` tree and requires every file under it to have an entry in *its own* `expectations.json`, validated against `observation.schema.json`, and run through the decision. An evidence-set carrier fixture is not an observation document — nesting it there would make that suite try to run it through the decision and fail for a reason that has nothing to do with either script.

## Interfaces

- **Consumes:** `release-envelope.schema.json#/$defs/constants/properties/manifestMediaType`, `release-envelope.schema.json#/$defs/constants/properties/emptyConfig`, `observation.schema.json#/$defs/digest` — all by cross-file `$ref`, none restated.
- **Produces:** `release-evidence-set.schema.json#/$defs/evidenceSetManifest` and `release-evidence-set.schema.json#/$defs/constants/properties/layerMediaTypes/properties/{sbom,vulnerabilityScan,layerSecretScan,filesystemSecretScan}` — the four canonical constants 3b commit 2 onward will need when it builds `evidenceSetLookup` and (eventually, the collector's commit) when something has to state these four URIs in Python for the first time. Until then nothing consumes them but this schema's own `contains` checks.

---

### Task 1: Schema skeleton, harness, and carrier identity + config

**Files:**
- Create: `.github/contracts/release-evidence-set.schema.json`
- Create: `.github/scripts/evidence-set-schema.test.sh`
- Create: `.github/contracts/evidence-set-fixtures/expectations.json`
- Create: `.github/contracts/evidence-set-fixtures/valid/monolith.json`
- Create: `.github/contracts/evidence-set-fixtures/valid/frontend.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/schema-version-is-one.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/wrong-manifest-media-type.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/wrong-artifact-type.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/config-not-empty.json`

**Interfaces:**
- Produces: `release-evidence-set.schema.json#/$defs/constants/properties/artifactType` (this schema's own artifact type, distinct from the marker's), `#/$defs/evidenceSetManifest` (loosely typed `layers`/`subject` at the end of this task — tightened in Tasks 2 and 3, never loosened further).

At the end of this task `layers` and `subject` are typed only as `{"type": "array"}` / `{"type": "object"}`. This is not a placeholder in the sense the "No Placeholders" rule forbids — every fixture in this task already carries a complete, four-layer, correctly-shaped `layers` array and a complete `subject` descriptor, because `required` already demands both keys be present. Tasks 2 and 3 replace the loose typing with real constraints; no fixture written in this task is rewritten later, only the schema tightens around it.

- [ ] **Step 1: Write the two valid fixtures**

`.github/contracts/evidence-set-fixtures/valid/monolith.json`:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "artifactType": "application/vnd.evts.evidence-set.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.empty.v1+json",
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "size": 2,
    "data": "e30="
  },
  "layers": [
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "size": 4096
    },
    {
      "mediaType": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
      "digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "size": 8192
    },
    {
      "mediaType": "application/vnd.evts.evidence.layerSecretScan.v1+json",
      "digest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "size": 2048
    },
    {
      "mediaType": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
      "digest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "size": 1024
    }
  ],
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "size": 3311
  }
}
```

`.github/contracts/evidence-set-fixtures/valid/frontend.json` — same shape, a different subject digest, and the four layers **deliberately listed in a different order**. This is not incidental: spec §2 says layer identity is "theo mediaType, không theo vị trí" (by mediaType, not position), and a fixture that only ever lists them in one order would never prove that:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "artifactType": "application/vnd.evts.evidence-set.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.empty.v1+json",
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "size": 2,
    "data": "e30="
  },
  "layers": [
    {
      "mediaType": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      "size": 512
    },
    {
      "mediaType": "application/vnd.evts.evidence.layerSecretScan.v1+json",
      "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      "size": 640
    },
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      "size": 2560
    },
    {
      "mediaType": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
      "digest": "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      "size": 5120
    }
  ],
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "size": 987
  }
}
```

Every digest in both valid fixtures must be exactly `sha256:` followed by 64 lowercase hex characters, matching `^sha256:[0-9a-f]{64}$` — the pattern this task reuses from `observation.schema.json#/$defs/digest`, wired in at Step 6. This is a hand-typed repeated digit, which is exactly the kind of value a fixture author gets off-by-a-few-characters on without noticing. Verify each one before proceeding, do not eyeball it:

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PYTHON_BIN" -c "
import json, re
for name in ['valid/monolith.json', 'valid/frontend.json']:
    doc = json.load(open(f'.github/contracts/evidence-set-fixtures/{name}', encoding='utf-8'))
    digests = [doc['config']['digest'], doc['subject']['digest']] + [l['digest'] for l in doc['layers']]
    for d in digests:
        assert re.fullmatch(r'sha256:[0-9a-f]{64}', d), f'{name}: bad digest {d!r} ({len(d)-7} hex chars)'
    print(name, 'ok')
"
```

Expected: `valid/monolith.json ok` and `valid/frontend.json ok`. This check has nothing to validate against yet at this point in the task (the harness and schema do not exist until Step 4) — it is a standalone sanity check on the fixtures alone, run once, before anything else depends on these files being right.

- [ ] **Step 2: Write the four invalid fixtures for this task**

Each is `valid/monolith.json` with exactly one field changed, so exactly one rule is under test in each.

`.github/contracts/evidence-set-fixtures/invalid/schema-version-is-one.json` — copy `valid/monolith.json` and change only:
```json
  "schemaVersion": 1,
```

`.github/contracts/evidence-set-fixtures/invalid/wrong-manifest-media-type.json` — copy `valid/monolith.json` and change only:
```json
  "mediaType": "application/vnd.oci.image.index.v1+json",
```

`.github/contracts/evidence-set-fixtures/invalid/wrong-artifact-type.json` — copy `valid/monolith.json` and change only:
```json
  "artifactType": "application/vnd.tvu.release-manifest.v1+json",
```
(the marker's artifact type, chosen deliberately — this is the exact mistake of forgetting evidence-sets and markers are different carrier types)

`.github/contracts/evidence-set-fixtures/invalid/config-not-empty.json` — copy `valid/monolith.json` and change only:
```json
  "config": {
    "mediaType": "application/vnd.oci.empty.v1+json",
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "size": 2,
    "data": "eyJub3QiOiJlbXB0eSJ9"
  },
```
(`data` decodes to `{"not":"empty"}`, not `{}` — the point is the byte content, not the shape, which is why `size`/`digest`/`mediaType` stay correct and only `data` moves)

- [ ] **Step 3: Write `expectations.json` for all six fixtures so far**

`.github/contracts/evidence-set-fixtures/expectations.json`:

```json
{
  "valid/monolith.json": "accepts",
  "valid/frontend.json": "accepts",
  "invalid/schema-version-is-one.json": "rejects",
  "invalid/wrong-manifest-media-type.json": "rejects",
  "invalid/wrong-artifact-type.json": "rejects",
  "invalid/config-not-empty.json": "rejects"
}
```

- [ ] **Step 4: Write the harness against a permissive placeholder schema**

Create `.github/contracts/release-evidence-set.schema.json` with only:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object"
}
```

Create `.github/scripts/evidence-set-schema.test.sh`:

```bash
#!/usr/bin/env bash
# Validates the evidence-set carrier fixture corpus against release-evidence-set.schema.json and
# asserts each fixture's accept/reject verdict matches expectations.json.
#
# There is no decision half here, unlike contract-agreement.test.sh. The decision function does not
# read an evidence-set carrier yet -- 3b commit 2 gives it evidenceSetLookup. Until then this schema
# has exactly one consumer, this suite, and the whole reason it exists is that a schema with no
# fixture proving each rule is load-bearing is indistinguishable from no schema at all: commit 5b
# shipped release-envelope.schema.json with zero witnesses on its entire validated content, and a
# whole-branch review found that deleting both its $defs left every contract suite green.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

"$PYTHON" - "$repo_root" <<'PYTHON'
import json
import pathlib
import sys
import urllib.parse

try:
    import jsonschema
    from jsonschema.exceptions import best_match
    import referencing
    import referencing.exceptions
    import referencing.jsonschema
except ImportError:
    # Never skipped. A contract test that quietly does nothing when a dependency is missing reports
    # the same green as one that ran, and the whole point here is that green means something.
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

repo_root = pathlib.Path(sys.argv[1])
contracts = repo_root / ".github" / "contracts"
fixtures = contracts / "evidence-set-fixtures"

schema = json.loads((contracts / "release-evidence-set.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))

# Same registry-building shape as contract-agreement.test.sh, and for the same reason: this schema
# references release-envelope.schema.json's constants and observation.schema.json's digest pattern
# rather than restating either, so a $ref has to resolve across files. jsonschema stopped resolving
# a bare filename when RefResolver was deprecated in 4.18; without a registry the reference raises
# Unresolvable, which is the good failure -- but it means the schema cannot even be loaded until the
# registry exists.
base = schema["$id"] if isinstance(schema.get("$id"), str) else ""
resources = {}
for path in sorted(contracts.glob("*.schema.json")):
    resource = referencing.Resource.from_contents(
        json.loads(path.read_text(encoding="utf-8")),
        default_specification=referencing.jsonschema.DRAFT202012)
    resources[path.name] = resource
    if base:
        resources[urllib.parse.urljoin(base, path.name)] = resource
if not resources:
    print("FAIL  no schema files found; the contract directory must have moved")
    sys.exit(1)
registry = referencing.Registry().with_resources(resources.items())

validator = jsonschema.Draft202012Validator(schema, registry=registry)

passed = 0
failed = 0


def report(name, problems):
    global passed, failed
    if problems:
        print(f"FAIL  {name}: " + "; ".join(problems))
        failed += 1
    else:
        print(f"ok    {name}")
        passed += 1


SCHEMA_MESSAGE_CHARS = 200


def describe(errors):
    best = best_match(errors)
    where = "/".join(str(part) for part in best.absolute_path) or "<root>"
    message = best.message
    if len(message) > SCHEMA_MESSAGE_CHARS:
        keep = SCHEMA_MESSAGE_CHARS // 2
        dropped = len(message) - 2 * keep
        message = f"{message[:keep]} [{dropped} chars omitted] {message[-keep:]}"
    rest = f" (and {len(errors) - 1} more)" if len(errors) > 1 else ""
    return f"{where}: {message}{rest}"


on_disk = sorted(str(path.relative_to(fixtures)).replace("\\", "/")
                 for path in fixtures.rglob("*.json") if path.name != "expectations.json")

report("every fixture states what the schema must do",
       [f"no expectation for {name}" for name in on_disk if name not in expectations])
report("every expectation has a fixture",
       [f"no fixture for {name}" for name in expectations if name not in on_disk])
report("there are fixtures at all", [] if on_disk else ["the fixture directory is empty"])

for name in on_disk:
    want = expectations.get(name)
    if want is None:
        continue
    problems = []
    document = json.loads((fixtures / name).read_text(encoding="utf-8"))

    try:
        errors = list(validator.iter_errors(document))
    except referencing.exceptions.Unresolvable as unresolvable:
        problems.append(f"the schema makes a reference nothing in {contracts.name}/ can answer -- "
                        f"{unresolvable}")
    else:
        if want == "accepts" and errors:
            problems.append(f"rejected but filed as valid: {describe(errors)}")
        if want == "rejects" and not errors:
            problems.append("accepted but filed as invalid")

    report(name, problems)

print()
print(f"passed={passed} failed={failed}")
sys.exit(1 if failed else 0)
PYTHON
```

- [ ] **Step 5: Run to verify the harness itself is sound, and to confirm the digest fixture**

```bash
export PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=5 failed=4` — the two valid fixtures pass (the placeholder schema accepts everything, and they're filed as `accepts`), and all four invalid fixtures report `FAIL ... accepted but filed as invalid` (the placeholder schema accepts everything, but they're filed as `rejects`). This is RED, and it is RED for the right reason: the schema does not yet enforce anything.

If `frontend.json`'s digests were not fixed to 64 characters in Step 1, this run fails differently — `jsonschema` itself will not complain yet (the placeholder schema is `{"type":"object"}` and does not check digest shape), but note it now: Step 8 will catch it once the real digest pattern is wired in, and it is cheaper to fix it here.

- [ ] **Step 6: Write the real schema**

Replace `.github/contracts/release-evidence-set.schema.json` with:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/release-evidence-set.schema.json",
  "title": "The OCI manifest that carries one image's four evidence reports",
  "description": "A′ (spec section 2): two of these per commit, one per image, each carrying exactly four canonical report layers -- SBOM, vulnerability scan, layer secret scan, filesystem secret scan -- identified by mediaType, not by position. Tag policy (evidence-monolith-sha-<commit>, evidence-frontend-sha-<commit>) is a registry-level fact about which tag points at this manifest's digest, not a JSON-shape fact this schema can see; it becomes checkable in 3b commit 2, when evidenceSetLookup exists to observe it. Byte caps (spec section 7) gate what a collector may fetch, not what a fetched document may contain, and are likewise out of scope here.",
  "$defs": {
    "constants": {
      "description": "This schema's own constants. Not the marker's -- an evidence-set is a different carrier type with its own artifactType and its own four layer media types. The manifest mediaType and the empty config it shares WITH the marker are not restated here; they are $ref'd from release-envelope.schema.json, which already owns them, so there is nothing for two copies to drift apart about.",
      "type": "object",
      "additionalProperties": false,
      "required": ["artifactType", "layerMediaTypes"],
      "properties": {
        "artifactType": { "const": "application/vnd.evts.evidence-set.v1+json" },
        "layerMediaTypes": {
          "type": "object",
          "additionalProperties": false,
          "required": ["sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"],
          "properties": {
            "sbom": { "const": "application/vnd.evts.evidence.sbom.v1+json" },
            "vulnerabilityScan": { "const": "application/vnd.evts.evidence.vulnerabilityScan.v1+json" },
            "layerSecretScan": { "const": "application/vnd.evts.evidence.layerSecretScan.v1+json" },
            "filesystemSecretScan": { "const": "application/vnd.evts.evidence.filesystemSecretScan.v1+json" }
          }
        }
      }
    },
    "evidenceSetManifest": {
      "description": "The whole carrier. layers and subject are loosely typed here and tightened in the same file across this commit's later tasks; every fixture in the corpus already satisfies the tightened shape, because required already demands both keys be present in full from the first task onward.",
      "type": "object",
      "additionalProperties": false,
      "required": ["schemaVersion", "mediaType", "artifactType", "config", "layers", "subject"],
      "properties": {
        "schemaVersion": { "const": 2 },
        "mediaType": { "$ref": "release-envelope.schema.json#/$defs/constants/properties/manifestMediaType" },
        "artifactType": { "$ref": "#/$defs/constants/properties/artifactType" },
        "config": { "$ref": "release-envelope.schema.json#/$defs/constants/properties/emptyConfig" },
        "layers": { "type": "array" },
        "subject": { "type": "object" }
      }
    }
  },
  "$ref": "#/$defs/evidenceSetManifest"
}
```

- [ ] **Step 7: Run to verify it passes**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=9 failed=0`.

If `wrong-artifact-type.json` still passes as rejected but for a surprising reason, or if any case fails unexpectedly, read the printed `FAIL` line before changing anything — it names the exact JSON pointer and the exact `jsonschema` message.

- [ ] **Step 8: Hand-verify each guard is load-bearing**

For each of the four rules this task added, make a scratch copy of the schema with exactly that rule removed, re-run the harness against the scratch copy, and confirm **exactly** the one fixture written for it flips from correctly-rejected to wrongly-accepted, and nothing else moves.

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
cp .github/contracts/release-evidence-set.schema.json /tmp/es-schema-backup.json
```

Change `"schemaVersion": { "const": 2 }` to `"schemaVersion": { "type": "integer" }` — **loosen it, do not delete the property declaration.** Deleting it entirely was tried first while writing this plan and does not isolate anything: `schemaVersion` stays in `required`, so the key is still present in every fixture, and with no declaration for it in `properties`, `additionalProperties: false` rejects it as an undeclared key regardless of its value — every fixture fails, not just the one meant to. Loosening the type is what actually isolates "the value must be exactly 2" from "the key must exist." Run the harness. Expected: `passed=8 failed=1`, the one failure is `invalid/schema-version-is-one.json`. Restore from `/tmp/es-schema-backup.json`.

Change `"mediaType": { "$ref": "release-envelope.schema.json#/$defs/constants/properties/manifestMediaType" }` to `"mediaType": { "type": "string" }`, run the harness. Expected: `passed=8 failed=1`, the one failure is `invalid/wrong-manifest-media-type.json`. Restore.

Change `"artifactType": { "$ref": "#/$defs/constants/properties/artifactType" }` to `"artifactType": { "type": "string" }`, run the harness. Expected: `passed=8 failed=1`, the one failure is `invalid/wrong-artifact-type.json`. Restore.

Change `"config": { "$ref": "release-envelope.schema.json#/$defs/constants/properties/emptyConfig" }` to `"config": { "type": "object" }`, run the harness. Expected: `passed=8 failed=1`, the one failure is `invalid/config-not-empty.json`. Restore.

If any of these four checks moves more than one fixture, or moves the wrong one, the guard and its fixture are not the pair you think they are — stop and re-examine both before continuing.

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected after the last restore: `passed=9 failed=0` again.

- [ ] **Step 9: shellcheck**

```bash
export PATH="$PATH:/c/Users/Hlow/AppData/Local/Programs/Python/Python312/Scripts"
tmp=$(mktemp -d)
tr -d '\r' < .github/scripts/evidence-set-schema.test.sh > "$tmp/evidence-set-schema.test.sh"
shellcheck --severity=warning -x --source-path="$tmp" "$tmp"/evidence-set-schema.test.sh
```

Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add .github/contracts/release-evidence-set.schema.json \
        .github/contracts/evidence-set-fixtures \
        .github/scripts/evidence-set-schema.test.sh
git commit -m "contract(ci): decide where evidence lives and how long it lives (1/2)

Schema skeleton, harness, and carrier identity + config -- schemaVersion,
mediaType and artifactType consts, config reused from release-envelope.schema.json
rather than restated. layers and subject are loosely typed; tightened in the
next commits on this branch.

RED first: harness against a permissive placeholder schema reported
passed=5 failed=4, all four failures 'accepted but filed as invalid'. GREEN
after the real schema: passed=9 failed=0. Each of the four guards hand-verified
load-bearing: removing schemaVersion/mediaType/artifactType/config one at a
time reddened exactly its own fixture and nothing else.

shellcheck clean."
```

---

### Task 2: Layers — exactly four, four media types, position-independent

**Files:**
- Modify: `.github/contracts/release-evidence-set.schema.json`
- Modify: `.github/contracts/evidence-set-fixtures/expectations.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/too-few-layers.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/too-many-layers.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/duplicate-layer-media-type.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/wrong-layer-media-type.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/layer-extra-field.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/layer-bad-digest.json`

**Interfaces:**
- Consumes: `#/$defs/constants/properties/layerMediaTypes/properties/{sbom,vulnerabilityScan,layerSecretScan,filesystemSecretScan}` (Task 1), `observation.schema.json#/$defs/digest` (repo-existing).
- Produces: `#/$defs/evidenceLayer` (new $def; Task 3 does not need it, but a later commit implementing the collector will).

The mechanism this task relies on — `contains` + `minContains: 1` + `maxContains: 1`, once per required media type, with **no separate `minItems`/`maxItems`** — was verified against the real `jsonschema` library before this plan was written, not assumed. `minItems: 4, maxItems: 4` was tried first and found to be a completely redundant, unwitnessable guard: with four required distinct `mediaType` values each capped at `maxContains: 1`, any array with fewer than four items necessarily leaves some required kind absent (caught by that kind's `minContains: 1`), and any array with more than four items necessarily either duplicates a kind (caught by `maxContains: 1`) or contains an out-of-enum value (caught by `items`/`evidenceLayer`) — a pigeonhole argument confirmed empirically by removing `minItems`/`maxItems` from a scratch schema and finding no fixture flipped. It is left out of the schema below for exactly the reason stated in the Global Constraints: no keyword ships without a fixture that would redden if it were deleted, and this one has none.

- [ ] **Step 1: Write the six new invalid fixtures**

`.github/contracts/evidence-set-fixtures/invalid/too-few-layers.json` — copy `valid/monolith.json`, drop the last layer (filesystemSecretScan), leaving three.

`.github/contracts/evidence-set-fixtures/invalid/too-many-layers.json` — copy `valid/monolith.json`, append a fifth layer that duplicates the first exactly:
```json
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "size": 4096
    }
```

`.github/contracts/evidence-set-fixtures/invalid/duplicate-layer-media-type.json` — copy `valid/monolith.json`, change the **fourth** layer's `mediaType` from `filesystemSecretScan`'s value to the SBOM one (and its digest to match the first layer's, so the two SBOM entries are identical), so the array has two SBOM layers and zero filesystemSecretScan layers, still four items total:
```json
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "size": 1024
    }
```

`.github/contracts/evidence-set-fixtures/invalid/wrong-layer-media-type.json` — copy `valid/monolith.json`, keep all four original layers **unchanged**, and **append a fifth layer** whose `mediaType` is outside the four-value enum entirely:
```json
    {
      "mediaType": "application/vnd.evts.evidence.unknownKind.v1+json",
      "digest": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      "size": 128
    }
```
This is deliberately **not** "substitute one of the four existing layers' `mediaType`" — that design was tried first while writing this plan and rejected: substituting an existing layer's value simultaneously removes that kind's only occurrence from the array, so the fixture gets caught by the four-way `contains` coverage check (an uncovered kind) instead of by `evidenceLayer.mediaType`'s own `anyOf`, making it redundant with `duplicate-layer-media-type.json` rather than isolating anything new. Appending a fifth, out-of-enum layer while leaving the original four intact is what actually isolates the per-item `mediaType` check: the array still satisfies every `contains` requirement, and the only thing wrong is the fifth item's value.

`.github/contracts/evidence-set-fixtures/invalid/layer-extra-field.json` — copy `valid/monolith.json`, add a field to the first layer:
```json
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "size": 4096,
      "urls": ["https://example.invalid/report.json"]
    }
```

`.github/contracts/evidence-set-fixtures/invalid/layer-bad-digest.json` — copy `valid/monolith.json`, shorten the first layer's digest by four characters:
```json
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
```

- [ ] **Step 2: Add all six to `expectations.json`, all `"rejects"`**

```json
  "invalid/too-few-layers.json": "rejects",
  "invalid/too-many-layers.json": "rejects",
  "invalid/duplicate-layer-media-type.json": "rejects",
  "invalid/wrong-layer-media-type.json": "rejects",
  "invalid/layer-extra-field.json": "rejects",
  "invalid/layer-bad-digest.json": "rejects"
```

- [ ] **Step 3: Run to verify the new fixtures fail**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=9 failed=6` — the six new fixtures all report `accepted but filed as invalid` (layers is still `{"type": "array"}`, so anything array-shaped passes), and everything from Task 1 still passes.

- [ ] **Step 4: Tighten `layers`**

In `.github/contracts/release-evidence-set.schema.json`, add `evidenceLayer` to `$defs` and replace the `layers` property:

```json
    "evidenceLayer": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mediaType", "digest", "size"],
      "properties": {
        "mediaType": {
          "anyOf": [
            { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/sbom" },
            { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/vulnerabilityScan" },
            { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/layerSecretScan" },
            { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/filesystemSecretScan" }
          ]
        },
        "digest": { "$ref": "observation.schema.json#/$defs/digest" },
        "size": { "type": "integer", "minimum": 0 }
      }
    },
```

Replace `"layers": { "type": "array" },` with:

```json
        "layers": {
          "type": "array",
          "items": { "$ref": "#/$defs/evidenceLayer" },
          "allOf": [
            {
              "contains": { "properties": { "mediaType": { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/sbom" } } },
              "minContains": 1, "maxContains": 1
            },
            {
              "contains": { "properties": { "mediaType": { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/vulnerabilityScan" } } },
              "minContains": 1, "maxContains": 1
            },
            {
              "contains": { "properties": { "mediaType": { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/layerSecretScan" } } },
              "minContains": 1, "maxContains": 1
            },
            {
              "contains": { "properties": { "mediaType": { "$ref": "#/$defs/constants/properties/layerMediaTypes/properties/filesystemSecretScan" } } },
              "minContains": 1, "maxContains": 1
            }
          ]
        },
```

Note there is no `minItems`/`maxItems` here — see the note above Step 1 for why that keyword was left out rather than added and never witnessed.

- [ ] **Step 5: Run to verify it passes**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=15 failed=0`.

- [ ] **Step 6: Hand-verify attribution**

```bash
cp .github/contracts/release-evidence-set.schema.json /tmp/es-schema-backup.json
```

Remove the entire `allOf` block (the four `contains` checks) from `layers`, keep `items`, run the harness. Expected: `passed=12 failed=3`, the three failures are `too-few-layers.json`, `too-many-layers.json`, and `duplicate-layer-media-type.json` — all three collapse onto this one guard, which is exactly why no separate `minItems`/`maxItems` is needed. Restore.

Change `evidenceLayer`'s `mediaType` from the four-way `anyOf` to `{"type": "string"}`, run the harness. Expected: `passed=14 failed=1`, the one failure is `wrong-layer-media-type.json`. Restore.

Remove `"additionalProperties": false` from `evidenceLayer`, run the harness. Expected: `passed=14 failed=1`, the one failure is `layer-extra-field.json`. Restore.

Change `evidenceLayer.digest`'s `$ref` to `{"type": "string"}`, run the harness. Expected: `passed=14 failed=1`, the one failure is `layer-bad-digest.json`. Restore.

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=15 failed=0`.

- [ ] **Step 7: shellcheck (no shell files changed, but confirm nothing else regressed)**

```bash
tmp=$(mktemp -d)
tr -d '\r' < .github/scripts/evidence-set-schema.test.sh > "$tmp/evidence-set-schema.test.sh"
shellcheck --severity=warning -x --source-path="$tmp" "$tmp"/evidence-set-schema.test.sh
```

Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add .github/contracts/release-evidence-set.schema.json .github/contracts/evidence-set-fixtures
git commit -m "contract(ci): decide where evidence lives and how long it lives (2/2)

Layers: exactly four, identified by mediaType via contains/minContains/
maxContains rather than by array position. No minItems/maxItems -- tried
first, found completely redundant by pigeonhole (four required distinct
kinds each capped at maxContains:1 already forces exactly four items) and
confirmed empirically that removing it flipped no fixture, so it was left
out rather than shipped unwitnessed.

RED first: passed=9 failed=6, all six new fixtures 'accepted but filed as
invalid'. GREEN after tightening layers: passed=15 failed=0. Four guards
hand-verified: the four-way contains block alone catches too-few/too-many/
duplicate together; the mediaType anyOf catches a fifth, out-of-enum layer
appended after the four correct ones; additionalProperties catches an extra
field; the digest \$ref catches a malformed digest. Each removal reddened
exactly its fixture(s) and nothing else."
```

---

### Task 3: Subject descriptor — full descriptor, platform manifest not index

**Files:**
- Modify: `.github/contracts/release-evidence-set.schema.json`
- Modify: `.github/contracts/evidence-set-fixtures/expectations.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/subject-missing-field.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/subject-extra-field.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/subject-is-an-index.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/subject-bad-digest.json`

**Interfaces:**
- Consumes: `release-envelope.schema.json#/$defs/constants/properties/manifestMediaType` (repo-existing, same constant Task 1 already reuses for the manifest's own `mediaType` — reusing it again here is what encodes "the image subject is a platform manifest, not an OCI index" as an executable rule instead of a sentence in the spec).
- Produces: `#/$defs/evidenceSetManifest`'s tightened `subject` property.

- [ ] **Step 1: Write the four new invalid fixtures**

`.github/contracts/evidence-set-fixtures/invalid/subject-missing-field.json` — copy `valid/monolith.json`, drop `size` from `subject`:
```json
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  }
```

`.github/contracts/evidence-set-fixtures/invalid/subject-extra-field.json` — copy `valid/monolith.json`, add a field to `subject`:
```json
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "size": 3311,
    "platform": { "architecture": "amd64", "os": "linux" }
  }
```
(the extra field is a real OCI descriptor field, `platform` — chosen because it is the exact kind of thing a tool would add if `subject` mistakenly pointed at an index entry instead of a manifest, so this fixture is a plausible real mistake, not an arbitrary one)

`.github/contracts/evidence-set-fixtures/invalid/subject-is-an-index.json` — copy `valid/monolith.json`, change `subject.mediaType` to the OCI index media type:
```json
  "subject": {
    "mediaType": "application/vnd.oci.image.index.v1+json",
    "digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "size": 3311
  }
```

`.github/contracts/evidence-set-fixtures/invalid/subject-bad-digest.json` — copy `valid/monolith.json`, uppercase two hex characters in the subject digest (still 64 characters, no longer matching `[0-9a-f]{64}` because of the uppercase):
```json
    "digest": "sha256:eeEEeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
```

- [ ] **Step 2: Add all four to `expectations.json`, all `"rejects"`**

```json
  "invalid/subject-missing-field.json": "rejects",
  "invalid/subject-extra-field.json": "rejects",
  "invalid/subject-is-an-index.json": "rejects",
  "invalid/subject-bad-digest.json": "rejects"
```

- [ ] **Step 3: Run to verify the new fixtures fail**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=16 failed=4` — the four new fixtures all report `accepted but filed as invalid`.

- [ ] **Step 4: Tighten `subject`**

In `.github/contracts/release-evidence-set.schema.json`, replace `"subject": { "type": "object" },` with:

```json
        "subject": {
          "type": "object",
          "additionalProperties": false,
          "required": ["mediaType", "digest", "size"],
          "properties": {
            "mediaType": { "$ref": "release-envelope.schema.json#/$defs/constants/properties/manifestMediaType" },
            "digest": { "$ref": "observation.schema.json#/$defs/digest" },
            "size": { "type": "integer", "minimum": 0 }
          }
        },
```

- [ ] **Step 5: Run to verify it passes**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=20 failed=0`.

- [ ] **Step 6: Hand-verify attribution**

```bash
cp .github/contracts/release-evidence-set.schema.json /tmp/es-schema-backup.json
```

Remove `"required": ["mediaType", "digest", "size"],` from `subject`, run the harness. Expected: `passed=19 failed=1`, the one failure is `subject-missing-field.json`. Restore.

Remove `"additionalProperties": false` from `subject`, run the harness. Expected: `passed=19 failed=1`, the one failure is `subject-extra-field.json`. Restore.

Change `subject.mediaType`'s `$ref` to `{"type": "string"}`, run the harness. Expected: `passed=19 failed=1`, the one failure is `subject-is-an-index.json`. Restore.

Change `subject.digest`'s `$ref` to `{"type": "string"}`, run the harness. Expected: `passed=19 failed=1`, the one failure is `subject-bad-digest.json`. Restore.

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=20 failed=0`.

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/release-evidence-set.schema.json .github/contracts/evidence-set-fixtures
git commit -m "contract(ci): decide where evidence lives and how long it lives (3/3)

Subject: full descriptor, closed field set, mediaType pinned to the same
manifestMediaType constant the carrier's own mediaType already reuses --
which is what turns 'the image subject is a platform manifest, not an OCI
index' from a sentence in the spec into an executable rule, since crane
defaults to exporting all platforms and an index subject would silently name
a different digest than what actually got scanned.

RED first: passed=16 failed=4, all four new fixtures 'accepted but filed as
invalid'. GREEN after tightening subject: passed=20 failed=0. Four guards
hand-verified: required catches a missing field, additionalProperties catches
platform (chosen because it is what an index entry actually looks like, not
an arbitrary extra key), the mediaType $ref catches an index media type, the
digest $ref catches a malformed digest. Each removal reddened exactly its
fixture."
```

---

### Task 4: Annotations forbidden at every descriptor level

**Files:**
- Modify: `.github/contracts/evidence-set-fixtures/expectations.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/annotations-at-manifest.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/annotations-at-config.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/annotations-at-layer.json`
- Create: `.github/contracts/evidence-set-fixtures/invalid/annotations-at-subject.json`

**Interfaces:**
- Consumes: nothing new. `additionalProperties: false` at all four levels already exists — Task 1 added it at the manifest level, Task 1's `$ref` into `release-envelope.schema.json#/$defs/constants/properties/emptyConfig` carries it for config (that file already closes the field set there), Task 2 added it for each layer, Task 3 added it for subject.
- Produces: nothing new.

This task adds **no schema code**. Spec §2 names `annotations` specifically because OCI permits it on any descriptor and real tools inject it without being asked — 3a §2's own history records `oras push` adding `org.opencontainers.image.title` and `created` with no flag to suppress it. A generic "extra field" fixture and an `annotations`-shaped one exercise the identical schema keyword (`additionalProperties: false`), so this is not a fourth mechanism to build; it is proof that the mechanism already shipped covers the one field name the spec calls out by name, for the one producer behaviour that is a documented real risk rather than a hypothetical one.

- [ ] **Step 1: Write the four fixtures**

`.github/contracts/evidence-set-fixtures/invalid/annotations-at-manifest.json` — copy `valid/monolith.json`, add a top-level key:
```json
  "annotations": {
    "org.opencontainers.image.created": "2026-08-06T00:00:00Z"
  },
```

`.github/contracts/evidence-set-fixtures/invalid/annotations-at-config.json` — copy `valid/monolith.json`, add the key inside `config`:
```json
  "config": {
    "mediaType": "application/vnd.oci.empty.v1+json",
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "size": 2,
    "data": "e30=",
    "annotations": {
      "org.opencontainers.image.title": "config"
    }
  },
```

`.github/contracts/evidence-set-fixtures/invalid/annotations-at-layer.json` — copy `valid/monolith.json`, add the key inside the first layer:
```json
    {
      "mediaType": "application/vnd.evts.evidence.sbom.v1+json",
      "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "size": 4096,
      "annotations": {
        "org.opencontainers.image.title": "sbom.json"
      }
    }
```

`.github/contracts/evidence-set-fixtures/invalid/annotations-at-subject.json` — copy `valid/monolith.json`, add the key inside `subject`:
```json
  "subject": {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "size": 3311,
    "annotations": {}
  }
```
(an empty object, deliberately — "the key must be absent" per spec §2 means absence, not emptiness; `{}` and no key at all are different bytes and therefore a different digest, the same distinction this codebase's marker envelope already draws for `data`/`content`)

- [ ] **Step 2: Add all four to `expectations.json`, all `"rejects"`**

```json
  "invalid/annotations-at-manifest.json": "rejects",
  "invalid/annotations-at-config.json": "rejects",
  "invalid/annotations-at-layer.json": "rejects",
  "invalid/annotations-at-subject.json": "rejects"
```

- [ ] **Step 3: Run — this should already be GREEN, not RED**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=25 failed=0`. If any of these four fail, the guard that was supposed to cover it (Task 1's manifest-level `additionalProperties: false`, `release-envelope.schema.json`'s existing config closure, Task 2's layer closure, or Task 3's subject closure) is not doing what earlier tasks assumed — stop and re-examine the relevant task before writing new schema code, rather than adding a fifth mechanism on top.

- [ ] **Step 4: Hand-verify attribution for the level this task is actually about**

These four fixtures are witnesses for guards that already exist, so the attribution check is retrospective — confirm each of the four `additionalProperties: false` sites is still exactly what each fixture depends on, one at a time:

```bash
cp .github/contracts/release-evidence-set.schema.json /tmp/es-schema-backup.json
```

Remove `"additionalProperties": false` from `evidenceSetManifest` (the top-level manifest object added in Task 1), run the harness. Expected: `passed=24 failed=1`, the one failure is `annotations-at-manifest.json`. Restore.

Remove `"additionalProperties": false` from `evidenceLayer` (Task 2), run the harness. Expected: `passed=23 failed=2` — TWO failures, not one: `layer-extra-field.json` (Task 2's own witness for this guard) and `annotations-at-layer.json` both depend on the identical guard, so both flip together. This is the same kind of guard-sharing Task 2's own `contains` block showed for too-few/too-many/duplicate, just discovered here instead of predicted in advance. Restore.

Remove `"additionalProperties": false` from `subject` (Task 3), run the harness. Expected: `passed=23 failed=2` — TWO failures: `subject-extra-field.json` (Task 3's own witness) and `annotations-at-subject.json`, same reasoning. Restore.

For `annotations-at-config.json`: this one depends on `release-envelope.schema.json`'s existing `emptyConfig` definition, which this plan does not modify. Confirm the dependency exists rather than assuming it — open `.github/contracts/release-envelope.schema.json` and confirm `$defs/constants/properties/emptyConfig` has `"additionalProperties": false`. It does (this was written in 3a commit 5b). No removal test needed for a file this task does not touch; recording the confirmation is the check.

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=25 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/contracts/evidence-set-fixtures
git commit -m "contract(ci): decide where evidence lives and how long it lives (4/4)

Witnesses only, no schema change. Spec section 2 names 'annotations'
specifically because 3a section 2's own history records oras push adding
org.opencontainers.image.title and created with no flag to suppress it -- a
documented real producer risk, not a hypothetical one. The four
additionalProperties:false sites that forbid it (manifest from task 1, config
from release-envelope.schema.json's existing emptyConfig, layer from task 2,
subject from task 3) already existed; this commit is the fixture proving each
one is what specifically stops that key, by name, rather than assuming a
generic extra-field guard already covered it.

passed=25 failed=0. Three removals hand-verified (manifest/layer/subject);
config's guard confirmed present in release-envelope.schema.json rather than
re-tested, since this commit does not touch that file."
```

---

### Task 5: Lifecycle documentation, CI wiring, and verification

**Files:**
- Modify: `.github/contracts/release-evidence-set.schema.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: nothing new. This task closes the commit out.

The lifecycle rules (spec §2 "Lifecycle") and the four `cleanupDebt` states (spec §2 "`cleanupDebt` có bốn trạng thái") describe obligations for a garbage-collection job that does not exist yet — retention, offline archive and scheduled reachability all belong to the eventual publish/cleanup job (spec header: out of scope until after 3a commit 6, the collector, and the publish job). There is nothing to test here because there is no code yet that could violate these rules. Recording them as executable-sounding fixtures would be exactly the kind of untested claim this project's culture has repeatedly had to walk back (`markerEnvelope`'s own precedent: shipped with a header stating plainly "nothing validates against this yet ... a debt the publish job's commit pays" rather than inventing a fixture to make the debt look paid). This task states the same kind of debt, as prose, in the same place a future reader would look for it.

- [ ] **Step 1: Add the lifecycle and cleanupDebt documentation to the schema header**

In `.github/contracts/release-evidence-set.schema.json`, extend the top-level `"description"` field (the file created in Task 1) to also cover lifecycle and cleanup state. Replace the current `"description"` value with:

```json
  "description": "A′ (spec section 2): two of these per commit, one per image, each carrying exactly four canonical report layers -- SBOM, vulnerability scan, layer secret scan, filesystem secret scan -- identified by mediaType, not by position. Tag policy (evidence-monolith-sha-<commit>, evidence-frontend-sha-<commit>) is a registry-level fact about which tag points at this manifest's digest, not a JSON-shape fact this schema can see; it becomes checkable in 3b commit 2, when evidenceSetLookup exists to observe it. Byte caps (spec section 7) gate what a collector may fetch, not what a fetched document may contain, and are likewise out of scope here.\n\nLifecycle and cleanupDebt (spec section 2) are stated here as a debt, not as an enforced rule: retention, offline archive and a scheduled reachability check must cover both the carrier manifest and its four report blobs, or a retention rule that only looks at the image's own tag lets evidence expire before the release it backs. An evidence-set has four states for cleanup purposes -- unanchored staging (adoptable, only after a grace period), prepared-anchored (protected: the recovery asset of the PARTIAL path), final-anchored (a release asset, never deleted), and invalid/untrusted (kept for investigation, never auto-deleted) -- and nothing validates any of this yet, because the job that would perform cleanup does not exist. This is the same debt markerEnvelope's own header records for its structural half: a schema can state what must eventually be true without a fixture pretending the claim is already being kept.",
```

- [ ] **Step 2: Validate the schema is still well-formed JSON**

```bash
export PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python
"$PYTHON_BIN" -c "import json; json.load(open('.github/contracts/release-evidence-set.schema.json', encoding='utf-8')); print('json ok')"
```

Expected: `json ok`.

- [ ] **Step 3: Run the full harness one more time**

```bash
"$PUBLISH_DECISION_BASH" .github/scripts/evidence-set-schema.test.sh
```

Expected: `passed=25 failed=0` (the description text change does not affect validation).

- [ ] **Step 4: Wire the harness into `ci.yml`**

In `.github/workflows/ci.yml`, inside the existing "Check the contract and the decision still agree" step (the one that already runs `contract-agreement.test.sh`, `contract-agreement.report.test.sh`, and `manifest-agreement.test.sh` after installing `jsonschema`/`referencing`), add one line after `manifest-agreement.test.sh`:

```yaml
          # The evidence-set carrier has no decision-side consumer yet -- 3b commit 2 gives the
          # decision evidenceSetLookup -- so unlike its siblings this suite asserts schema accept/
          # reject only. It exists at all because release-envelope.schema.json shipped once with
          # zero witnesses on its entire validated content and a whole-branch review had to find that.
          bash .github/scripts/evidence-set-schema.test.sh
```

- [ ] **Step 5: Validate the workflow YAML**

```bash
"$PYTHON_BIN" -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml', encoding='utf-8')); print('yaml ok')"
```

Expected: `yaml ok`. If `pyyaml` is not installed: `"$PYTHON_BIN" -m pip install --quiet pyyaml` first.

- [ ] **Step 6: actionlint, the way CI runs it**

```bash
export PATH="$PATH:/c/Users/Hlow/AppData/Local/Programs/Python/Python312/Scripts"
curl --fail --silent --show-error --location --output /tmp/actionlint.tar.gz \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_windows_amd64.zip 2>/dev/null || true
```

If a Linux/Windows binary from an earlier session is still available, reuse it; otherwise download per the version pinned in `ci.yml`'s "Lint workflows" step (`ACTIONLINT_VERSION`/`ACTIONLINT_SHA256`) and run:

```bash
actionlint -shellcheck=shellcheck .github/workflows/ci.yml
```

Expected: no output, exit 0. (This step caught a real bug earlier in this branch's history — an `SC2016` false positive from a different guard — so it is not a formality; run it, do not skip on the assumption YAML that merges cleanly must also lint cleanly.)

- [ ] **Step 7: Full local suite sweep**

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

Expected: every suite reports `passed=N failed=0` with no suite's `N` lower than it was before this task (`publish-decision` 181, `contract-agreement` 28, `contract-agreement.report` 7, `manifest-agreement` 15, `canonical` 3, `envelope` 8, `interpreter-override` 11, `require-green-run` 22, `common-sh-usage` 6, `evidence-set-schema` 25).

**Do not run `publish-decision.mutations.py`** — it takes over 20 minutes and this commit does not touch `publish-decision.sh`, so its result cannot have changed.

- [ ] **Step 8: shellcheck over every script directory**

```bash
tmp=$(mktemp -d)
for f in backend/infra/production/scripts/*.sh .github/scripts/*.sh; do
  tr -d '\r' < "$f" > "$tmp/$(basename "$f")"
done
shellcheck --severity=warning -x --source-path="$tmp" "$tmp"/*.sh
```

Expected: no output, exit 0.

- [ ] **Step 9: Update the ledger**

Append to `.superpowers/sdd/progress.md` (gitignored, not committed to the repo, but the working memory this project relies on across sessions):

```
## 3b commit 1: decide where evidence lives and how long it lives

Complete (commits <fill in the five short SHAs after committing>).
release-evidence-set.schema.json + evidence-set-schema.test.sh + 22 fixtures.
No decision-side changes -- commit 2 is what gives the decision
evidenceSetLookup. Lifecycle/cleanupDebt states are documented as debt in the
schema header, not tested, matching markerEnvelope's own precedent (5b) for
an obligation with no code yet to hold it to.

Every guard hand-verified load-bearing by removal: schemaVersion, mediaType,
artifactType, config (task 1); layers' four-way contains block alone covers
too-few/too-many/duplicate (no separate minItems/maxItems -- tried, found
redundant by pigeonhole, left out), mediaType anyOf, layer
additionalProperties, layer digest pattern (task 2); subject
required/additionalProperties/mediaType/digest (task 3); annotations
forbidden at manifest/layer/subject re-verified, config's closure confirmed
present in release-envelope.schema.json rather than re-tested since this
commit doesn't touch that file (task 4).

Next: 3b commit 2, "let the decision see the evidence set" -- two new
top-level lookups (monolithEvidenceSet, frontendEvidenceSet), evidenceSetLookup
with four report/attestation pairs nested inside, adopt/CONFLICT rules, tag
re-resolve before writing a marker. Then 3b commits 3-7, then 3a commit 6
(freeze the payload, deferred until evidence's shape settled here), then the
collector, then the publish job.
```

- [ ] **Step 10: Push and read CI**

```bash
git add .github/workflows/ci.yml .github/contracts/release-evidence-set.schema.json
git commit -m "contract(ci): decide where evidence lives and how long it lives (5/5)

Lifecycle and cleanupDebt's four states, documented in the schema header as a
debt the eventual cleanup job pays -- same shape as markerEnvelope's own
'nothing validates against this yet' precedent from 3a commit 5b, because
there is no code yet that could violate either rule.

Wired evidence-set-schema.test.sh into ci.yml's existing contract step, same
step contract-agreement/manifest-agreement already run in since it needs the
same pinned jsonschema/referencing. actionlint clean, every sibling suite
still green at its previous count, shellcheck clean over both script
directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commit (`gh run list --branch ci/ghcr-publish --limit 2`, then `gh run watch <id> --exit-status`), and separately confirm the run actually exercised the new suite rather than merely reporting green:

```bash
gh run view <run-id> --log 2>/dev/null | grep -i "evidence-set-schema\|passed="
```

Expected to see `passed=25 failed=0` attributed to the new suite's own output line, not merely inferred from an overall green checkmark — this project's own history includes more than one case where a suite that looked wired in was never actually executed.

---

## Self-Review

**Spec coverage** — spec §2 (A′) line by line against the five tasks:
- Two artifacts, monolith + frontend → Task 1's two valid fixtures.
- Exactly four canonical layers, each own mediaType, identified by mediaType not position → Task 2, with the frontend fixture's deliberately reordered layers as the position-independence witness.
- Tag policy → explicitly out of scope, stated in Global Constraints and the schema header, deferred to commit 2.
- `subject` full descriptor, no annotations, platform manifest not index → Tasks 3 and 4.
- Marker payload's `evidenceSetDigest` under `evidence` → not this commit's concern; the marker's own schema does not change until commit 2 gives the decision something to check it against.
- `release-evidence-set.schema.json` table (schemaVersion/mediaType/artifactType/config/layers/subject/annotations/tag policy) → every row except tag policy has a task; tag policy is the one row explicitly deferred.
- Lifecycle, cleanupDebt four states → Task 5, as documentation-only debt, matching precedent.
- "Dựng và kiểm bằng đúng thủ tục 6 bước của 3a §2" → that procedure is a producer-side (collector) obligation; this commit ships no producer, so there is nothing to run the 6-step procedure against yet. Recorded as a gap for the collector's own commit, not silently dropped.

**Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" anywhere in the tasks above; every fixture is complete JSON, every schema snippet is complete, every command has an expected output stated.

**Type consistency** — `evidenceLayer` (Task 2) and `subject` (Task 3) both close their field sets with `additionalProperties: false` and both are consumed the same way in Task 4's attribution checks. `expectations.json`'s two-valued vocabulary (`"accepts"`/`"rejects"`) is used identically in every task; no task introduces a third value or a differently-shaped entry.
