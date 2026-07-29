#!/usr/bin/env bash
# Runs every fixture through both halves of the contract and asserts they agree.
#
# The schema and the decision function are two statements of the same rules in different languages,
# and nothing stops one from drifting away from the other. That already happened: between the commit
# that froze the schema and the commit that reconciled the decision with it, seven rules existed in
# one place only, and one of them was a contradiction no observation could satisfy at all.
#
# Every fixture records what BOTH halves must do with it, in expectations.json:
#
#   schema  accepts or rejects. A fixture filed as rejected that the schema accepts is a rule living
#           only in the decision function; the reverse is a rule living only in the schema. The
#           fixtures under invalid-semantics/ are the interesting ones -- the schema is required to
#           ACCEPT them, which is written evidence that passing validation is not sufficient, so
#           nobody can later replace the decision's checks with "we validated against the schema".
#
#   state   what the decision reaches. UNKNOWN and CONFLICT are not interchangeable: UNKNOWN means
#           the observation could not be reasoned about, which is the collector's fault and is fixed
#           by collecting again, while CONFLICT means the observation was readable and what it
#           describes needs a person. Marker content is read out of the registry rather than authored
#           by the collector, so a marker full of nonsense is a registry the pipeline must not touch,
#           not a collector that misbehaved -- and sending an operator to the wrong one of those
#           wastes the thing an incident is shortest of.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"

python3 - "$repo_root" "$script_dir/publish-decision.sh" <<'PYTHON'
import json
import os
import pathlib
import subprocess
import sys

# Same override the mutation runner uses, for the same reason: on a Windows workstation `bash` on
# PATH is WSL's and cannot reach the interpreter this ran from, so every fixture failed for a reason
# that had nothing to do with the contract.
BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

repo_root = pathlib.Path(sys.argv[1])
decision_script = sys.argv[2]
contracts = repo_root / ".github" / "contracts"
fixtures = contracts / "fixtures"

try:
    import jsonschema
except ImportError:
    # Never skipped. A contract test that quietly does nothing when a dependency is missing reports
    # the same green as one that ran, and the whole point here is that green means something.
    print("FAIL  jsonschema is not installed; the contract cannot be checked")
    sys.exit(1)

schema = json.loads((contracts / "observation.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))
validator = jsonschema.Draft202012Validator(schema)

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


def schema_errors(document):
    return [f"{'/'.join(str(p) for p in error.absolute_path) or '<root>'}: {error.message}"
            for error in validator.iter_errors(document)]


def decide(path):
    result = subprocess.run([BASH, decision_script, str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        return None, f"decision exited {result.returncode}: {result.stderr.strip()[:200]}"
    try:
        return json.loads(result.stdout), None
    except json.JSONDecodeError as error:
        return None, f"decision did not emit JSON: {error}"


on_disk = sorted(str(path.relative_to(fixtures)).replace("\\", "/")
                 for path in fixtures.rglob("*.json") if path.name != "expectations.json")

# Both directions. A fixture with no expectation would be checked against nothing; an expectation
# with no fixture is a rule somebody believes is covered and is not.
report("every fixture states what both halves must do",
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

    errors = schema_errors(document)
    if want["schema"] == "accepts" and errors:
        problems.append(f"the schema rejected it but this fixture is filed as structurally valid, "
                        f"so the rule it breaks belongs in the decision: {errors[0]}")
    if want["schema"] == "rejects" and not errors:
        problems.append("the schema accepted it; this rule lives only in the decision function")

    decision, failure = decide(fixtures / name)
    if failure:
        problems.append(failure)
    else:
        if decision.get("state") != want["state"]:
            problems.append(f"state={decision.get('state')!r} wanted {want['state']!r}")
        if decision.get("actions") != want["actions"]:
            problems.append(f"actions={decision.get('actions')!r} wanted {want['actions']!r}")
        # Belt and braces, and it holds regardless of what expectations.json says: nothing the
        # pipeline refuses may come with something for it to do.
        if decision.get("state") in ("UNKNOWN", "CONFLICT") and decision.get("actions") != []:
            problems.append(f"a refusal carrying actions: {decision.get('actions')!r}")

    report(name, problems)

print()
print(f"passed={passed} failed={failed}")
sys.exit(1 if failed else 0)
PYTHON
