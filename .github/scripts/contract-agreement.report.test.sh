#!/usr/bin/env bash
# Tests how contract-agreement.test.sh reports a disagreement, not whether it finds one -- hence the
# second test file for one subject.
#
# jsonschema's message for a failed `anyOf` embeds the entire instance it could not validate. The
# markerLookup branch is an anyOf, so a one-field defect in a marker produced a four-kilobyte failure
# line: the whole observation, twice over, with the actual defect somewhere inside it. Four of those
# arrived at once while filing the negative-verdict fixtures, and the useful part of each -- which
# field, and why -- was the part nobody could find.
#
# Driven by a fake contracts tree rather than the real fixtures: the real ones must stay in agreement,
# so there is no disagreement there to report on, and manufacturing one by editing them would leave
# this suite green only while the tree is broken.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

passed=0
failed=0

report() {
  if [[ -z "$2" ]]; then
    printf 'ok    %s\n' "$1"; passed=$((passed + 1))
  else
    printf 'FAIL  %s: %s\n' "$1" "$2"; failed=$((failed + 1))
  fi
}

work="$(mktemp -d)"
refs="$(mktemp -d)"
broken="$(mktemp -d)"
trap 'rm -rf "$work" "$refs" "$broken"' EXIT

# The subject resolves the contracts directory from its own location, so a copy of it inside a fake
# repository root reads the fake fixtures and never touches the real ones. Three cases below need a
# contracts tree of their own -- the schema differs between them -- and one list of what a working
# tree contains is the only way a file added to the subject's dependencies gets added to all three.
make_fake_tree() {
  mkdir -p "$1/.github/scripts" "$1/.github/contracts/fixtures/invalid-semantics"
  # envelope.py joined this list when the subject grew a drift check that hashes each fixture's raw
  # manifest. A dependency missing from the fake tree does not fail as a missing dependency -- the
  # subject dies before it reports anything, and every assertion below then reads a traceback.
  for name in contract-agreement.test.sh publish-decision.sh python-bin.sh canonical.py envelope.py; do
    cp "$script_dir/$name" "$1/.github/scripts/$name"
  done
}

make_fake_tree "$work"
cp "$script_dir/../contracts/observation.schema.json" "$work/.github/contracts/observation.schema.json"
cp "$script_dir/../contracts/release-envelope.schema.json" "$work/.github/contracts/release-envelope.schema.json"

# Two fixtures the schema must refuse, both filed as structurally valid so the subject reports the
# disagreement. One defect is buried in the marker's anyOf branch; the other carries a value long
# enough that quoting it whole is the same mistake in a different shape.
"$PYTHON" - "$script_dir/../contracts/fixtures/valid/prepared-only.json" "$work" <<'PYTHON'
import json
import pathlib
import sys

source, work = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
fixtures = work / ".github" / "contracts" / "fixtures"

buried = json.loads(source.read_text(encoding="utf-8"))
buried["lookups"]["preparedMarker"]["verification"]["attestationVerified"] = "yes"
(fixtures / "invalid-semantics" / "a-flag-that-is-a-string.json").write_text(
    json.dumps(buried, indent=2) + "\n", encoding="utf-8")

enormous = json.loads(source.read_text(encoding="utf-8"))
enormous["commit"] = "z" * 5000
(fixtures / "invalid-semantics" / "a-value-far-too-long.json").write_text(
    json.dumps(enormous, indent=2) + "\n", encoding="utf-8")

(fixtures / "expectations.json").write_text(json.dumps({
    "invalid-semantics/a-flag-that-is-a-string.json": {
        "actions": [], "schema": "accepts", "state": "CONFLICT"},
    "invalid-semantics/a-value-far-too-long.json": {
        "actions": [], "schema": "accepts", "state": "UNKNOWN"},
}, indent=2) + "\n", encoding="utf-8")
PYTHON

out="$(PUBLISH_DECISION_BASH="$BASH" "$BASH" "$work/.github/scripts/contract-agreement.test.sh" 2>&1)"
longest="$(printf '%s\n' "$out" | awk '{ if (length($0) > n) n = length($0) } END { print n + 0 }')"

# The subject must still be failing these two, or everything below is asserted about a green run.
problems=""
printf '%s' "$out" | grep -q 'failed=2' || problems="expected two failures, got: ${out:0:300}"
report "the fake tree does disagree" "$problems"

problems=""
(( longest <= 400 )) || problems="longest line is $longest characters"
report "no failure line is longer than a person will read" "$problems"

# Where, precisely. `lookups/preparedMarker` is the anyOf that failed; the field that failed it is
# three levels further down, and naming the branch instead of the field is what sent four fixtures'
# worth of reading time nowhere.
problems=""
printf '%s' "$out" | grep -q 'verification/attestationVerified' \
  || problems="did not name the field that failed: ${out:0:300}"
report "the report names the field, not the branch above it" "$problems"

problems=""
printf '%s' "$out" | grep -q 'chars omitted' || problems="quoted an enormous value without saying so"
report "a value too long to quote is cut and said to be cut" "$problems"

# Cutting from the front is the same error as printing everything, in the other direction: jsonschema
# puts the reason at the end of the message, after the value it is complaining about. A cut that
# keeps five thousand z's and loses "does not match" reports the input and withholds the verdict.
# Boundedness is already asserted above, so what is left to prove is that the cut kept the reason.
problems=""
printf '%s' "$out" | grep -q 'does not match' \
  || problems="the reason was cut away and only the value survived"
report "the reason survives the cut, not just the value" "$problems"

# A schema is allowed to reference a sibling file rather than restate its shape, and the subject has
# to be able to follow it. jsonschema stopped following a bare filename when RefResolver was
# deprecated in 4.18, so a reference the schema is entitled to write raised Unresolvable and no
# fixture was checked at all.
#
# The fake observation carries an $id the way the real one does and the sibling carries none, which
# is the harder of the two spellings: the reference then resolves against the $id's directory, and a
# loader that knows the sibling only by its bare filename never matches it.
make_fake_tree "$refs"
cat > "$refs/.github/contracts/observation.schema.json" <<'JSON'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/observation.schema.json",
  "$ref": "sibling.schema.json#/$defs/thing"
}
JSON
cat > "$refs/.github/contracts/sibling.schema.json" <<'JSON'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "thing": {
      "type": "object",
      "required": ["marker"],
      "properties": { "marker": { "type": "string" } }
    }
  }
}
JSON
# Objects rather than the bare string the referenced rule could just as well have been, because the
# subject's drift check asks each fixture for its lookups and a fixture that is not an object has no
# such method -- one traceback and no fixture at all gets reported, which is the failure this file
# exists to keep out.
printf '{ "marker": "x" }\n' > "$refs/.github/contracts/fixtures/follows-the-reference.json"
printf '{ "marker": 1 }\n' > "$refs/.github/contracts/fixtures/breaks-the-referenced-rule.json"
# Both filed as structurally valid. The second is not, deliberately: that is what makes the subject
# print what the schema said about it instead of silently agreeing.
cat > "$refs/.github/contracts/fixtures/expectations.json" <<'JSON'
{
  "follows-the-reference.json": { "actions": [], "schema": "accepts", "state": "UNKNOWN" },
  "breaks-the-referenced-rule.json": { "actions": [], "schema": "accepts", "state": "UNKNOWN" }
}
JSON

refs_out="$(PUBLISH_DECISION_BASH="$BASH" "$BASH" "$refs/.github/scripts/contract-agreement.test.sh" 2>&1)"

problems=""
printf '%s\n' "$refs_out" | grep -q '^ok    follows-the-reference\.json' \
  || problems="the fixture satisfying the referenced rule was not accepted"
printf '%s\n' "$refs_out" | grep -q "marker: 1 is not of type 'string'" \
  || problems="${problems:+$problems; }the fixture breaking it was not reported as a type failure naming the field"
[[ -z "$problems" ]] || problems="$problems -- ${refs_out:0:300}"
report 'a $ref into a sibling schema file is followed' "$problems"

# The same tree with the sibling deleted. What matters is not that this fails but how: an unfollowable
# reference raised out of the loop kills the run before it prints a single line, and a run that prints
# nothing reads exactly like a clean one. Twice on this branch a file missing from a fake tree failed
# in precisely that shape.
make_fake_tree "$broken"
cp -r "$refs/.github/contracts/." "$broken/.github/contracts/"
rm "$broken/.github/contracts/sibling.schema.json"

broken_out="$(PUBLISH_DECISION_BASH="$BASH" "$BASH" "$broken/.github/scripts/contract-agreement.test.sh" 2>&1)"
broken_status=$?

problems=""
(( broken_status != 0 )) || problems="the subject exited 0 on a reference it could not follow"
if printf '%s\n' "$broken_out" | grep -q 'Traceback'; then
  problems="${problems:+$problems; }it died with a traceback rather than reporting"
fi
printf '%s\n' "$broken_out" | grep -q 'FAIL.*sibling\.schema\.json' \
  || problems="${problems:+$problems; }no FAIL line named the file that could not be found"
[[ -z "$problems" ]] || problems="$problems -- ${broken_out:0:300}"
report 'a $ref to a file that is not there is a FAIL line, not a traceback' "$problems"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
