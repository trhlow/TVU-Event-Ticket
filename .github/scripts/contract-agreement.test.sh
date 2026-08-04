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
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

"$PYTHON" - "$repo_root" "$script_dir/publish-decision.sh" <<'PYTHON'
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse

# Same override the mutation runner uses, for the same reason: on a Windows workstation `bash` on
# PATH is WSL's and cannot reach the interpreter this ran from, so every fixture failed for a reason
# that had nothing to do with the contract.
BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

repo_root = pathlib.Path(sys.argv[1])
decision_script = sys.argv[2]
contracts = repo_root / ".github" / "contracts"
fixtures = contracts / "fixtures"

# envelope.py lives beside the decision script, and sys.path did not carry that directory here. The
# drift check below has to hash a raw manifest exactly the way the decision and the generator do,
# and a third statement of one hash is the drift it exists to catch.
sys.path.insert(0, str(pathlib.Path(decision_script).parent))
from envelope import marker_digest

try:
    import jsonschema
    from jsonschema.exceptions import best_match
    # In the same guard on purpose. referencing is what follows a $ref from one schema file into
    # another, and a missing one has to fail here rather than turn into a run that checks nothing.
    import referencing
    import referencing.exceptions
    import referencing.jsonschema
except ImportError:
    # Never skipped. A contract test that quietly does nothing when a dependency is missing reports
    # the same green as one that ran, and the whole point here is that green means something.
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

schema = json.loads((contracts / "observation.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))

# A schema is allowed to reference a sibling file rather than restate its shape -- the observation
# points at the release envelope's definition of a marker instead of carrying a second copy of it,
# so there is nothing for the two copies to drift apart about. jsonschema stopped resolving a bare
# filename when RefResolver was deprecated in 4.18, so without a registry that reference raises
# Unresolvable: loudly, which is the good case, but it means the reference cannot be written at all
# until the loader can follow it.
#
# Two keys per file, because one bare filename resolves to two different URIs depending on which
# schema wrote it, and both are spellings a reader of the file would expect to be able to follow:
#
#   the filename itself, for a reference written by a schema with no $id. The base is empty there,
#   so "release-envelope.schema.json" stays exactly those characters.
#
#   the filename joined onto observation.schema.json's $id, for a reference written by a schema that
#   has one -- and observation.schema.json has one. The same characters then resolve to an absolute
#   URL under that $id's directory, which a registry holding only bare filenames matches nowhere.
#   Keying by filename alone was tried against exactly the file this exists to serve and did not
#   work; the sibling would have to declare a matching $id of its own to be found, and requiring
#   that of every future contract file is a rule nobody would remember.
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
    # The same discipline as ci.yml's empty-glob check. An empty set is how this stops checking
    # anything at all while still printing green.
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


# A schema failure has to name the field and fit on a line. jsonschema's message for a failed anyOf
# quotes the entire instance it could not validate, and markerLookup is an anyOf, so a one-field
# defect in a marker printed the whole observation and named only the branch above the defect.
# best_match walks into the branch that actually failed, which is both shorter and the answer to the
# question the reader has.
SCHEMA_MESSAGE_CHARS = 200


def describe(errors):
    best = best_match(errors)
    where = "/".join(str(part) for part in best.absolute_path) or "<root>"
    message = best.message
    if len(message) > SCHEMA_MESSAGE_CHARS:
        # Kept from both ends. The head says which value; the tail says what was wrong with it, and
        # jsonschema puts that last -- so keeping only the head reports the input and withholds the
        # verdict, which is printing everything over again in the other direction. The count is said
        # out loud: a value cut without one reads like a value that was short.
        keep = SCHEMA_MESSAGE_CHARS // 2
        dropped = len(message) - 2 * keep
        message = f"{message[:keep]} [{dropped} chars omitted] {message[-keep:]}"
    rest = f" (and {len(errors) - 1} more)" if len(errors) > 1 else ""
    return f"{where}: {message}{rest}"


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

    # A fixture whose markerDigest disagrees with its own raw is a fixture nobody regenerated. For
    # a valid one the decision already refuses it, but an invalid-semantics fixture is CONFLICT
    # either way, so without this it would drift here forever and never say a word.
    drifted = [key for key, lookup in document.get("lookups", {}).items()
               if isinstance(lookup, dict) and isinstance(lookup.get("ociEnvelope"), dict)
               # isinstance on raw as well. A raw that is not an object is a case for the schema and
               # the decision to answer, but this line reached it first: canonical_bytes refuses a
               # float outright, so a fixture carrying `"raw": 1.5` raised out of the loop and the
               # whole run died with a traceback -- one bad fixture and every other fixture, before
               # it and after it, goes unreported.
               and isinstance(lookup["ociEnvelope"].get("raw"), dict)
               and marker_digest(lookup["ociEnvelope"]["raw"]) != lookup.get("markerDigest")]
    if drifted:
        problems.append(f"markerDigest does not match its own raw in: {', '.join(sorted(drifted))}"
                        f" -- run fixture-envelopes.py")

    try:
        errors = list(validator.iter_errors(document))
    except referencing.exceptions.Unresolvable as unresolvable:
        # A reference the loader cannot follow is not this fixture's fault, but it has to arrive as a
        # line. Raised out of the loop it ends the run before anything is printed, and a run that
        # prints nothing reads exactly like a clean one -- which is how two files missing from a
        # tree got past this branch already. The reference is named because the answer is either a
        # file that was never added or a filename spelt one character wrong, and the reader cannot
        # tell which without seeing it.
        problems.append(f"the schema makes a reference nothing in {contracts.name}/ can answer -- "
                        f"{unresolvable}")
    else:
        if want["schema"] == "accepts" and errors:
            problems.append(f"the schema rejected it but this fixture is filed as structurally valid, "
                            f"so the rule it breaks belongs in the decision: {describe(errors)}")
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
