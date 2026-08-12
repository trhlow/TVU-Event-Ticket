# Release manifest 3a, commit 4 — one key stops naming two different repositories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `expected.repository` into `expected.sourceRepository` plus
`expected.repositories.{release,monolith,frontend}`, pin every lookup to its own repository, and
compare a marker's signer against the source repository rather than against wherever images live.

**Architecture:** The observation schema gains a nested `repositories` object; the decision gains an
eight-entry `LOOKUP_REPOSITORY` table and computes a scope per lookup instead of once per
observation; `marker_problems` compares `signerRepository` with `sourceRepository`. A rule the schema
cannot state — the three repositories must differ — lives in the decision and produces one more
fixture that the schema accepts and the decision refuses.

**Tech Stack:** Bash 5 + an embedded Python 3.10+ program (`publish-decision.sh`), JSON Schema draft
2020-12 validated with `jsonschema==4.26.0`, a bespoke bash test harness, and a Python mutation
runner.

## Global Constraints

- **Spec:** `backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md`, §7a and
  §7a.1–7a.5. Those sub-sections are decisions already taken; do not re-litigate them.
- **Branch:** `ci/ghcr-publish`. Base for this work: `d2bbdef`.
- **`schemaVersion` stays `1`.** Do not bump it. §7a.1 states the freeze condition; this commit is
  before it.
- **No script may name an interpreter.** Use `"$PYTHON"`, set by `source "$script_dir/python-bin.sh"`.
  `.github/scripts/interpreter-override.test.sh` fails the build if you write `python3` anywhere.
- **Windows workstation:** `mvn`/`bash` hazards do not apply here, but two do. Run the mutation
  runner with `PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe"` or its baseline is red and
  no mutation is exercised. ShellCheck locally must be run on a `tr -d '\r'` copy, because
  `core.autocrlf=true` makes the checkout CRLF and SC1017 fires on every line.
- **No Flyway checksum may move.** They hash `migrations`, not `expected`. A fixture whose checksum
  needs recomputing is the signal that this stopped being a shape change — stop and find out why.
- **Production is not deployed and must not be.** This commit touches contract scripts only.
- **Every claim of "passing" needs the command output.** Invoke `verification-before-completion`
  before saying anything is done.

## File Structure

| File | Responsibility after this commit |
|---|---|
| `.github/contracts/observation.schema.json` | Modify: `expected` splits; new `$defs/ociRepository` |
| `.github/scripts/publish-decision.sh` | Modify: `LOOKUP_REPOSITORY`, `REPOSITORY_ROLES`, per-lookup scope, distinctness rule, signer compared to `sourceRepository` |
| `.github/scripts/publish-decision.test.sh` | Modify: references parameterised by repository; 13 new cases |
| `.github/scripts/publish-decision.mutations.py` | Modify: 4 new mutations |
| `.github/contracts/fixtures/**` (20 files) | Modify: `expected` block and every `queriedRef` |
| `.github/contracts/fixtures/invalid-semantics/two-repositories-are-one.json` | Create |
| `.github/contracts/fixtures/expectations.json` | Modify: one new entry |

**Counts to expect.** 20 fixtures exist, not the 14 §7a mentions — that number predates the six
fixtures commits 2 and 3 added. Roughly eight `queriedRef` per fixture, so ~160 reference edits.

**Why this cannot be split into smaller commits.** The schema, the decision and the fixtures state
one shape between them, and `contract-agreement.test.sh` exists precisely to fail when they disagree.
Any commit that moves one and not the others is red by construction. Task 1 below is the one piece
that *can* stand alone, and it is separated for that reason.

---

### Task 1: Parameterise the suite's references by repository

The suite hard-codes `ghcr.io/owner/name` in eight places and passes one shared `$absent` for every
lookup position. Under one repository that was correct; under three, each position needs its own. Do
this move **while the contract still has one repository**, so it is a pure refactor with a green
suite on both sides and the semantic change in Task 2 arrives against a harness that can express it.

**Files:**
- Modify: `.github/scripts/publish-decision.test.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: shell variables `RELEASE_REPO`, `MONOLITH_REPO`, `FRONTEND_REPO` (full refs including
  registry, e.g. `ghcr.io/owner/name`), the functions `absent_in <repo>`, `present_in <repo> <digest>`,
  and the ready-made `absent_release`, `absent_mono`, `absent_fe`. Task 2 changes only the three
  constants' values.

- [ ] **Step 1: Record the green baseline**

Run: `bash .github/scripts/publish-decision.test.sh | tail -1`
Expected: `passed=115 failed=0`

Write the number down. Task 1 must end on the same number.

- [ ] **Step 2: Introduce the three constants and the parameterised builders**

In `.github/scripts/publish-decision.test.sh`, immediately after the `FP=` line (~line 29), add:

```bash
# Three roles, three repositories -- but for now all three name the same one, because the contract
# still has a single `expected.repository`. Commit 4 changes these three values and nothing else in
# this block, which is the point of introducing them a commit early: the churn of moving ~40 call
# sites off a shared $absent is separated from the change of meaning.
RELEASE_REPO=ghcr.io/owner/name
MONOLITH_REPO=ghcr.io/owner/name
FRONTEND_REPO=ghcr.io/owner/name
```

Then replace lines 96–97 (`present()` and `absent=`) with:

```bash
present_in() { printf '{"status":"present","queriedRef":"%s@%s","digest":"%s"}' "$1" "$2" "$2"; }
absent_in() { printf '{"status":"absent","observedCode":404,"queriedRef":"%s:sha-x"}' "$1"; }
absent_release="$(absent_in "$RELEASE_REPO")"
absent_mono="$(absent_in "$MONOLITH_REPO")"
absent_fe="$(absent_in "$FRONTEND_REPO")"
# A digest object cannot be queried before a marker names one, so a clean slate skips it. Claiming
# absence there would assert an observation nobody made.
skipped='{"status":"skipped","reason":"no_claimed_digest","queriedRef":null}'
```

- [ ] **Step 3: Repoint `observation()` and `marker()`**

Replace the `observation()` body's default arguments (lines ~103–112) with:

```bash
# observation <final> <prepared> <monoTag> <frontTag> [monoObj] [frontObj] [monoCand] [frontCand]
observation() {
  cat <<EOF
{"schemaVersion":1,"commit":"$SHA","environment":"production",
 "expected":{"repository":"owner/name","frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml","registry":"ghcr.io"},
 "lookups":{"finalMarker":$1,"preparedMarker":$2,"monolithTag":$3,"frontendTag":$4,
            "monolithDigestObject":${5:-$(present_in "$MONOLITH_REPO" "$MONO")},
            "frontendDigestObject":${6:-$(present_in "$FRONTEND_REPO" "$FRONT")},
            "monolithCandidate":${7:-$absent_mono},"frontendCandidate":${8:-$absent_fe}}}
EOF
}
```

In `marker()` (line 45), replace the hard-coded ref:

```python
  "queriedRef": "ghcr.io/owner/name:release-" + sha,
```

with a value taken from the environment, so Task 2 does not have to edit Python inside bash:

```python
  "queriedRef": sys.argv[7] + ":release-" + sha,
```

and extend the call at line 93 from `"$SHA" "$FP"` to `"$SHA" "$FP" "$RELEASE_REPO"`.

- [ ] **Step 4: Move every call site off the shared `$absent`**

Every `observation` call passes its first four arguments in the fixed order final, prepared,
monolithTag, frontendTag. Replace them positionally:

```bash
# from the repository root, on a copy first if you prefer:
perl -0pi -e 's/observation "\$absent" "\$absent" "\$absent" "\$absent"/observation "\$absent_release" "\$absent_release" "\$absent_mono" "\$absent_fe"/g' \
  .github/scripts/publish-decision.test.sh
```

Then find what the sweep missed:

```bash
grep -n '\$absent\b' .github/scripts/publish-decision.test.sh
```

Expected: only `absent_release`, `absent_mono`, `absent_fe` and their definitions remain — a bare
`$absent` anywhere is a site the sweep did not reach. Fix each by hand, choosing the repository from
the lookup position it sits in. Remaining known sites: the `for bad in` literals (line ~183, these
are deliberately malformed and keep whatever they have), the duplicate-key literal (~line 202), the
`present "$MONO"` calls, `error_lookup()` (~line 419) and the Python at ~line 462.

For `present`, `error_lookup` and the line-462 helper, thread the repository through the same way:

```bash
error_lookup() { printf '{"status":"error","code":%s,"queriedRef":"%s:sha-x"}' "$1" "${2:-$RELEASE_REPO}"; }
```

- [ ] **Step 5: Run the suite**

Run: `bash .github/scripts/publish-decision.test.sh | tail -1`
Expected: `passed=115 failed=0` — **the same number as Step 1.** A different number means this
stopped being a refactor. Do not proceed until it matches.

- [ ] **Step 6: Run the two suites that copy this one into a fake tree**

Run:
```bash
bash .github/scripts/publish-decision.mutations.test.sh | tail -1
bash .github/scripts/interpreter-override.test.sh | tail -1
```
Expected: `passed=5 failed=0` and `passed=11 failed=0`.

- [ ] **Step 7: ShellCheck**

Run:
```bash
tmp="$(mktemp -d)"; tr -d '\r' < .github/scripts/publish-decision.test.sh > "$tmp/t.sh"; shellcheck -x "$tmp/t.sh"
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/publish-decision.test.sh
git commit -F - <<'MSG'
test(ci): let the suite say which repository a reference belongs to

Every reference in this suite was ghcr.io/owner/name, and every lookup
position took the same $absent. That was true while the contract had one
repository and stops being true in the next commit, where a marker, a
monolith tag and a frontend tag live in three different ones.

The three constants all still name the same repository, so this changes no
behaviour: passed=115 failed=0 before and after. It is separated from the
change of meaning on purpose -- moving forty call sites off a shared
variable and changing what those sites assert are two different reviews, and
a diff that does both hides the second inside the first.
MSG
```

---

### Task 2: Split the key

**Files:**
- Modify: `.github/contracts/observation.schema.json:19-40` and `$defs`
- Modify: `.github/scripts/publish-decision.sh` (`validate`, `marker_problems`, new constants)
- Modify: `.github/scripts/publish-decision.test.sh` (three constants + 13 new cases)
- Modify: `.github/scripts/publish-decision.mutations.py` (4 new mutations)
- Modify: all 20 files under `.github/contracts/fixtures/{valid,invalid-semantics,invalid-structure}/`
- Create: `.github/contracts/fixtures/invalid-semantics/two-repositories-are-one.json`
- Modify: `.github/contracts/fixtures/expectations.json`

**Interfaces:**
- Consumes: `RELEASE_REPO`, `MONOLITH_REPO`, `FRONTEND_REPO`, `absent_in`, `present_in`,
  `absent_release`, `absent_mono`, `absent_fe` from Task 1.
- Produces: the observation shape every later commit reads. `expected.sourceRepository` (string,
  `owner/name`), `expected.repositories` (object, exactly the keys `release`, `monolith`,
  `frontend`, each `owner/name/segment…`). In the decision: `REPOSITORY_ROLES` (tuple of the three
  role names) and `LOOKUP_REPOSITORY` (dict, lookup name → role name).

- [ ] **Step 1: Write the failing cases — the mapping**

In `.github/scripts/publish-decision.test.sh`, first change the three constants from Task 1 to their
real values:

```bash
RELEASE_REPO=ghcr.io/owner/name/release
MONOLITH_REPO=ghcr.io/owner/name/monolith
FRONTEND_REPO=ghcr.io/owner/name/frontend
```

and the `expected` block inside `observation()` to:

```bash
 "expected":{"sourceRepository":"owner/name",
             "repositories":{"release":"owner/name/release","monolith":"owner/name/monolith","frontend":"owner/name/frontend"},
             "frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml","registry":"ghcr.io"},
```

Then append a new section at the end of the "the observation and the schema agree" block:

```bash
echo
echo "== each lookup is pinned to its own repository, not to a shared scope"
# Eight cases rather than one assertion about the table's key set, because the table is inside the
# embedded Python and nothing outside the script can import it -- and because these pin what the
# table says, not merely how many entries it has. A ninth lookup added without an entry is refused
# by the require() below rather than crashing the decision with a KeyError.
for entry in \
  "finalMarker|1|$MONOLITH_REPO" \
  "preparedMarker|2|$FRONTEND_REPO" \
  "monolithTag|3|$RELEASE_REPO" \
  "frontendTag|4|$MONOLITH_REPO" \
  ; do
  which="${entry%%|*}"; rest="${entry#*|}"; position="${rest%%|*}"; wrong="${rest##*|}"
  args=("$absent_release" "$absent_release" "$absent_mono" "$absent_fe")
  args[$((position - 1))]="$(absent_in "$wrong")"
  assert_decision "$which queried in the wrong repository" \
    "$(observation "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}" "$skipped" "$skipped")" \
    UNKNOWN '[]' false false
done
assert_decision "monolithDigestObject queried in the release repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$(present_in "$RELEASE_REPO" "$MONO")" "$skipped")" \
  UNKNOWN '[]' false false
assert_decision "frontendDigestObject queried in the monolith repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$(present_in "$MONOLITH_REPO" "$FRONT")")" \
  UNKNOWN '[]' false false
assert_decision "monolithCandidate queried in the frontend repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$skipped" "$(absent_in "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false false
assert_decision "frontendCandidate queried in the release repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$skipped" "$absent_mono" "$(absent_in "$RELEASE_REPO")")" \
  UNKNOWN '[]' false false
```

- [ ] **Step 2: Write the failing cases — the shape and the signer**

Append:

```bash
echo
echo "== the three repositories are three, and the signer is not one of them"
mangle() { base_obs | "$PYTHON" -c "
import json,sys
o=json.load(sys.stdin)
exec(sys.argv[1])
print(json.dumps(o))" "$1"; }

# Two roles sharing a repository makes the pinning above vacuous: a reference into the wrong
# package satisfies the scope of both, and the only thing left telling them apart is the tag,
# whose shape this contract does not fix yet. JSON Schema cannot state this, so the decision does.
assert_decision "two roles naming one repository" \
  "$(mangle 'o["expected"]["repositories"]["monolith"] = o["expected"]["repositories"]["release"]')" \
  UNKNOWN '[]' false false
assert_decision "all three naming one repository" \
  "$(mangle 'r = o["expected"]["repositories"]; r["monolith"] = r["frontend"] = r["release"]')" \
  UNKNOWN '[]' false false
assert_decision "a source repository with three segments" \
  "$(mangle 'o["expected"]["sourceRepository"] = "owner/name/release"')" \
  UNKNOWN '[]' false false
assert_decision "an OCI repository with one segment" \
  "$(mangle 'o["expected"]["repositories"]["monolith"] = "monolith"')" \
  UNKNOWN '[]' false false
assert_decision "no repositories at all" \
  "$(mangle 'del o["expected"]["repositories"]')" \
  UNKNOWN '[]' false false
assert_decision "a repositories object missing a role" \
  "$(mangle 'del o["expected"]["repositories"]["frontend"]')" \
  UNKNOWN '[]' false false
# The whole reason for splitting the key: before it, these two were one string and this case could
# not be written at all.
assert_decision "a marker signed by the release repository rather than the source one" \
  "$(observation "$absent_release" \
     "$(marker '{"verification":{"signerRepository":"owner/name/release"}}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
```

- [ ] **Step 3: Run the suite and read the RED carefully**

Run: `bash .github/scripts/publish-decision.test.sh 2>&1 | tail -40`

Expected: a large red. The *entire* suite fails, because `observation()` now emits
`expected.sourceRepository` and the decision still requires `expected.repository`. Every case should
report `state='UNKNOWN'` where it wanted something else, with the reason
`expected.repository must be a non-empty string`.

**This is the wrong RED for the new cases.** The fifteen new cases pass for the wrong reason: they
want UNKNOWN and everything is UNKNOWN. Note this in the commit message rather than pretending the
RED was clean — the honest statement is that the shape change and the new rules cannot be reddened
independently, which is the same reason they cannot be committed separately.

- [ ] **Step 4: Change the schema**

In `.github/contracts/observation.schema.json`, replace the `expected` property (lines 19–40) with:

```json
    "expected": {
      "type": "object",
      "additionalProperties": false,
      "required": ["sourceRepository", "repositories", "frontendConfigFingerprint", "signerWorkflow", "registry"],
      "properties": {
        "sourceRepository": {
          "type": "string",
          "pattern": "^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$",
          "description": "owner/name on GitHub. The repository a marker's attestation must name as its signer, and nothing else. It is not where any image lives: comparing a queriedRef against it would be comparing a source repository with an OCI one, which is how one key came to mean two things."
        },
        "repositories": {
          "type": "object",
          "additionalProperties": false,
          "required": ["release", "monolith", "frontend"],
          "description": "Where each kind of lookup must have been made. Three packages are three OCI repositories, and the decision additionally requires these three to differ -- a rule JSON Schema cannot state about named properties, and one without which pinning each lookup to its own repository excludes nothing.",
          "properties": {
            "release": { "$ref": "#/$defs/ociRepository", "description": "Home of both markers and of the release and prepared tags." },
            "monolith": { "$ref": "#/$defs/ociRepository", "description": "Home of the monolith tag, its digest object and its candidate." },
            "frontend": { "$ref": "#/$defs/ociRepository", "description": "Home of the frontend tag, its digest object and its candidate." }
          }
        },
        "frontendConfigFingerprint": {
          "$ref": "#/$defs/hex64",
          "description": "From scripts/frontend-config.sh at this commit. A frontend image is only valid for the configuration it was built from, and this is how a marker built elsewhere is caught."
        },
        "signerWorkflow": {
          "type": "string",
          "minLength": 1,
          "description": "Full path, e.g. .github/workflows/ci.yml. A marker signed by any other workflow in the same repository is not this pipeline's."
        },
        "registry": { "type": "string", "minLength": 1, "examples": ["ghcr.io"] }
      }
    },
```

In `$defs` (after `"digest"`), add:

```json
    "ociRepository": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$",
      "description": "Two or more path segments. GHCR accepts nested paths, so the contract must not forbid a layout the registry allows; nesting introduces no ambiguity because a scope match demands ':' or '@' immediately after it."
    },
```

- [ ] **Step 5: Change the decision — the constants**

In `.github/scripts/publish-decision.sh`, after `MARKER_LOOKUPS` (~line 65), add:

```python
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

- [ ] **Step 6: Change the decision — `validate`**

Replace lines 142–153 (from `expected = as_dict(...)` through the `scope = ...` assignment) with:

```python
    expected = as_dict(obs.get("expected"), "expected")
    exact_str(expected.get("sourceRepository"), "expected.sourceRepository", SOURCE_REPOSITORY)
    repositories = as_dict(expected.get("repositories"), "expected.repositories")
    missing_roles = [role for role in REPOSITORY_ROLES if role not in repositories]
    require(not missing_roles, f"expected.repositories missing: {', '.join(missing_roles)}")
    extra_roles = [role for role in repositories if role not in REPOSITORY_ROLES]
    require(not extra_roles,
            f"expected.repositories has unexpected keys: {', '.join(sorted(extra_roles))}")
    for role in REPOSITORY_ROLES:
        exact_str(repositories[role], f"expected.repositories.{role}", OCI_REPOSITORY)
    # Three packages, or the pinning below excludes nothing: with two roles sharing a repository a
    # reference into the wrong package satisfies the scope of both, and the only thing left telling
    # them apart is the tag, whose shape this contract deliberately does not fix yet. The guard
    # would be green and empty.
    reused = sorted({name for name in repositories.values()
                     if list(repositories.values()).count(name) > 1})
    require(not reused,
            f"expected.repositories must name three different repositories; "
            f"{', '.join(repr(name) for name in reused)} is used more than once")
    exact_str(expected.get("frontendConfigFingerprint"), "expected.frontendConfigFingerprint", HEX64)
    require(type(expected.get("signerWorkflow")) is str and expected["signerWorkflow"],
            "expected.signerWorkflow must be a non-empty string")
    require(type(expected.get("registry")) is str and expected["registry"],
            "expected.registry must be a non-empty string")
```

Add the two patterns beside `HEX64` (~line 54):

```python
SOURCE_REPOSITORY = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+")
OCI_REPOSITORY = re.compile(r"[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)+")
```

- [ ] **Step 7: Change the decision — the per-lookup scope**

Inside the `for name, lookup in lookups.items():` loop, immediately before the `ref = ...` line
(~line 183), insert:

```python
        # Every lookup has to have been made in the repository that lookup belongs to. A well-formed
        # observation of another package answers a question nobody asked, and its absences would
        # authorise a build here.
        role = LOOKUP_REPOSITORY.get(name)
        require(role is not None,
                f"lookups.{name} has no repository assigned; the decision cannot say where it "
                f"should have been queried")
        scope = f"{expected['registry']}/{repositories[role]}"
```

and change the out-of-scope message (~line 190) to name the role:

```python
            require(ref.startswith(scope + ":") or ref.startswith(scope + "@"),
                    f"lookups.{name}.queriedRef {ref!r} is outside the {role} repository {scope}")
```

- [ ] **Step 8: Change the decision — the signer**

At ~line 232 in `marker_problems`, replace both uses of `expected["repository"]`:

```python
    # The source repository, not any of the three the images live in. These were one string until
    # commit 4, which is why a marker signed by the release package could not be distinguished from
    # one signed by the pipeline.
    if verification.get("signerRepository") != expected["sourceRepository"]:
        problems.append(f"{where} signed by {verification.get('signerRepository')!r}, expected "
                        f"{expected['sourceRepository']!r}")
```

- [ ] **Step 9: Confirm nothing else reads the old key**

Run: `grep -rn 'expected\["repository"\]\|expected\.repository\|"repository"' .github/scripts .github/contracts`
Expected: no hit inside `.github/scripts/publish-decision.sh` or `observation.schema.json`. Hits in
`require-green-run.sh` are a different script about GitHub repositories and are not in scope.

- [ ] **Step 10: Run the suite — expect red fixtures, green logic**

Run: `bash .github/scripts/publish-decision.test.sh | tail -1`
Expected: `passed=130 failed=0` — 115 from Task 1 plus fifteen new (eight for the mapping, seven for
the shape and the signer).

If any of the fifteen new cases still fails, read its reason before changing anything. If cases
outside the new sections fail, a reference in the harness is still pointing at the wrong repository.

- [ ] **Step 11: Rewrite the fixtures**

Every fixture's `expected` block changes shape and every `queriedRef` moves to its lookup's
repository. Do it with a script rather than twenty hand edits, then read the diff:

```bash
"$PYTHON" - <<'PY'
import json, pathlib
ROLE = {"finalMarker": "release", "preparedMarker": "release",
        "monolithTag": "monolith", "monolithDigestObject": "monolith",
        "monolithCandidate": "monolith", "frontendTag": "frontend",
        "frontendDigestObject": "frontend", "frontendCandidate": "frontend"}
REPO = {"release": "owner/name/release", "monolith": "owner/name/monolith",
        "frontend": "owner/name/frontend"}
root = pathlib.Path(".github/contracts/fixtures")
for path in sorted(root.rglob("*.json")):
    if path.name == "expectations.json":
        continue
    obs = json.loads(path.read_text(encoding="utf-8"))
    exp = obs.get("expected")
    if isinstance(exp, dict) and "repository" in exp:
        old = exp.pop("repository")
        exp["sourceRepository"] = old
        exp["repositories"] = dict(REPO)
    for name, lookup in (obs.get("lookups") or {}).items():
        if not isinstance(lookup, dict):
            continue
        ref = lookup.get("queriedRef")
        role = ROLE.get(name)
        if not isinstance(ref, str) or role is None:
            continue
        # Only rewrite a reference that pointed at the old single repository. A fixture that
        # deliberately queried somewhere else is the point of that fixture and must survive.
        prefix = "ghcr.io/owner/name"
        if ref.startswith(prefix + ":") or ref.startswith(prefix + "@"):
            lookup["queriedRef"] = f"ghcr.io/{REPO[role]}" + ref[len(prefix):]
    path.write_text(json.dumps(obs, indent=2) + "\n", encoding="utf-8")
    print(path)
PY
```

Then read what it did: `git diff --stat .github/contracts/fixtures`

Expected: 20 files changed. **Check `invalid-semantics/lookup-in-a-foreign-repository.json` by
hand** — its whole purpose is a reference that does not belong, and the guard above should have left
it alone. If the script rewrote it, restore it and pick a reference that is now foreign in the new
sense: a monolith lookup pointing into `ghcr.io/owner/name/release`.

- [ ] **Step 12: Add the fixture for the rule the schema cannot state**

Create `.github/contracts/fixtures/invalid-semantics/two-repositories-are-one.json` by copying
`valid/nothing-published.json` and setting `expected.repositories.monolith` to the same value as
`expected.repositories.release`, leaving every lookup where it is. Then add to
`.github/contracts/fixtures/expectations.json`, keeping the file's alphabetical order:

```json
  "invalid-semantics/two-repositories-are-one.json": {
    "actions": [],
    "schema": "accepts",
    "state": "UNKNOWN"
  },
```

- [ ] **Step 13: Run the agreement suites**

Run:
```bash
PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe" bash .github/scripts/contract-agreement.test.sh | tail -3
bash .github/scripts/contract-agreement.report.test.sh | tail -1
```
Expected: `failed=0` from both, with the agreement suite's `passed` risen from 23 by however many
legs it runs per fixture. Do not treat the exact number as the assertion — count the legs the suite
actually reports for the new fixture and say that number in the commit message.

A schema failure here now prints the field rather than the whole instance — that is what commit
`f97a71e` was for. Read the field it names before editing anything.

- [ ] **Step 14: Confirm no Flyway checksum moved**

Run: `git diff .github/contracts/fixtures | grep -c '^[-+].*"checksum"'`
Expected: `0`.

A non-zero count means a fixture's migration list changed, which this commit has no business doing.
Stop and find out why rather than recomputing the fixture.

- [ ] **Step 15: Add the mutations**

In `.github/scripts/publish-decision.mutations.py`, add four entries to `MUTATIONS`:

```python
    # The whole point of commit 4. Scoping every lookup to the release repository is what the
    # contract did before the split, so this mutation is literally the old behaviour restored.
    "lookup_repository_ignored": (
        'scope = f"{expected[\'registry\']}/{repositories[role]}"',
        'scope = f"{expected[\'registry\']}/{repositories[\'release\']}"'),
    # An entry removed from the table rather than a guard deleted: it proves the table is consulted
    # and that a lookup with no repository reaches UNKNOWN instead of a KeyError traceback.
    "lookup_repository_table_incomplete": (
        '    "monolithTag": "monolith",\n', ""),
    "repositories_may_coincide": (
        "require(not reused,", "require(True,"),
    # Before the split these two were one string, so this comparison could not be got wrong.
    "signer_compared_to_release_repository": (
        'if verification.get("signerRepository") != expected["sourceRepository"]:',
        'if verification.get("signerRepository") != expected["repositories"]["release"]:'),
```

- [ ] **Step 16: Run the mutation runner**

Run:
```bash
PUBLISH_DECISION_BASH="C:/Program Files/Git/bin/bash.exe" "$PYTHON" .github/scripts/publish-decision.mutations.py
```
Expected: `baseline: suite green`, then `all 32 mutations caught`, with **no** `SURVIVED` and no
`STALE` line. Runtime is roughly 20 minutes; run it in the background rather than truncating its
output — a previous session lost a whole run to `Select-Object -Last 35`.

`STALE` on `registry_unchecked` or `queried_ref_scope_ignored` would mean their anchor text moved.
§7a.5 predicted both would need re-anchoring; on inspection neither anchor line changes, so **do not
pre-emptively edit them** — let the runner say so, and re-anchor only what it reports.

A `SURVIVED` line is a finding, not a nuisance. Report it and stop; it means the guard it names is
not doing what the case that covers it claims.

- [ ] **Step 17: Run everything else**

Run:
```bash
bash .github/scripts/interpreter-override.test.sh | tail -1
bash .github/scripts/publish-decision.mutations.test.sh | tail -1
bash .github/scripts/canonical.test.sh | tail -1
bash .github/scripts/require-green-run.test.sh | tail -1
```
Expected: `passed=11`, `passed=5`, `passed=3`, `passed=22`, all with `failed=0`.

- [ ] **Step 18: ShellCheck and schema lint**

Run:
```bash
tmp="$(mktemp -d)"; for f in .github/scripts/*.sh; do tr -d '\r' < "$f" > "$tmp/$(basename "$f")"; done
shellcheck -x "$tmp"/*.sh
"$PYTHON" -c "import json,sys; json.load(open('.github/contracts/observation.schema.json'))"
```
Expected: no output from either.

- [ ] **Step 19: Commit**

Write the message from what the run actually printed, not from this plan. It must state: what the
split is and why one key could not stay one key; that the RED could not be clean and why; the exact
suite numbers; that no Flyway checksum moved; and the mutation count.

```bash
git add .github/contracts .github/scripts
git commit -F - <<'MSG'
contract(ci): stop one key from naming two different repositories
[... written from the measured output; see the requirements above ...]
MSG
```

---

### Task 3: Verify on a Linux runner and record where this leaves things

**Files:**
- Modify: `.superpowers/sdd/progress.md` (gitignored ledger, disk only)

- [ ] **Step 1: Re-index GitNexus**

Run: `node .gitnexus/run.cjs analyze`
Expected: `changed=N, added=1` — and `0 symbols`, because GitNexus indexes neither `.github` nor any
`.py`, `.sh` or JSON file in this repository. A `changed=0` here is expected, not a failure.

- [ ] **Step 2: Push and read CI**

```bash
git push
gh pr checks 23
```
Expected: all ten checks pass. The `lint` job's log must show `passed=130` for the decision suite,
the agreement number measured in Task 2, `all 32 mutations caught`, and — run this explicitly —
`grep -c "by timeout"` equal to `0`. A mutation caught by timeout is a mutation nobody proved an
assertion catches.

- [ ] **Step 3: Record the outcome**

Append to `.superpowers/sdd/progress.md`: the two commit SHAs, the measured numbers, any deviation
from this plan, and what commit 5 now depends on (`sha256(canonical_bytes(raw)) == markerDigest`,
plus the `repositories.release` scope for the carrier's own lookup).

---

## Deviations from the spec, stated rather than absorbed

1. **§7a says 14 fixtures. There are 20.** That number predates commits 2 and 3.
2. **§7a.4 asks for a suite case asserting `LOOKUP_REPOSITORY`'s key set equals `REQUIRED_LOOKUPS`.**
   It is not writable: the table lives inside the embedded Python and the suite is bash driving the
   script over stdin. This plan substitutes eight behavioural cases — each lookup, queried in a
   sibling repository, must reach UNKNOWN — plus a `require()` so a lookup with no entry reaches
   UNKNOWN rather than a KeyError. That pins the mapping's content, not just its size.
3. **§7a.5 says `registry_unchecked` and `queried_ref_scope_ignored` need re-anchoring.** Neither
   anchor line changes under this plan. The runner reports `STALE` if that is wrong, so the plan
   leaves them alone and trusts the runner over the prediction.
