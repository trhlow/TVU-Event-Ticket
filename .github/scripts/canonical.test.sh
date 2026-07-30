#!/usr/bin/env bash
# Tests the one canonical form and the one strict reader.
#
# Two independent legs on purpose. The bytes are compared against a file a human can read, and the
# digest is compared against sha256sum rather than against anything in canonical.py -- a digest
# checked with the function that produced it proves only that the function is deterministic.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"
contracts="$script_dir/../contracts/canonical"

passed=0
failed=0
report() {
  if [[ -z "$2" ]]; then printf 'ok    %s\n' "$1"; passed=$((passed + 1))
  else printf 'FAIL  %s: %s\n' "$1" "$2"; failed=$((failed + 1)); fi
}

# A checker that prints its problems on stdout says nothing there when it dies on the way to the
# first one, and silence is what this file reads as success. The first version of this suite reported
# both Python legs green while canonical.py did not exist at all: the ModuleNotFoundError went to
# stderr and the exit status went nowhere. So: stderr joins stdout, and a non-zero exit is a problem
# in its own right rather than an empty set of them.
check() {  # check ARG... <<'PYTHON' ... PYTHON -> problems, or why there are none to be had
  local out
  if ! out="$("$PYTHON" - "$@" 2>&1)"; then
    printf 'the checker did not finish: %s' "${out:0:400}"
    return 0
  fi
  printf '%s' "$out"
}

# Leg one: the exact bytes.
problems="$(check "$script_dir" "$contracts" <<'PYTHON'
import pathlib, sys
sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads

contracts = pathlib.Path(sys.argv[2])
document = strict_loads(contracts.joinpath("golden.json").read_text(encoding="utf-8"))
want = contracts.joinpath("golden.bytes").read_bytes()
got = canonical_bytes(document)
if got != want:
    print(f"canonical bytes are {got!r}, golden.bytes says {want!r}")
elif want.endswith(b"\n"):
    print("golden.bytes ends with a newline; the canonical form has none")
PYTHON
)"
report "the canonical bytes are exactly the golden bytes" "$problems"

# Leg two: an independent hasher.
want_digest="$(tr -d ' \n' < "$contracts/golden.digest" 2>/dev/null)"
got_digest="sha256:$(sha256sum "$contracts/golden.bytes" | cut -d' ' -f1)"
problems=""
[[ -n "$want_digest" ]] || problems="golden.digest is missing or empty; "
[[ "$want_digest" == "$got_digest" ]] \
  || problems="${problems}golden.digest is '$want_digest', sha256sum says '$got_digest'"
report "golden.digest matches sha256sum of golden.bytes" "$problems"

# Every pinned parameter gets a case that fails when it is unpinned.
problems="$(check "$script_dir" <<'PYTHON'
import sys
sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads

def refuses(label, thunk):
    try:
        thunk()
    except ValueError:
        return None
    return f"{label} was accepted"

problems = [p for p in [
    refuses("a duplicate key", lambda: strict_loads('{"a":1,"a":2}')),
    refuses("NaN", lambda: strict_loads('{"a":NaN}')),
    refuses("Infinity", lambda: strict_loads('{"a":Infinity}')),
    refuses("a float", lambda: strict_loads('{"a":1.5}')),
    refuses("a BOM", lambda: strict_loads('﻿{"a":1}')),
    refuses("a float built in Python", lambda: canonical_bytes({"a": 1.5})),
] if p]

# ensure_ascii is pinned to True, which is what the existing Flyway checksums were computed with.
if b"\\u00e9" not in canonical_bytes({"a": "é"}):
    problems.append("non-ASCII was not escaped; ensure_ascii is not pinned to True")
if canonical_bytes({"a": 1}).endswith(b"\n"):
    problems.append("canonical bytes end with a newline")
if canonical_bytes({"b": 1, "a": 2}) != b'{"a":2,"b":1}':
    problems.append("keys are not sorted, or separators carry whitespace")
print("; ".join(problems))
PYTHON
)"
report "every pinned parameter is pinned" "$problems"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
