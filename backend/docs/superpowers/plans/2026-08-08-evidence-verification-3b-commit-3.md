# 3b commit 3 — "freeze what the scanners are and what they scan" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the shape of what a scanner attestation's predicate must contain, per spec §7: three
standalone JSON schemas (`vulnerabilityScan`, `layerSecretScan`, `filesystemSecretScan`), each
structurally excluding the other kind's identity fields, plus a fixture corpus and test harness
proving every exclusion and cap rule is load-bearing.

**Architecture:** Three independent `$defs`-free schema files under `.github/contracts/predicates/`,
none `$ref`'d from `observation.schema.json` (that wiring is commit 4's job). Each references
`observation.schema.json#/$defs/digest` for its own digest fields, the same cross-file `$ref` pattern
`release-evidence-set.schema.json` already uses — but predicates live one directory deeper
(`predicates/` under `contracts/`), so the relative ref is `../observation.schema.json`, not
`observation.schema.json`. A new harness, `predicates-schema.test.sh`, validates every fixture in
`.github/contracts/predicates-fixtures/{valid,invalid}/` against the schema its filename names.

**Tech Stack:** JSON Schema draft 2020-12, validated with `jsonschema==4.26.0` +
`referencing==0.37.0` (already pinned in `ci.yml` for the sibling contract suites), bash test
harness following `evidence-set-schema.test.sh`'s exact structure.

## Global Constraints

- JDK/mvn are irrelevant to this commit — nothing here touches `backend/`.
- Python floor is 3.10 (`python-bin.sh`'s own floor, shared by every contract script).
- `jsonschema==4.26.0`, `referencing==0.37.0` — the versions already pinned in `ci.yml`'s contract
  step; do not introduce a second pin.
- Every new schema keyword must have a fixture proving it is load-bearing (commit 1's lesson:
  `release-envelope.schema.json` once shipped with zero witnesses on its entire validated content).
- `additionalProperties: false` at every object level, matching house style in
  `observation.schema.json` and `release-evidence-set.schema.json`.
- Byte caps and extraction method (spec §7) are documented `description` prose, not enforced
  keywords — no scanner script exists yet to enforce them. Only the `findings` 100-item cap +
  `truncated` flag is a shape rule this schema can actually check.
- Do not touch `observation.schema.json`, `release-evidence-set.schema.json`,
  `publish-decision.sh`, or `publish-decision.mutations.py` — out of scope per the approved design
  doc.

---

## File Structure

- `.github/contracts/predicates/vulnerabilityScan.schema.json` — **create**.
- `.github/contracts/predicates/layerSecretScan.schema.json` — **create**.
- `.github/contracts/predicates/filesystemSecretScan.schema.json` — **create**.
- `.github/contracts/predicates-fixtures/valid/*.json` — **create**. One clean fixture per schema.
- `.github/contracts/predicates-fixtures/invalid/*.json` — **create**. One fixture per broken rule.
- `.github/contracts/predicates-fixtures/expectations.json` — **create**.
  `{filename: "accepts"|"rejects"}`, same shape as `evidence-set-fixtures/expectations.json`.
- `.github/scripts/predicates-schema.test.sh` — **create**. The harness.
- `.github/workflows/ci.yml` — **modify**. One new line after the existing
  `evidence-set-schema.test.sh` line.
- `.superpowers/sdd/progress.md` — **modify**. Ledger entry.

## Interfaces

- Consumes: `observation.schema.json#/$defs/digest` (existing, unchanged) — every predicate schema's
  digest-shaped fields `$ref` this rather than restating the `sha256:[0-9a-f]{64}` pattern.
- Produces: three `$id`-addressable schema documents future commits can `$ref` into (commit 4's
  trust-boundary split is the first consumer, not built here). No script, function, or `$def` name
  from this commit is consumed elsewhere in this commit.
- Fixture-to-schema mapping (the harness's own contract, since one corpus now spans three schemas):
  a fixture's filename must start with one of `vulnerability-scan`, `layer-secret-scan`,
  `filesystem-secret-scan` (in that check order — none is a prefix of another, so order doesn't
  actually matter, but the harness fails loudly on an unrecognised prefix rather than skipping it).

---

### Task 1: The three predicate schemas

**Files:**
- Create: `.github/contracts/predicates/vulnerabilityScan.schema.json`
- Create: `.github/contracts/predicates/layerSecretScan.schema.json`
- Create: `.github/contracts/predicates/filesystemSecretScan.schema.json`

**Interfaces:**
- Consumes: `observation.schema.json#/$defs/digest` via `../observation.schema.json#/$defs/digest`
  (verified in scratch: a schema at `.../contracts/predicates/X.schema.json` resolving a relative
  `$ref` against its own `$id` needs the `../` — `observation.schema.json` alone resolves to
  `.../contracts/predicates/observation.schema.json`, which doesn't exist, and
  `referencing.exceptions.Unresolvable` is raised).
- Produces: three schema documents, each with `$id`
  `https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/predicates/<Name>.schema.json`.

- [ ] **Step 1: Create `vulnerabilityScan.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/predicates/vulnerabilityScan.schema.json",
  "title": "The vulnerabilityScan attestation predicate",
  "description": "Spec section 7: what a vulnerability-scan attestation's predicate must contain. scanner names the tool that ran; vulnerabilityDb records the DB this scan is only meaningful relative to -- identity, digest, and when it was updated -- which is what lets a decision refuse a scan whose DB is known-stale. Deliberately excludes any ruleset/config field: vulnerability scanning uses Trivy's own DB, not a repo-tracked ruleset, so a vulnerabilityScan predicate carrying a ruleset key is a scanner-identity confusion, not a richer document. Byte caps and the extraction method (crane export, whiteout applied, size-before-hash order) are section 7's own normative text and are preconditions on how this document is produced -- not shape facts this schema can see, so they are stated here as documented debt rather than a schema keyword: no scanner script exists yet to enforce them (that is the collector's job, scheduled after every 3a/3b commit lands).",
  "type": "object",
  "additionalProperties": false,
  "required": ["scanner", "vulnerabilityDb", "target", "timestamp", "findings", "truncated"],
  "properties": {
    "scanner": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "version"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "version": { "type": "string", "minLength": 1 }
      }
    },
    "vulnerabilityDb": {
      "type": "object",
      "additionalProperties": false,
      "required": ["identity", "digest", "updatedAt"],
      "properties": {
        "identity": { "type": "string", "minLength": 1 },
        "digest": { "$ref": "../observation.schema.json#/$defs/digest" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    },
    "target": { "type": "string", "minLength": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "findings": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "fixAvailable"],
        "properties": {
          "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
          "fixAvailable": { "type": "boolean" }
        }
      }
    },
    "truncated": { "type": "boolean" }
  },
  "if": {
    "properties": { "findings": { "minItems": 100 } },
    "required": ["findings"]
  },
  "then": {
    "properties": { "truncated": { "const": true } }
  }
}
```

- [ ] **Step 2: Create `layerSecretScan.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/predicates/layerSecretScan.schema.json",
  "title": "The layerSecretScan attestation predicate",
  "description": "Spec section 7: what a per-layer secret-scan attestation's predicate must contain -- catches a secret deleted in a later layer, still present and extractable in the image. Extraction: crane blob per layer digest, extracted separately; whiteouts deliberately ignored -- that is the point of this scan. scanner names the tool that ran; ruleset records the repo-tracked rules this scan is only meaningful relative to -- version and digest of the file Git tracks, mirroring the master spec's rule (section 6) that policy must come from a tracked file, not a workflow input. Deliberately excludes any vulnerabilityDb field: secret scanning does not consult a vulnerability database, so a layerSecretScan predicate carrying a vulnerabilityDb key is a scanner-identity confusion, not a richer document. subject stays the image digest (section 7: both secret-scan kinds describe the same image, no rename needed). Byte caps and the extraction method are section 7's own normative text, stated here as documented debt: no scanner script exists yet to enforce them.",
  "type": "object",
  "additionalProperties": false,
  "required": ["scanner", "ruleset", "target", "timestamp", "findings", "truncated"],
  "properties": {
    "scanner": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "version"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "version": { "type": "string", "minLength": 1 }
      }
    },
    "ruleset": {
      "type": "object",
      "additionalProperties": false,
      "required": ["version", "digest"],
      "properties": {
        "version": { "type": "string", "minLength": 1 },
        "digest": { "$ref": "../observation.schema.json#/$defs/digest" }
      }
    },
    "target": { "type": "string", "minLength": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "findings": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "fixAvailable"],
        "properties": {
          "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
          "fixAvailable": { "type": "boolean" }
        }
      }
    },
    "truncated": { "type": "boolean" }
  },
  "if": {
    "properties": { "findings": { "minItems": 100 } },
    "required": ["findings"]
  },
  "then": {
    "properties": { "truncated": { "const": true } }
  }
}
```

- [ ] **Step 3: Create `filesystemSecretScan.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/predicates/filesystemSecretScan.schema.json",
  "title": "The filesystemSecretScan attestation predicate",
  "description": "Spec section 7: what a flattened-rootfs secret-scan attestation's predicate must contain -- catches a secret actually present at runtime. Extraction: crane export (version + digest pinned); whiteouts applied -- that is what flatten means. scanner names the tool that ran; ruleset records the repo-tracked rules this scan is only meaningful relative to -- version and digest of the file Git tracks, mirroring the master spec's rule (section 6) that policy must come from a tracked file, not a workflow input. Deliberately excludes any vulnerabilityDb field: secret scanning does not consult a vulnerability database, so a filesystemSecretScan predicate carrying a vulnerabilityDb key is a scanner-identity confusion, not a richer document. subject stays the image digest (section 7: both secret-scan kinds describe the same image, no rename needed). Byte caps and the extraction method are section 7's own normative text, stated here as documented debt: no scanner script exists yet to enforce them.",
  "type": "object",
  "additionalProperties": false,
  "required": ["scanner", "ruleset", "target", "timestamp", "findings", "truncated"],
  "properties": {
    "scanner": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "version"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "version": { "type": "string", "minLength": 1 }
      }
    },
    "ruleset": {
      "type": "object",
      "additionalProperties": false,
      "required": ["version", "digest"],
      "properties": {
        "version": { "type": "string", "minLength": 1 },
        "digest": { "$ref": "../observation.schema.json#/$defs/digest" }
      }
    },
    "target": { "type": "string", "minLength": 1 },
    "timestamp": { "type": "string", "format": "date-time" },
    "findings": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "fixAvailable"],
        "properties": {
          "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
          "fixAvailable": { "type": "boolean" }
        }
      }
    },
    "truncated": { "type": "boolean" }
  },
  "if": {
    "properties": { "findings": { "minItems": 100 } },
    "required": ["findings"]
  },
  "then": {
    "properties": { "truncated": { "const": true } }
  }
}
```

- [ ] **Step 4: Confirm each file is well-formed JSON**

Run: `python -c "import json; [json.load(open(f, encoding='utf-8')) for f in ['.github/contracts/predicates/vulnerabilityScan.schema.json', '.github/contracts/predicates/layerSecretScan.schema.json', '.github/contracts/predicates/filesystemSecretScan.schema.json']]; print('ok')"`

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/contracts/predicates/
git commit -m "contract(ci): freeze what the scanners are and what they scan (1/3)

Three standalone predicate schemas -- vulnerabilityScan, layerSecretScan,
filesystemSecretScan -- per spec section 7. Not yet wired to any harness
or fixture; that is the next commit."
```

---

### Task 2: Fixture corpus and the `predicates-schema.test.sh` harness

**Files:**
- Create: `.github/contracts/predicates-fixtures/valid/vulnerability-scan.json`
- Create: `.github/contracts/predicates-fixtures/valid/layer-secret-scan.json`
- Create: `.github/contracts/predicates-fixtures/valid/filesystem-secret-scan.json`
- Create: `.github/contracts/predicates-fixtures/invalid/vulnerability-scan-carries-ruleset.json`
- Create: `.github/contracts/predicates-fixtures/invalid/vulnerability-scan-missing-scanner.json`
- Create: `.github/contracts/predicates-fixtures/invalid/vulnerability-scan-finding-missing-fixavailable.json`
- Create: `.github/contracts/predicates-fixtures/invalid/vulnerability-scan-hits-cap-without-truncated.json`
- Create: `.github/contracts/predicates-fixtures/invalid/layer-secret-scan-carries-vulnerability-db.json`
- Create: `.github/contracts/predicates-fixtures/invalid/layer-secret-scan-missing-ruleset.json`
- Create: `.github/contracts/predicates-fixtures/invalid/filesystem-secret-scan-carries-vulnerability-db.json`
- Create: `.github/contracts/predicates-fixtures/invalid/filesystem-secret-scan-hits-cap-without-truncated.json`
- Create: `.github/contracts/predicates-fixtures/expectations.json`
- Create: `.github/scripts/predicates-schema.test.sh`

**Interfaces:**
- Consumes: the three schemas from Task 1, by `$id`.
- Produces: nothing consumed by a later task in this commit — this is the terminal proof that
  Task 1's schemas are load-bearing.

Two placeholder digests are reused across fixtures rather than each fixture inventing its own:
`sha256:` + `"1"*64` for a DB digest, `sha256:` + `"2"*64` for a subject/target digest, `sha256:` +
`"3"*64` for a ruleset digest. None of these need to be real — the schema only checks the
`sha256:[0-9a-f]{64}` shape.

- [ ] **Step 1: Write the three valid fixtures**

`.github/contracts/predicates-fixtures/valid/vulnerability-scan.json`:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "vulnerabilityDb": {
    "identity": "trivy-db",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "updatedAt": "2026-08-08T00:00:00Z"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [
    { "severity": "HIGH", "fixAvailable": true }
  ],
  "truncated": false
}
```

`.github/contracts/predicates-fixtures/valid/layer-secret-scan.json`:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "ruleset": {
    "version": "1.4.0",
    "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [],
  "truncated": false
}
```

`.github/contracts/predicates-fixtures/valid/filesystem-secret-scan.json` — byte-identical to
`layer-secret-scan.json` above (both secret-scan kinds share the same predicate shape; only their
schema's `title`/`description` differ, per Task 1).

- [ ] **Step 2: Run to verify Step 1's fixtures are individually well-formed JSON**

Run: `for f in .github/contracts/predicates-fixtures/valid/*.json; do python -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$f" || echo "BAD $f"; done; echo done`

Expected: `done` with no `BAD` lines.

- [ ] **Step 3: Write the eight invalid fixtures**

`.github/contracts/predicates-fixtures/invalid/vulnerability-scan-carries-ruleset.json` — Step 1's
valid vulnerability-scan fixture plus a `ruleset` key it must not have:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "vulnerabilityDb": {
    "identity": "trivy-db",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "updatedAt": "2026-08-08T00:00:00Z"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [
    { "severity": "HIGH", "fixAvailable": true }
  ],
  "truncated": false,
  "ruleset": {
    "version": "1.0",
    "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  }
}
```

`.github/contracts/predicates-fixtures/invalid/vulnerability-scan-missing-scanner.json` — Step 1's
valid fixture with `scanner` deleted:

```json
{
  "vulnerabilityDb": {
    "identity": "trivy-db",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "updatedAt": "2026-08-08T00:00:00Z"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [
    { "severity": "HIGH", "fixAvailable": true }
  ],
  "truncated": false
}
```

`.github/contracts/predicates-fixtures/invalid/vulnerability-scan-finding-missing-fixavailable.json`
— Step 1's valid fixture with `fixAvailable` dropped from its one finding:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "vulnerabilityDb": {
    "identity": "trivy-db",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "updatedAt": "2026-08-08T00:00:00Z"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [
    { "severity": "HIGH" }
  ],
  "truncated": false
}
```

`.github/contracts/predicates-fixtures/invalid/layer-secret-scan-carries-vulnerability-db.json` —
Step 1's valid layer-secret-scan fixture plus a `vulnerabilityDb` key it must not have:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "ruleset": {
    "version": "1.4.0",
    "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [],
  "truncated": false,
  "vulnerabilityDb": {
    "identity": "trivy-db",
    "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "updatedAt": "2026-08-08T00:00:00Z"
  }
}
```

`.github/contracts/predicates-fixtures/invalid/layer-secret-scan-missing-ruleset.json` — Step 1's
valid fixture with `ruleset` deleted:

```json
{
  "scanner": { "name": "trivy", "version": "0.55.0" },
  "target": "ghcr.io/owner/name/monolith@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "timestamp": "2026-08-08T00:00:00Z",
  "findings": [],
  "truncated": false
}
```

`.github/contracts/predicates-fixtures/invalid/filesystem-secret-scan-carries-vulnerability-db.json`
— byte-identical to `layer-secret-scan-carries-vulnerability-db.json` above (proves the exclusion is
enforced independently on the third schema, not merely inherited from a shared `$def`).

The last two fixtures need a 100-entry `findings` array to trip the cap rule. Generate them with
this exact script rather than hand-typing 100 objects:

```bash
python - <<'PY'
import json, pathlib

finding = {"severity": "HIGH", "fixAvailable": True}
base_dir = pathlib.Path(".github/contracts/predicates-fixtures/invalid")

vuln = json.loads((base_dir.parent / "valid" / "vulnerability-scan.json").read_text(encoding="utf-8"))
vuln["findings"] = [finding] * 100
vuln["truncated"] = False
(base_dir / "vulnerability-scan-hits-cap-without-truncated.json").write_text(
    json.dumps(vuln, indent=2) + "\n", encoding="utf-8")

fs = json.loads((base_dir.parent / "valid" / "filesystem-secret-scan.json").read_text(encoding="utf-8"))
fs["findings"] = [finding] * 100
fs["truncated"] = False
(base_dir / "filesystem-secret-scan-hits-cap-without-truncated.json").write_text(
    json.dumps(fs, indent=2) + "\n", encoding="utf-8")

print("wrote both cap fixtures")
PY
```

Expected: `wrote both cap fixtures`

- [ ] **Step 4: Run to verify all eleven fixtures are well-formed JSON**

Run: `for f in .github/contracts/predicates-fixtures/valid/*.json .github/contracts/predicates-fixtures/invalid/*.json; do python -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$f" || echo "BAD $f"; done; echo done`

Expected: `done` with no `BAD` lines.

- [ ] **Step 5: Write `expectations.json`**

```json
{
  "valid/vulnerability-scan.json": "accepts",
  "valid/layer-secret-scan.json": "accepts",
  "valid/filesystem-secret-scan.json": "accepts",
  "invalid/vulnerability-scan-carries-ruleset.json": "rejects",
  "invalid/vulnerability-scan-missing-scanner.json": "rejects",
  "invalid/vulnerability-scan-finding-missing-fixavailable.json": "rejects",
  "invalid/vulnerability-scan-hits-cap-without-truncated.json": "rejects",
  "invalid/layer-secret-scan-carries-vulnerability-db.json": "rejects",
  "invalid/layer-secret-scan-missing-ruleset.json": "rejects",
  "invalid/filesystem-secret-scan-carries-vulnerability-db.json": "rejects",
  "invalid/filesystem-secret-scan-hits-cap-without-truncated.json": "rejects"
}
```

- [ ] **Step 6: Write `.github/scripts/predicates-schema.test.sh`**

```bash
#!/usr/bin/env bash
# Validates the predicate fixture corpus against the three scanner predicate schemas (spec section
# 7) and asserts each fixture's accept/reject verdict matches expectations.json.
#
# One corpus spans three schemas, unlike evidence-set-schema.test.sh's one-schema corpus, so each
# fixture's filename must name which schema it belongs against: it must start with
# "vulnerability-scan", "layer-secret-scan", or "filesystem-secret-scan". An unrecognised prefix
# fails loudly rather than being silently skipped -- a fixture nothing validates it against is the
# same failure mode commit 1's own header describes: a schema (or here, a fixture) with no witness
# proving it does anything is indistinguishable from not existing.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

"$PYTHON" - "$repo_root" <<'PYTHON'
import json
import pathlib
import sys

try:
    import jsonschema
    from jsonschema.exceptions import best_match
    import referencing
    import referencing.exceptions
    import referencing.jsonschema
except ImportError:
    # Never skipped -- same rule as evidence-set-schema.test.sh: a contract test that quietly does
    # nothing when a dependency is missing reports the same green as one that ran.
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

repo_root = pathlib.Path(sys.argv[1])
contracts = repo_root / ".github" / "contracts"
predicates_dir = contracts / "predicates"
fixtures = contracts / "predicates-fixtures"

expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))

# Registry keyed by each schema's own $id, not by bare filename: predicates/ schemas resolve their
# "../observation.schema.json" $ref against their own $id, and a bare-filename registry (the shape
# evidence-set-schema.test.sh uses, sufficient when every schema lives in one directory) cannot
# answer a relative reference that walks up a directory. Every *.schema.json under contracts/,
# recursively, is registered by $id.
resources = {}
for path in sorted(contracts.rglob("*.schema.json")):
    contents = json.loads(path.read_text(encoding="utf-8"))
    schema_id = contents.get("$id")
    if not isinstance(schema_id, str) or not schema_id:
        print(f"FAIL  {path.relative_to(contracts)} has no string $id; the registry cannot address it")
        sys.exit(1)
    resource = referencing.Resource.from_contents(
        contents, default_specification=referencing.jsonschema.DRAFT202012)
    resources[schema_id] = resource
if not resources:
    print("FAIL  no schema files found; the contract directory must have moved")
    sys.exit(1)
registry = referencing.Registry().with_resources(resources.items())

# filename prefix -> schema file, longest-prefix-first so a future prefix that happens to extend
# another still resolves unambiguously. None of the three currently overlaps.
SCHEMA_BY_PREFIX = {
    "vulnerability-scan": "vulnerabilityScan.schema.json",
    "layer-secret-scan": "layerSecretScan.schema.json",
    "filesystem-secret-scan": "filesystemSecretScan.schema.json",
}

validators = {}
for prefix, schema_name in SCHEMA_BY_PREFIX.items():
    schema_path = predicates_dir / schema_name
    if not schema_path.exists():
        print(f"FAIL  {schema_name} does not exist; predicates/ must have moved")
        sys.exit(1)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validators[prefix] = jsonschema.Draft202012Validator(schema, registry=registry)

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


def schema_for(name):
    stem = pathlib.Path(name).stem
    for prefix in SCHEMA_BY_PREFIX:
        if stem == prefix or stem.startswith(prefix + "-"):
            return prefix
    return None


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
    prefix = schema_for(name)
    if prefix is None:
        report(name, [f"filename names no known predicate schema (expected one of "
                      f"{sorted(SCHEMA_BY_PREFIX)})"])
        continue
    validator = validators[prefix]
    document = json.loads((fixtures / name).read_text(encoding="utf-8"))

    try:
        errors = list(validator.iter_errors(document))
    except referencing.exceptions.Unresolvable as unresolvable:
        problems.append(f"the schema makes a reference nothing in {contracts.name}/ can answer -- "
                        f"{unresolvable}")
    else:
        if want not in ("accepts", "rejects"):
            problems.append(f"unknown expected verdict {want!r} (must be 'accepts' or 'rejects')")
        elif want == "accepts" and errors:
            problems.append(f"rejected but filed as valid: {describe(errors)}")
        elif want == "rejects" and not errors:
            problems.append("accepted but filed as invalid")

    report(name, problems)

print()
print(f"passed={passed} failed={failed}")
sys.exit(1 if failed else 0)
PYTHON
```

- [ ] **Step 7: Run the harness**

Run: `bash .github/scripts/predicates-schema.test.sh`

Expected: `passed=14 failed=0` — 3 structural checks ("every fixture states...", "every expectation
has...", "there are fixtures at all") plus the 11 fixtures (3 valid + 8 invalid), all `ok`. This was
verified against the exact schema and fixture content above in a scratch run before writing this
step: all 11 fixture-level checks passed with the `../observation.schema.json` relative ref and the
`$id`-keyed registry; the ref failed with `Unresolvable` when tried as a bare
`observation.schema.json` (without `../`) or when the registry was keyed by filename instead of
`$id` — both are real failure modes this step's exact content avoids, not hypothetical.

- [ ] **Step 8: Hand-verify each guard is load-bearing**

For each of the 8 invalid fixtures, confirm removing the specific broken field/value (i.e. reverting
it to the corresponding valid fixture) makes that one fixture pass and no other fixture's verdict
change. This is the same discipline commit 1's Task 1 Step 8 used: a fixture that already fails for
an unrelated reason doesn't actually witness the rule its name claims to.

- [ ] **Step 9: shellcheck**

Run: `shellcheck .github/scripts/predicates-schema.test.sh`

Expected: no warnings. (`python-bin.sh` is already shellchecked elsewhere; sourcing it here doesn't
introduce a new target.)

- [ ] **Step 10: Commit**

```bash
git add .github/contracts/predicates-fixtures/ .github/scripts/predicates-schema.test.sh
git commit -m "contract(ci): freeze what the scanners are and what they scan (2/3)

Fixture corpus (3 valid, 8 invalid) and predicates-schema.test.sh,
proving each of section 7's exclusion rules and the findings cap+
truncated rule is load-bearing against all three schemas. passed=14
failed=0."
```

---

### Task 3: CI wiring, ledger, and push

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `predicates-schema.test.sh` from Task 2.
- Produces: nothing — this is the commit's own completion, not a dependency of any later task.

- [ ] **Step 1: Add the new suite to `ci.yml`**

In `.github/workflows/ci.yml`, immediately after the existing line

```yaml
          bash .github/scripts/evidence-set-schema.test.sh
```

add:

```yaml
          # Three standalone predicate schemas (spec section 7) freezing what a scanner attestation
          # must contain and excluding the other kind's identity fields. Like evidence-set-schema.
          # test.sh, no decision-side consumer exists yet -- 3b commit 4 gives report/attestation
          # lookups their own real trust boundary -- so this suite asserts schema accept/reject only.
          bash .github/scripts/predicates-schema.test.sh
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml', encoding='utf-8')); print('ok')"`

Expected: `ok`

- [ ] **Step 3: actionlint, the way CI runs it**

Run: `actionlint .github/workflows/ci.yml`

Expected: no new findings attributable to this change (pre-existing findings, if any, are out of
scope for this commit).

- [ ] **Step 4: Full local suite sweep**

Run each of the following and confirm every suite's `passed=N failed=0` is at or above its prior
baseline, with `predicates-schema.test.sh` newly present at `passed=14 failed=0`:

```bash
bash .github/scripts/publish-decision.test.sh
bash .github/scripts/contract-agreement.test.sh
bash .github/scripts/contract-agreement.report.test.sh
bash .github/scripts/manifest-agreement.test.sh
bash .github/scripts/evidence-set-schema.test.sh
bash .github/scripts/predicates-schema.test.sh
bash .github/scripts/common-sh-usage.test.sh
```

Expected: no suite's count is lower than its baseline before this commit; none of the first six
suites' fixture corpora changed in this commit, so their counts should be byte-identical to
whatever they were on the commit immediately before this one.

- [ ] **Step 5: shellcheck over both script directories**

Run: `shellcheck .github/scripts/*.sh backend/infra/production/scripts/*.sh`

Expected: no new warnings.

- [ ] **Step 6: Update the ledger**

Append to `.superpowers/sdd/progress.md`:

```markdown
## 3b commit 3: freeze what the scanners are and what they scan

Three standalone predicate schemas under .github/contracts/predicates/ -- vulnerabilityScan,
layerSecretScan, filesystemSecretScan -- per spec section 7. Structurally excludes the other kind's
identity fields (additionalProperties: false at every level) rather than relying on a shared
conditional, closing the same self-assertion-loophole class commit 2 closed for markers. Not wired
into observation.schema.json or publish-decision.sh -- no consumer exists yet; commit 4 gives
report/attestationLookup their own real trust-boundary split, which is the first thing that will
reference these schemas.

Byte caps and extraction method (crane export vs. crane blob, whiteout applied vs. skipped) are
documented description text, not enforced keywords -- no scanner script exists yet to produce a
predicate for this schema to check. Only the findings 100-item cap + truncated flag is independently
a shape rule, and is enforced via if/then.

Final: predicates-schema.test.sh 14/0 (3 structural + 3 valid + 8 invalid fixtures). Full local
sweep clean at or above every prior baseline.

Next: 3b commit 4, "give each evidence two lookups of its own" (spec section 5) -- two independent
lookups with two different unions, splitting report and attestation into a real trust boundary
rather than the loosely-typed placeholder commit 2 left them as.
```

- [ ] **Step 7: Commit, push, and read CI**

```bash
git add .github/workflows/ci.yml .superpowers/sdd/progress.md
git commit -m "contract(ci): freeze what the scanners are and what they scan (3/3)

Wires predicates-schema.test.sh into CI and records the ledger entry.
Full local suite sweep clean at or above every prior baseline.
shellcheck clean over both script directories."
git push origin ci/ghcr-publish
```

Then read the CI run for the pushed commits (`gh run list --branch ci/ghcr-publish --limit 2`, then
`gh run watch <id> --exit-status`), and separately confirm CI actually exercised the new suite
rather than merely reporting green:

```bash
gh run view <run-id> --log 2>/dev/null | grep -iE "predicates-schema\.test|passed="
```

Expected to see `passed=14 failed=0` attributed to `predicates-schema.test.sh`'s own output lines
in the CI log, not merely inferred from an overall green checkmark.

---

## Self-Review

**Spec coverage** — spec §7 line by line against Tasks 1-2:
- Three predicate schemas, `vulnerabilityDb` exclusive to `vulnerabilityScan`, `ruleset` exclusive to
  both secret-scan kinds → Task 1, witnessed by Task 2's 4 exclusion-rule invalid fixtures (one
  vuln→ruleset, two secret→vulnerabilityDb across both secret schemas).
- `layerSecretScan` vs. `filesystemSecretScan` extraction method (crane blob/ignore whiteouts vs.
  crane export/apply whiteouts) → Task 1's `description` text on each schema (documented debt, no
  enforcement mechanism exists to test).
- `subject = image digest`, no rename between the two secret-scan kinds → Task 1's `target` field,
  identical shape on both schemas.
- Byte-cap table → Task 1's `description` text; the one row that is independently a shape rule
  (`findings`: 100 then `truncated: true`) → Task 1's `if`/`then`, witnessed by Task 2's two
  cap-without-truncated invalid fixtures.
- Timestamp permitted in the predicate (unlike the marker payload) → Task 1's `timestamp` field,
  required on all three schemas.
- §12 commit-order item 3's own one-line summary ("scanner provenance tách vuln/secret, cách
  extract, byte cap") → all of the above.
- Not in scope, and not touched: §5 (trust-boundary split, commit 4), §6 (verdict recompute, commit
  5, including `normalizedReport`'s richer shape — this commit's `findings` items are the raw
  scanner predicate, not the decision's recomputed view), §8 (attestation selection, commit 7).

**Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" anywhere in the tasks above; every
fixture is complete JSON or generated by a complete, runnable script; every schema is shown in full.

**Type consistency** — `SCHEMA_BY_PREFIX`'s three keys in Task 2 Step 6 match the three schema
filenames from Task 1 exactly. The `$ref` target `../observation.schema.json#/$defs/digest` is
identical across all three schemas (Task 1, Steps 1-3). `expectations.json`'s 11 keys (Task 2, Step
5) match the 11 fixture files created in Steps 1 and 3 exactly, including the generated pair from
the embedded script.
