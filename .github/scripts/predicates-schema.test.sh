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
