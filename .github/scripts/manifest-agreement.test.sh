#!/usr/bin/env bash
# Holds the three statements of the envelope constants together, and witnesses that validating an
# observation against the schema is not what decides anything.
#
# Section 2's constants are written down three times: in release-envelope.schema.json's
# `$defs/constants`, in envelope.py, and in publish-decision.sh's ENVELOPE_CONSTANTS. Three, not
# one, because a .json and a .py cannot $ref each other, and because the decision has to run with
# only the scripts directory beside it -- the mutation runner copies nothing else. The schema is the
# single source in the documentary sense only. This file is the thing that makes that arrangement
# safe: if it stops working, the three drift apart in silence and one SHA stops naming one artifact.
#
# Two checks:
#
#   1. The constants do not drift. Each value is read out of the schema and compared with what
#      envelope.py says, and the *paths* the schema's markerEnvelope declares constant are compared
#      with the paths publish-decision.sh pins. The second half is the one that carries weight
#      between those two files, and the comment on it below says why the first half between them
#      would not.
#
#   2. Schema validation is not the gate. Two observations the schema REJECTS still reach CONFLICT
#      rather than UNKNOWN, and eight the schema ACCEPTS still reach CONFLICT. Both directions are
#      needed: the first says a structural defect does not divert the decision, the second says
#      passing validation buys nothing, so nobody can later replace the decision's checks with "we
#      validated it". Spec section 9 items 3 and 4.
#
# Section 9 items 1 and 2 are about release-manifest.schema.json, which does not exist until commit
# 6. Nothing here stands in for them: a line asserting True is a green line that means nothing, and
# would report the same green after commit 6 forgot to add the real one.
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

# Same override, and the same reason, as contract-agreement.test.sh and the mutation runner: on a
# Windows workstation `bash` on PATH is WSL's and cannot reach the interpreter this ran from.
BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

repo_root = pathlib.Path(sys.argv[1])
decision_script = pathlib.Path(sys.argv[2])
scripts = decision_script.parent
contracts = repo_root / ".github" / "contracts"
fixtures = contracts / "fixtures"

# The modules under test live beside the decision script and sys.path did not carry that directory
# here.
sys.path.insert(0, str(scripts))
import envelope

try:
    import jsonschema
    from jsonschema.exceptions import best_match
    import referencing
    import referencing.exceptions
    import referencing.jsonschema
except ImportError:
    # Never skipped, for the same reason as the sibling suite: a contract test that quietly does
    # nothing when a dependency is missing reports the same green as one that ran.
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

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


# ---------------------------------------------------------------------------------------------
# Check 1: the constants do not drift.
# ---------------------------------------------------------------------------------------------

envelope_schema = json.loads(
    (contracts / "release-envelope.schema.json").read_text(encoding="utf-8"))
defs = envelope_schema.get("$defs") if isinstance(envelope_schema.get("$defs"), dict) else {}
constants = defs.get("constants") if isinstance(defs.get("constants"), dict) else {}

# A sentinel rather than None, the same distinction publish-decision.sh draws: a schema that
# declares `"const": null` and a schema that declares no const at all are different documents.
MISSING = object()
REF_DEPTH = 20


def resolve(node):
    """A node with local `$ref`s followed. External references are returned as they were found."""
    for _ in range(REF_DEPTH):
        if not (isinstance(node, dict) and isinstance(node.get("$ref"), str)
                and node["$ref"].startswith("#/")):
            break
        target = envelope_schema
        for step in node["$ref"][2:].split("/"):
            if not isinstance(target, dict) or step not in target:
                return {}
            target = target[step]
        node = target
    return node if isinstance(node, dict) else {}


def declared(node, *names):
    """The const declared under `node` at properties/<name>/..., or MISSING."""
    node = resolve(node)
    for name in names:
        properties = node.get("properties")
        node = resolve(properties.get(name) if isinstance(properties, dict) else {})
    return node.get("const", MISSING)


def disagreement(left_name, left, right_name, right):
    if left is MISSING:
        return [f"{left_name} declares no const there"]
    if right is MISSING:
        return [f"{right_name} states nothing there"]
    # Type as well as value. `2` and `True` compare equal in Python, and a size of True is not a
    # size -- the decision's own constant comparison makes the same distinction for the same reason.
    if type(left) is not type(right) or left != right:
        return [f"{left_name} says {left!r} but {right_name} says {right!r}"]
    return []


CONFIG_FIELDS = ("mediaType", "digest", "size", "data")

# Every value section 2 pins, in both places that state it in a form a reader can compare. The
# schema side is read through `declared`, so a renamed or deleted key in $defs/constants arrives as
# "declares no const there" rather than as a KeyError that ends the run before it prints.
for name, from_schema, from_module in [
    ("manifestMediaType",
     declared(constants, "manifestMediaType"), envelope.MANIFEST_MEDIA_TYPE),
    ("artifactType",
     declared(constants, "artifactType"), envelope.ARTIFACT_TYPE),
    ("emptyConfig.mediaType",
     declared(constants, "emptyConfig", "mediaType"), envelope.EMPTY_CONFIG_MEDIA_TYPE),
    ("emptyConfig.digest",
     declared(constants, "emptyConfig", "digest"), envelope.EMPTY_CONFIG_DIGEST),
    ("emptyConfig.size",
     declared(constants, "emptyConfig", "size"), envelope.EMPTY_CONFIG_SIZE),
    ("emptyConfig.data",
     declared(constants, "emptyConfig", "data"), envelope.EMPTY_CONFIG_DATA),
]:
    report(f"the schema and envelope.py agree on {name}",
           disagreement("release-envelope.schema.json", from_schema, "envelope.py", from_module))

# The five predicate URIs, and the one place this suite states a value of its own.
#
# HALF OF THIS IS A ONE-SOURCE CHECK AND IS LABELLED AS SUCH. The loop immediately below compares
# the schema with literals written here, which is not agreement between two sources -- it is this
# file remembering what the URIs are supposed to be. It is here because commit 3b brings these
# values into the decision, and a statement that is checked against nothing at all leaves 3b nothing
# to disagree with: the day the decision names a sixth predicate or misspells one of these, this is
# what has to already be watching the schema's copy.
#
# There is no second source left to compare against. predicate_uris.py held these five strings while
# 5b-i rewrote the fixtures, and its own docstring said it would cite the schema once 5b moved them
# there. 5b moved them; nothing ever imported the module again. A module kept alive only so a test
# can compare it to the file it was supposed to defer to is a second copy of five constants with no
# consumer -- the drift shape section 7b exists to argue against -- so it is gone, and this loop is
# what pins them.
EXPECTED_PREDICATES = {
    "markerProvenance": "https://slsa.dev/provenance/v1",
    "sbom": "https://spdx.dev/Document/v2.3",
    "vulnerabilityScan": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
    "layerSecretScan": "https://evts.id.vn/attestations/layerSecretScan/v1",
    "filesystemSecretScan": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
}
for key, expected_uri in EXPECTED_PREDICATES.items():
    report(f"the schema states predicateTypes.{key} exactly (one source: schema vs this file)",
           disagreement("release-envelope.schema.json", declared(constants, "predicateTypes", key),
                        "this suite", expected_uri))



def const_paths(node, path=()):
    """Every path under `node` the schema declares a constant at, as the decision would address it.

    An array is addressed at index 0 because markerEnvelope permits exactly one layer, which is the
    same reason ENVELOPE_CONSTANTS writes `("layers", 0, "mediaType")`.
    """
    node = resolve(node)
    if "const" in node:
        yield path, node["const"]
        return
    properties = node.get("properties")
    if isinstance(properties, dict):
        for name, sub in properties.items():
            yield from const_paths(sub, path + (name,))
    items = node.get("items")
    if isinstance(items, dict):
        yield from const_paths(items, path + (0,))


def decision_envelope_constants():
    """ENVELOPE_CONSTANTS as publish-decision.sh states it, by running its own module preamble.

    Read out of the script rather than restated here. A copy of the tuple in this file would be a
    fourth statement of the constants, and a drift check that carries its own copy of the thing it
    is checking cannot see the drift.
    """
    text = decision_script.read_text(encoding="utf-8")
    opener = "<<'PYTHON'\n"
    start = text.find(opener)
    end = text.find("\nPYTHON\n", start + len(opener)) if start >= 0 else -1
    if start < 0 or end < 0:
        return None, "publish-decision.sh no longer carries a PYTHON heredoc"
    lines = text[start + len(opener):end].split("\n")
    opens = [i for i, line in enumerate(lines) if line.startswith("ENVELOPE_CONSTANTS = (")]
    if not opens:
        return None, "publish-decision.sh no longer defines ENVELOPE_CONSTANTS"
    closes = [i for i in range(opens[0] + 1, len(lines)) if lines[i] == ")"]
    if not closes:
        return None, "the ENVELOPE_CONSTANTS tuple in publish-decision.sh is not closed on its own line"
    preamble = "\n".join(lines[:closes[0] + 1])
    namespace = {"__name__": "publish_decision_preamble"}
    saved_argv = sys.argv
    # The preamble reads argv[1] to put the scripts directory on sys.path, exactly as the decision
    # does when bash hands it one.
    sys.argv = [str(decision_script), str(scripts)]
    try:
        exec(compile(preamble, str(decision_script), "exec"), namespace)  # noqa: S102
    except Exception as error:  # noqa: BLE001 -- any failure here is a finding, not a crash
        return None, f"the decision's module preamble did not run: {type(error).__name__}: {error}"
    finally:
        sys.argv = saved_argv
    return namespace.get("ENVELOPE_CONSTANTS"), None


# WHAT IS AND IS NOT AGREEMENT BETWEEN THESE TWO FILES. publish-decision.sh does not restate the
# constant *values*: it imports them from envelope.py. So an assertion that the decision's values
# equal envelope.py's is one no edit to either file could ever fail, and shipping it would be a
# green line standing for nothing. What the decision states independently is the MAP -- which path
# in a raw manifest is pinned to which constant, and that nothing else is pinned. Pinning
# layers.0.mediaType to MANIFEST_MEDIA_TYPE, or dropping config.data from the tuple, is a real
# drift, is invisible to envelope.py, and is what this compares: the decision's map against the map
# markerEnvelope declares in the schema.
decision_constants, failure = decision_envelope_constants()
if failure:
    report("publish-decision.sh pins the paths the marker envelope declares constant", [failure])
else:
    declared_paths = dict(const_paths(defs.get("markerEnvelope", {})))
    problems = []
    if not declared_paths:
        # An empty map compares equal to an empty map. Without this the check reports green on a
        # schema whose markerEnvelope was deleted.
        problems.append("markerEnvelope declares no constants at all")
    try:
        pinned = {tuple(path): value for path, value in decision_constants}
    except (TypeError, ValueError) as error:
        pinned = None
        problems.append(f"ENVELOPE_CONSTANTS is not a map of path to value: {error}")
    if pinned is not None:
        for path in sorted(set(declared_paths) | set(pinned), key=lambda p: tuple(map(str, p))):
            where = ".".join(str(step) for step in path)
            if path not in pinned:
                problems.append(f"the schema declares {where} constant and the decision pins nothing there")
            elif path not in declared_paths:
                problems.append(f"the decision pins {where} and the schema declares no constant there")
            else:
                problems += [f"{where}: {problem}" for problem in disagreement(
                    "release-envelope.schema.json", declared_paths[path],
                    "publish-decision.sh", pinned[path])]
    report("publish-decision.sh pins the paths the marker envelope declares constant", problems)

# ---------------------------------------------------------------------------------------------
# Check 2: schema validation is not the gate.
# ---------------------------------------------------------------------------------------------

observation_schema = json.loads((contracts / "observation.schema.json").read_text(encoding="utf-8"))
expectations = json.loads((fixtures / "expectations.json").read_text(encoding="utf-8"))

# Byte-for-byte the registry contract-agreement.test.sh builds, and for the reason written out at
# length there: jsonschema stopped resolving a bare sibling filename in 4.18, and one bare filename
# resolves to two different URIs depending on whether the schema that wrote it has an $id. Two keys
# per file. Reinventing this was tried once already and cost a day.
#
# No retrieve callable is passed, so a reference to anything not in this dict raises Unresolvable
# instead of being fetched. The ban on network access in these tests is structural: referencing
# never goes looking for a schema unless it is handed something to go looking with.
base = observation_schema["$id"] if isinstance(observation_schema.get("$id"), str) else ""
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
validator = jsonschema.Draft202012Validator(observation_schema, registry=registry)

# markerEnvelope ships without a validator: nothing in the pipeline builds a marker manifest yet, so
# there is nothing to hold to it and it was left as a debt for the publish job to pay. But the
# producer half already exists -- envelope.py IS what will build that manifest -- so the two can be
# held together today, and until they are, markerEnvelope is a shape no test has ever read. Relaxing
# its required list, its field sets and its layer bounds all together currently reddens nothing.
#
# Sample content, not a fixture: what is under test is the envelope envelope.py wraps a payload in,
# and any payload does. The three refusals matter as much as the acceptance -- a schema that accepts
# the good case and everything else is not a shape, it is a formality.
marker_envelope_validator = jsonschema.Draft202012Validator(
    {"$ref": "release-envelope.schema.json#/$defs/markerEnvelope"}, registry=registry)
_sample = envelope.envelope_for({"commit": "a" * 40, "environment": "production"})
_problems = [f"envelope.py builds a manifest markerEnvelope refuses: {error.message}"
             for error in marker_envelope_validator.iter_errors(_sample)]
for _label, _mutate in (
        ("annotations at the manifest level",
         lambda m: m.update(annotations={"org.opencontainers.image.created": "2026-08-05T00:00:00Z"})),
        ("a subject", lambda m: m.update(subject={"mediaType": "x", "digest": "sha256:" + "0" * 64,
                                                  "size": 1})),
        ("a second layer", lambda m: m["layers"].append(dict(m["layers"][0])))):
    _broken = json.loads(json.dumps(_sample))
    _mutate(_broken)
    if not list(marker_envelope_validator.iter_errors(_broken)):
        _problems.append(f"markerEnvelope accepts a manifest carrying {_label}")
report("markerEnvelope describes exactly what envelope.py builds", _problems)


def decide(path):
    result = subprocess.run([BASH, str(decision_script), str(path)],
                            capture_output=True, text=True)
    if result.returncode != 0:
        return None, f"decision exited {result.returncode}: {result.stderr.strip()[:200]}"
    try:
        return json.loads(result.stdout), None
    except json.JSONDecodeError as error:
        return None, f"decision did not emit JSON: {error}"


SCHEMA_MESSAGE_CHARS = 120

# The state comes out of expectations.json, never out of a list written here: a fixture whose
# verdict moves must move this suite's scope with it, and a name typed into this file would go on
# asserting the old answer about a fixture that no longer holds it.
def fixtures_filed(prefix, state):
    return sorted(name for name, want in expectations.items()
                  if name.startswith(prefix) and isinstance(want, dict)
                  and want.get("state") == state)


def gate_check(title, names, schema_must, group):
    problems = []
    if not names:
        # An empty group is how this check stops checking anything while still printing green --
        # the same discipline as the empty-registry guard above.
        problems.append(f"no fixture in {group} is filed as reaching CONFLICT")
    for name in names:
        try:
            errors = list(validator.iter_errors(
                json.loads((fixtures / name).read_text(encoding="utf-8"))))
        except referencing.exceptions.Unresolvable as unresolvable:
            # Raised out of this loop it ends the run before the report line is printed, and a run
            # that prints nothing reads exactly like a clean one. The exit status is still 1, so CI
            # does redden -- but the operator is handed a traceback with the whole envelope schema
            # inlined and neither of this check's two results. Its sibling suite grew this handler
            # after two files missing from a tree got past exactly here.
            problems.append(f"{name}: the schema makes a reference nothing in {contracts.name}/ "
                            f"can answer -- {unresolvable}")
            continue
        if schema_must == "rejects" and not errors:
            problems.append(f"{name}: the schema accepted it, so it no longer witnesses that a "
                            f"schema failure is not what decides")
        if schema_must == "accepts" and errors:
            best = best_match(errors)
            problems.append(f"{name}: the schema rejected it: {best.message[:SCHEMA_MESSAGE_CHARS]}")
        decision, failure = decide(fixtures / name)
        if failure:
            problems.append(f"{name}: {failure}")
            continue
        # CONFLICT literally, not `want["state"]`. The whole content of section 9 item 4 is that
        # these reach CONFLICT and not UNKNOWN -- comparing the decision with the same file the
        # group was selected from would restate the selection and could not fail.
        if decision.get("state") != "CONFLICT":
            problems.append(f"{name}: state={decision.get('state')!r}, not 'CONFLICT'")
        if decision.get("actions") != []:
            problems.append(f"{name}: a refusal carrying actions: {decision.get('actions')!r}")
    listed = ", ".join(names) if names else "nothing"
    report(f"{title} ({listed})", problems)


# Both directions of section 9 item 4, and section 8 item 7's converse. Neither alone says what is
# wanted: the first without the second would be satisfied by a decision that answers CONFLICT to
# everything, and the second without the first would be satisfied by a schema gate that turned every
# structural defect into UNKNOWN before the decision was reached.
gate_check("a rejected observation still reaches CONFLICT, not UNKNOWN",
           fixtures_filed("invalid-structure/", "CONFLICT"), "rejects", "invalid-structure/")
gate_check("an accepted observation still reaches CONFLICT, so validation is no pass",
           fixtures_filed("invalid-semantics/", "CONFLICT"), "accepts", "invalid-semantics/")

print()
print(f"passed={passed} failed={failed}")
sys.exit(1 if failed else 0)
PYTHON
