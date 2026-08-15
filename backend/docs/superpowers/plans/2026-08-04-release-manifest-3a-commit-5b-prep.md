# Release manifest 3a, commits 5b-i and 5b-ii — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the two things 5b assumed and neither of which is true yet — fixtures naming a domain the team owns, and a schema loader that can resolve a reference into another file.

**Architecture:** Two independent commits, neither adding a guard. 5b-i rewrites four predicate URIs across 13 fixtures and regenerates every `markerDigest` through the existing generator, because `predicateType` lives inside `content` and `content` is what the envelope digest covers. 5b-ii replaces the bare `Draft202012Validator` with one backed by a `referencing.Registry` holding every schema in `.github/contracts/`, so a `$ref` into a sibling file resolves — and proves a broken reference is reported rather than swallowed.

**Tech Stack:** bash + embedded Python 3.10+, JSON Schema draft 2020-12, `jsonschema` 4.26, `referencing` 0.37.

## Global Constraints

- Spec: `backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md`, §7, §7b, §7c.
- Base commit: `692cbe0`. Branch `ci/ghcr-publish`. PR #23 stays a draft — do **not** merge.
- Run every suite with BOTH: `PYTHON_BIN=/c/Users/Hlow/AppData/Local/Programs/Python/Python312/python` and `PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"`. Without the second, bare `bash` is WSL's and cannot exec, and `contract-agreement.test.sh` reports ~3/21 for reasons that are not findings.
- `shellcheck` is NOT installed here. Do not run it, do not report its absence — but **every new or edited `.sh` must pass SC2164 and friends in CI**, which is the only gate for it. In particular: any `cd` needs `|| exit 1`, and any `source` of a sibling needs a `# shellcheck source=` directive. A missing one of those cost this branch a red CI on `e434d36`.
- Never hand-edit a file under `.github/contracts/fixtures/`. `predicateType` edits are a scripted sweep; `markerDigest` regeneration is `.github/scripts/fixture-envelopes.py`.
- **No `flywayInventory.checksum` may move.** `markerDigest` values are expected to change in 5b-i. A checksum change means the sweep touched migrations, which it must not.
- `.github/scripts/envelope.py` is the single source of every OCI envelope constant. No constant may be restated.
- The observation's `schemaVersion` stays `1`.
- Neither commit adds a guard to the decision, and neither adds a mutation. If you find yourself writing one, you are in 5b's territory — stop and say so.
- The full mutation runner's only meaningful output line is `all N mutations caught`. `publish-decision.mutations.test.sh` tests the *runner*, not the mutations; do not report it as mutation evidence.

---

## File Structure

| File | Responsibility |
|---|---|
| `.github/scripts/predicate_uris.py` | **Create (5b-i).** The five predicate URIs, and a sweep that rewrites fixtures to them. Sole source until 5b moves them into the envelope schema. |
| `.github/contracts/fixtures/**` (13 files) | **Modify (5b-i)**, by script only. |
| `.github/scripts/contract-agreement.test.sh` | **Modify (5b-ii).** Validator gains a `referencing.Registry` over `.github/contracts/`. |
| `.github/scripts/contract-agreement.report.test.sh` | **Modify (5b-ii).** A witness that an unresolvable `$ref` is reported, not swallowed. |

---

## Task 1 (commit 5b-i): fixtures name a domain the team owns

**Files:**
- Create: `.github/scripts/predicate_uris.py`
- Modify: `.github/contracts/fixtures/**` (13 files, by script only)

**Interfaces:**
- Consumes: `.github/scripts/fixture-envelopes.py` (run as a command, not imported).
- Produces: `predicate_uris.py` exporting `PREDICATE_URIS` (a dict keyed `provenance`, `sbom`, `vulnerabilityScan`, `layerSecretScan`, `filesystemSecretScan`) and `REPLACEMENTS` (old URI → new URI).

- [ ] **Step 1: Record the starting state**

```bash
grep -rho '"predicateType": "[^"]*"' .github/contracts/fixtures/ | sort | uniq -c
```

Expected, and quote it in the commit body:

```
     15 "predicateType": "https://slsa.dev/provenance/v1"
     28 "predicateType": "https://tvu.id.vn/attestations/filesystemSecretScan/v1"
     26 "predicateType": "https://tvu.id.vn/attestations/layerSecretScan/v1"
     28 "predicateType": "https://tvu.id.vn/attestations/sbom/v1"
     28 "predicateType": "https://tvu.id.vn/attestations/vulnerabilityScan/v1"
```

If the numbers differ, the fixture set moved since this plan was written — report the real numbers rather than these.

- [ ] **Step 2: Write the URI module**

Create `.github/scripts/predicate_uris.py`:

```python
"""The five predicate URIs, and the sweep that brings fixtures to them.

Two corrections live here, and they are different in kind. Three of the URIs merely moved domain:
tvu.id.vn was never owned by this team, and a namespace nobody owns is a namespace anyone may take.
The fourth is not a rename at all -- SBOM attestations carry the SPDX document type, not a URI this
project invents, because actions/attest-sbom emits that value and a constant the pipeline made up
would never match what a real attestation says.

Sole source of these five values until 5b moves them into release-envelope.schema.json's `constants`
$defs. When it does, this module cites that file rather than restating it.
"""

__all__ = ["PREDICATE_URIS", "REPLACEMENTS"]

PREDICATE_URIS = {
    "provenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
}

# Keyed by the exact string to be replaced, so a sweep cannot half-match and cannot rewrite a URI
# that was already correct. `provenance` is absent deliberately: it was already right.
REPLACEMENTS = {
    "https://tvu.id.vn/attestations/sbom/v1": PREDICATE_URIS["sbom"],
    "https://tvu.id.vn/attestations/vulnerabilityScan/v1":
        PREDICATE_URIS["vulnerabilityScan"],
    "https://tvu.id.vn/attestations/layerSecretScan/v1":
        PREDICATE_URIS["layerSecretScan"],
    "https://tvu.id.vn/attestations/filesystemSecretScan/v1":
        PREDICATE_URIS["filesystemSecretScan"],
}
```

- [ ] **Step 3: Sweep the fixtures**

Run this once, from the repository root. It is a one-off, not a committed script — the module above is what gets committed:

```bash
"$PYTHON_BIN" - <<'PY'
import json, pathlib, sys
sys.path.insert(0, ".github/scripts")
from predicate_uris import REPLACEMENTS

root = pathlib.Path(".github/contracts/fixtures")
changed = []
for path in sorted(root.rglob("*.json")):
    if path.name == "expectations.json":
        continue
    text = path.read_text(encoding="utf-8")
    after = text
    for old, new in REPLACEMENTS.items():
        after = after.replace(old, new)
    if after != text:
        path.write_text(after, encoding="utf-8", newline="\n")
        changed.append(path.name)
print(f"rewrote {len(changed)}: " + ", ".join(changed))
PY
```

The module is named with an underscore because it is imported, not run. `fixture-envelopes.py` and `publish-decision.mutations.py` carry hyphens because nothing imports them; `canonical.py` and `envelope.py` do not, because things do. Follow the existing split rather than reaching for `importlib`.

Expected: `rewrote 13`.

- [ ] **Step 4: Confirm nothing but the URIs moved**

```bash
git diff -U0 .github/contracts/fixtures/ | grep -E '^[+-]' | grep -v '^[+-][+-]' | grep -v predicateType
```

Expected: **no output**. Any line here means the sweep touched something other than a predicate URI, and it must be understood before continuing.

- [ ] **Step 5: Regenerate the digests**

`predicateType` sits inside `content`, and `content` is what the envelope's layer digest covers, so every marker's `markerDigest` is now wrong.

```bash
"$PYTHON_BIN" .github/scripts/fixture-envelopes.py
"$PYTHON_BIN" .github/scripts/fixture-envelopes.py
```

Expected: the first run rewrites 13 fixtures; the **second reports 0**. A second run that rewrites anything means the generator is not deterministic — stop and find out why.

- [ ] **Step 6: Confirm no Flyway checksum moved**

```bash
git diff -U0 .github/contracts/fixtures/ | grep -E '^[+-].*"checksum"' | grep -v '^[+-][+-]'
```

Expected: **no output**. `flywayInventory.checksum` covers the migration list, which this sweep does not touch; a line here means it did.

- [ ] **Step 7: Run every suite**

```
bash .github/scripts/publish-decision.test.sh
bash .github/scripts/contract-agreement.test.sh
bash .github/scripts/contract-agreement.report.test.sh
bash .github/scripts/envelope.test.sh
bash .github/scripts/canonical.test.sh
bash .github/scripts/interpreter-override.test.sh
bash .github/scripts/publish-decision.mutations.test.sh
bash .github/scripts/require-green-run.test.sh
```

Expected, unchanged from base: `158/0`, `24/0`, `5/0`, `8/0`, `3/0`, `11/0`, `5/0`, `22/0`. The decision does not read `predicateType` against any constant — that is 3b's work — so nothing here should move. If a suite changes, something other than data changed.

- [ ] **Step 8: Run the full mutation runner**

```
"$PYTHON_BIN" .github/scripts/publish-decision.mutations.py
```

Expected: `all 48 mutations caught`, `baseline: suite green`, zero lines containing `by timeout`. This is the only line that counts as mutation evidence.

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/predicate_uris.py .github/contracts/fixtures
git commit
```

Body records: the before/after URI counts from Steps 1 and 4, that SBOM was a correction of value and not of domain, the generator's two runs, and that no Flyway checksum moved.

---

## Task 2 (commit 5b-ii): one schema may reference another

**Files:**
- Modify: `.github/scripts/contract-agreement.test.sh`
- Modify: `.github/scripts/contract-agreement.report.test.sh`

**Interfaces:**
- Consumes: `referencing` 0.37 and `jsonschema` 4.26, both already installed.
- Produces: a validator in `contract-agreement.test.sh` that resolves `$ref` to any schema file in `.github/contracts/`. 5b relies on this and adds no resolution machinery of its own.

> **Why this is its own commit.** §7 says the observation `$ref`s into `release-envelope.schema.json`. Since jsonschema 4.18 `RefResolver` is deprecated and no longer reads a file beside it, so that `$ref` raises `Unresolvable` — the sentence is not a line of JSON, it is machinery. Landing it beside 5b's eight shape guards would make one RED unreadable as two.

- [ ] **Step 1: Prove the gap exists**

Write a throwaway schema referencing a sibling and confirm the current validator cannot load it:

```bash
"$PYTHON_BIN" - <<'PY'
import json, jsonschema
schema = {"$ref": "release-envelope.schema.json#/$defs/anything"}
try:
    jsonschema.Draft202012Validator(schema).validate({})
    print("resolved — the gap does not exist")
except Exception as exc:
    print(type(exc).__name__, str(exc)[:120])
PY
```

Expected: an `Unresolvable` (or `RefResolutionError`) naming the file. Quote it in the commit body — it is the evidence that this commit is necessary rather than decorative.

- [ ] **Step 2: Write the failing witnesses**

In `.github/scripts/contract-agreement.report.test.sh`, which already drives a fake `.github/contracts` tree, add two cases. Read that file's existing fake-tree helper before writing — reuse it rather than building a second one.

The first: a fake `observation.schema.json` whose root is `{"$ref": "sibling.schema.json#/$defs/thing"}` and a fake `sibling.schema.json` defining `thing` as `{"type": "string"}`. Validating `"x"` must pass and validating `1` must be reported as a type failure naming the field. That case fails today with an unresolvable reference rather than a type report.

The second: the same fake tree with `sibling.schema.json` **absent**. The suite must print a readable FAIL naming the missing file. It must not raise a traceback, and it must not pass. A test harness that dies on a broken `$ref` reports nothing at all, which reads identically to a clean run — the failure mode `contract-agreement.report.test.sh` exists to prevent, and one this branch has hit twice through missing files in fake trees.

- [ ] **Step 3: Run and watch them fail**

```
PYTHON_BIN=... PUBLISH_DECISION_BASH=... bash .github/scripts/contract-agreement.report.test.sh
```

Expected: `5/2` — the two new cases failing. Quote the exact failure text; if the second case fails with a traceback rather than a FAIL line, that IS the defect it exists to describe, and the fix must turn it into a line.

- [ ] **Step 4: Build the registry**

In `.github/scripts/contract-agreement.test.sh`, replace

```python
schema = json.loads((contracts / "observation.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema)
```

with a registry over every schema in the contracts directory, keyed by filename so a `$ref` written as a plain relative name resolves:

```python
# Section 7 has the observation reference release-envelope.schema.json rather than restate its
# shape. jsonschema stopped resolving a bare filename when RefResolver was deprecated in 4.18, so
# without this registry that reference raises Unresolvable -- loudly, which is the good case, but it
# means the reference cannot be written at all until the loader can follow it.
#
# Keyed by filename, not by an absolute path or a $id: a $ref written as "release-envelope.schema.json"
# is what a reader of the schema expects to be able to follow by opening the file beside it.
resources = {
    path.name: referencing.Resource.from_contents(
        json.loads(path.read_text(encoding="utf-8")),
        default_specification=referencing.jsonschema.DRAFT202012)
    for path in sorted(contracts.glob("*.schema.json"))
}
if not resources:
    print("FAIL  no schema files found; the contract directory must have moved")
    sys.exit(1)
registry = referencing.Registry().with_resources(resources.items())

schema = json.loads((contracts / "observation.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema, registry=registry)
```

and add to the import block, inside the same `try` that already guards `jsonschema` so a missing dependency still fails loudly rather than skipping:

```python
    import referencing
    import referencing.jsonschema
```

The `if not resources` guard is the same discipline as `ci.yml`'s empty-glob check: an empty set is how this stops checking anything while still printing green.

- [ ] **Step 5: Make the broken reference readable**

Wrap the per-fixture validation so an unresolvable reference becomes a report line rather than a traceback. `referencing.exceptions.Unresolvable` is the exception to catch. Put it beside the existing `describe(errors)` handling, and name the reference that could not be followed.

- [ ] **Step 6: Run and watch them pass**

Expected: `contract-agreement.report.test.sh` `7/0`, and `contract-agreement.test.sh` unchanged at `24/0` — no `$ref` into a sibling exists yet in the real schema, so the registry changes nothing about today's fixtures. That it changes nothing is the point: this commit adds capability, not behaviour.

- [ ] **Step 7: Run every suite and the mutation runner**

All eight suites, then `publish-decision.mutations.py`. Expected: unchanged, and `all 48 mutations caught`.

- [ ] **Step 8: Commit and push both commits**

```bash
git add .github/scripts
git commit
git push origin ci/ghcr-publish
```

- [ ] **Step 9: Read CI**

```bash
gh pr checks 23
```

`lint` is the only ShellCheck gate and it takes ~16 minutes. Do not report this plan complete until it is green. Two of this branch's last three CI runs were red on a shell defect no local run could see.

---

## Deviations from the spec, stated rather than absorbed

- **`predicate_uris.py` holds the five URIs during 5b-i.** §7 places them in `release-envelope.schema.json`'s `constants` `$defs`, which does not exist until 5b. One source now; 5b moves them and `manifest-agreement.test.sh` then holds schema, decision and this module to each other.
- **Neither commit adds a mutation.** Neither adds a guard, so there is nothing to mutate. The count stays 48. If it moves, something outside this plan's scope changed.
- **The suite's own fake predicate URIs (`https://tvu.example/...` in `publish-decision.test.sh`) are left alone.** `tvu.example` is a reserved example domain, the decision does not compare `predicateType` against any constant until 3b, and rewriting them would churn the suite for no verifiable gain.
