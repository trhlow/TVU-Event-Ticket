#!/usr/bin/env bash
# Which Python runs the contract scripts. Sourced, never executed: it sets PYTHON for the caller.
#
# On an Ubuntu runner `python3` on PATH is the only one there is. On a Windows workstation it is the
# WindowsApps stub, which prints a sentence about the Microsoft Store and exits without running the
# program it was handed, so every script that pipes one into it read back nothing and reported that
# as a result.
#
# PYTHON is quoted at every use site: an interpreter path may contain a space, and an unquoted one
# splits into a command nobody installed.
# shellcheck disable=SC2034  # PYTHON is for the caller; this file is sourced, never executed.
PYTHON="${PYTHON_BIN:-python3}"

# Probed by what comes back, not by the exit status. An earlier version of this probe checked only
# the exit code and discarded stdout, so a fake interpreter that ignores its input and exits 0
# satisfied it -- and "exit 0 with no result" is the precise failure this file exists to catch,
# because that is exactly what the stub does.
#
# Both invocation shapes are probed. publish-decision.sh and contract-agreement.test.sh pipe a
# program into `-`; publish-decision.test.sh's python_json passes one with `-c`. An interpreter that
# serves one shape and refuses the other passes a single-shape probe and then fails half the suite
# for a reason the probe already had the chance to name.
#
# The floor is 3.10 because contract-agreement.test.sh installs jsonschema==4.26.0, which requires
# it. One floor, set by the strictest consumer, rather than a number per script.
_pybin_sentinel='PYBIN-OK'
_pybin_program='import sys
sys.stdout.write("PYBIN-OK" if sys.version_info[:2] >= (3, 10) else "PYBIN-TOO-OLD")'

_pybin_fail() {
  printf 'FAIL  interpreter %s %s; set PYTHON_BIN to a working Python 3.10+\n' "$PYTHON" "$1" >&2
  exit 1
}

_pybin_got="$(printf '%s\n' "$_pybin_program" | "$PYTHON" - 2>/dev/null)" \
  || _pybin_fail "could not run a program arriving on stdin"
[ "$_pybin_got" = "$_pybin_sentinel" ] \
  || _pybin_fail "answered '$_pybin_got' instead of $_pybin_sentinel for a program on stdin"

_pybin_got="$("$PYTHON" -c "$_pybin_program" 2>/dev/null)" \
  || _pybin_fail "could not run a program passed with -c"
[ "$_pybin_got" = "$_pybin_sentinel" ] \
  || _pybin_fail "answered '$_pybin_got' instead of $_pybin_sentinel for -c"

unset _pybin_got _pybin_program _pybin_sentinel
