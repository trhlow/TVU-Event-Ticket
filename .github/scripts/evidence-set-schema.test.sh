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
