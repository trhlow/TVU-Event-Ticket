#!/usr/bin/env bash
# Tests that one variable decides which Python runs the contract scripts, and that the guard which
# keeps it that way cannot be walked past.
#
# On a Windows workstation `python3` on PATH is the WindowsApps stub: it exits without running
# anything, so a script that pipes a program into it gets an empty result rather than a failure.
# That is the worst available shape of wrong -- nothing says so. Two classes of case here: the
# override is honoured and a bad interpreter is refused for a reason it states (cases 1-7), and the
# regression guard actually catches what it claims to (cases 8-11).
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
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
trap 'rm -rf "$work"' EXIT

# Resolve the interpreter this run is actually using, so the shims below wrap a working one.
real="${PYTHON_BIN:-python3}"
if [[ "$real" != /* && "$real" != ?:* ]]; then real="$(command -v "$real" || true)"; fi
if [[ -z "$real" ]]; then
  printf 'FAIL  no interpreter to test with; set PYTHON_BIN\n'; exit 1
fi

observation="$work/observation.json"
cp "$script_dir/../contracts/fixtures/valid/nothing-published.json" "$observation"

# "$BASH" rather than `bash`: this whole file exists because an interpreter resolved from PATH was
# the wrong one, and a test that reaches for PATH to prove that would be making the same bet it is
# trying to retire. On this workstation PATH order happens to favour Git Bash over WSL's, which is
# luck, not a guarantee.
decide_with() {  # decide_with INTERPRETER -> stdout+stderr of publish-decision.sh, its exit status
  PYTHON_BIN="$1" "$BASH" "$script_dir/publish-decision.sh" "$observation" 2>&1
}

# --- The override is honoured, and a bad interpreter is refused -------------------------------

# A directory with a space in it. An unquoted interpreter path splits here and the script runs
# something that does not exist.
spaced="$work/with a space"
mkdir -p "$spaced"
printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$real" > "$spaced/python3"
chmod +x "$spaced/python3"

problems=""
if ! out="$(decide_with "$spaced/python3")"; then
  problems="exited non-zero: ${out:0:200}"
elif ! printf '%s' "$out" | grep -q '"state"'; then
  problems="no decision on stdout: ${out:0:200}"
fi
report "an interpreter path containing a space is honoured" "$problems"

# Refusing an interpreter has to be about what comes back, not about the exit status. This shim is
# the failure mode the stub actually has: it consumes the program and exits 0 with no output. An
# exit-code-only probe accepts it, and then every suite reads back nothing and calls it a result.
printf '#!/usr/bin/env bash\ncat >/dev/null 2>&1\nexit 0\n' > "$work/swallows-and-succeeds"
chmod +x "$work/swallows-and-succeeds"

# Serves a program on stdin but refuses -c. publish-decision.sh only uses stdin, so nothing here
# would notice -- until python_json in publish-decision.test.sh runs and half the suite dies.
printf '#!/usr/bin/env bash\nif [ "$1" = "-c" ]; then exit 2; fi\nexec "%s" "$@"\n' "$real" \
  > "$work/stdin-only"
chmod +x "$work/stdin-only"

# Runs everything correctly and is still not allowed: it answers 3.9, below the floor jsonschema
# needs. `sys.version_info` is an ordinary module attribute, so the floor can be tested without a
# 3.9 installed anywhere. Both invocation shapes are spoofed -- a shim that only spoofed one would
# be refused for the shape it broke rather than for the version, and the floor would stay untested.
cat > "$work/predates-the-floor" <<EOF
#!/usr/bin/env bash
real=$(printf '%q' "$real")
spoof='import sys; sys.version_info = (3, 9, 0, "final", 0)'
if [ "\$1" = "-c" ]; then exec "\$real" -c "\$spoof
\$2"; fi
program="\$(cat)"
printf '%s\n%s\n' "\$spoof" "\$program" | "\$real" -
EOF
chmod +x "$work/predates-the-floor"

# Two shims that differ only in which shape they break, because the probe has two sentinel checks
# and a suite that never reaches the second one cannot claim it works. predates-the-floor is refused
# by the stdin check, so it leaves the `-c` check unexercised in a green run -- exactly the state
# this file was written to stop trusting.
cat > "$work/wrong-sentinel-on-stdin" <<EOF
#!/usr/bin/env bash
real=$(printf '%q' "$real")
if [ "\$1" = "-c" ]; then exec "\$real" -c "\$2"; fi
cat >/dev/null
printf 'PYBIN-WRONG'
EOF
cat > "$work/wrong-sentinel-on-c" <<EOF
#!/usr/bin/env bash
real=$(printf '%q' "$real")
if [ "\$1" = "-c" ]; then printf 'PYBIN-WRONG'; exit 0; fi
exec "\$real" "\$@"
EOF
chmod +x "$work/wrong-sentinel-on-stdin" "$work/wrong-sentinel-on-c"

# What the refusal says, not merely that one happened. Naming PYTHON_BIN is the least of it: a probe
# that reports the shape it was not asked about sends the reader to the wrong file, and a probe that
# says "could not run" when it means "answered the wrong thing" describes a different bug than the
# one present. Each expectation below is the sentence only that shim can produce.
for spec in \
  "does-not-exist|could not run a program arriving on stdin" \
  "swallows-and-succeeds|answered '' instead of PYBIN-OK for a program on stdin" \
  "stdin-only|could not run a program passed with -c" \
  "wrong-sentinel-on-stdin|answered 'PYBIN-WRONG' instead of PYBIN-OK for a program on stdin" \
  "wrong-sentinel-on-c|answered 'PYBIN-WRONG' instead of PYBIN-OK for -c" \
  "predates-the-floor|PYBIN-TOO-OLD"
do
  shim="${spec%%|*}"; expected="${spec#*|}"
  problems=""
  if out="$(decide_with "$work/$shim")"; then
    problems="accepted; output: ${out:0:200}"
  elif ! printf '%s' "$out" | grep -q 'PYTHON_BIN'; then
    problems="failed without naming PYTHON_BIN: ${out:0:200}"
  elif ! printf '%s' "$out" | grep -qF "$expected"; then
    problems="refused without saying '$expected': ${out:0:200}"
  fi
  report "an interpreter that $shim is refused, loudly" "$problems"
done

# --- The regression guard ----------------------------------------------------------------------

# python-bin.sh owns the default; nobody else may name an interpreter, or the override stops
# covering the whole surface.
#
# The character classes are the whole design. An earlier pattern was `python3[ "]` with `"`
# excluded from what may precede it -- excluded to protect "$PYTHON", which `$` alone already
# protects -- and seven unremarkable rewrites walked past it: `PY=python3`, `PY=python3;`,
# `PY='python3'`, `"python3" -c`, `python3.11 -c`, `python3<<EOF` and `python3<TAB>-c`, each of them
# a fixture below. So: any non-word, non-`$` character may
# precede, any non-word character or end-of-line may follow, and a version suffix is allowed.
# `python_json` and the `<<'PYTHON'` delimiter must not match -- the former because `_` is a word
# character, the latter because the pattern is lower-case and grep -E is case-sensitive.
NAMED_INTERPRETER='(^|[^A-Za-z0-9_$])python[0-9.]*([^A-Za-z0-9_]|$)'

scan_for_a_named_interpreter() {  # scan FILE... -> offending "file:line:text" lines, or a diagnosis
  local out rc offenders arc
  # -H as well as -n: with a single file grep omits the filename, and then the prefix this function
  # splits off is one field shorter than it expects -- it would cut into the code at the first colon
  # the line happens to contain. -H makes the shape `file:line:content` regardless of how many files
  # were handed in.
  out="$(grep -HnE "$NAMED_INTERPRETER" "$@")"
  rc=$?
  # grep exits 1 for "no matches" and >1 for "I could not look" -- an unreadable file, a bad
  # pattern. Collapsing both into "clean" with `|| true` is how a guard reports success for a scan
  # it never performed.
  if (( rc > 1 )); then
    printf 'grep could not complete the scan (status %d)' "$rc"
    return 0
  fi
  (( rc == 1 )) && return 0
  # Two exemptions, both narrow, and neither of them may drop a line wholesale -- an exemption that
  # discards the line discards whatever else was on it. `source "$script_dir/python-bin.sh"; python3
  # -c pass` and `msg="a:  #b"; python3 -c pass` both walked past the earlier line-wise version.
  #
  # So: split the `file:line:` prefix off first and judge only the content -- a path is not source
  # code, and the pattern's `^`/`$` should anchor to the line as written. A comment counts only when
  # the content itself starts with `#`; the helper's name is blanked out where it appears rather
  # than taken as absolution for the rest of the line. A prefix that will not split is a scan that
  # did not happen, and says so.
  offenders="$(printf '%s\n' "$out" | awk -v pat="$NAMED_INTERPRETER" '
    {
      c = index($0, ":"); rest = substr($0, c + 1); d = index(rest, ":")
      if (c == 0 || d == 0) { bad = 1; next }
      content = substr(rest, d + 1)
      probe = content; sub(/^[[:space:]]+/, "", probe)
      if (probe ~ /^#/) next
      gsub(/python-bin\.sh/, " ", content)
      if (content ~ pat) print
    }
    END { if (bad) exit 3 }
  ')"
  arc=$?
  if (( arc != 0 )); then
    printf 'the scanner could not read back what grep found (status %d)' "$arc"
    return 0
  fi
  printf '%s' "$offenders"
}

# The error path is the one a guard never exercises by accident, so it is exercised on purpose: a
# file that is not there must produce a diagnosis, not silence. Without this, `|| true` can come
# back and the suite stays green.
problems=""
# 2>/dev/null only here: grep's own complaint about the missing file is expected in this one case,
# and a green log should not carry a line that reads like a failure.
if [[ -z "$(scan_for_a_named_interpreter "$work/no-such-file.sh" 2>/dev/null)" ]]; then
  problems="an unreadable file scanned clean"
fi
report "a scan that could not be performed is not reported as clean" "$problems"

# Discovered, not hard-coded: a consumer added next month is covered the day it lands. Two files may
# legitimately name an interpreter -- python-bin.sh, which owns the default, and this file, which
# carries the pattern and the fixtures below.
#
# A glob rather than `find ... | sort` read through a process substitution. Nothing observes the
# status of a command inside `< <( )`: a find that printed three files and then exited 2 would hand
# over a short list and the suite would go green on a partial scan. The glob has no status to lose
# -- the shell either expands it or leaves it literal, and a literal is not a file, so an
# unexpanded glob arrives at the count assertion below as zero consumers rather than as one.
consumers=()
for path in "$script_dir"/*.sh; do
  [[ -f "$path" ]] || continue
  case "${path##*/}" in
    python-bin.sh|interpreter-override.test.sh) continue ;;
  esac
  consumers+=("$path")
done

# A scan of nothing reports clean. That is the one result this guard must never produce quietly, so
# the discovery is asserted before it is trusted.
problems=""
(( ${#consumers[@]} >= 3 )) || problems="discovered only ${#consumers[@]} consumers to scan"
report "there are consumers to scan at all" "$problems"

report "no contract script names an interpreter" "$(scan_for_a_named_interpreter "${consumers[@]}")"

# The guard is worth having only if it catches what it claims to. Ten rewrites that must be caught
# -- seven that defeated the earlier pattern, three that defeated the earlier exemptions -- and the
# shapes that must stay legal.
printf 'PY=python3\n"$PY" -c "pass"\n'  > "$work/bypass-assignment-eol.sh"
printf 'PY=python3;\n'                  > "$work/bypass-assignment-semicolon.sh"
printf 'PY=%spython3%s\n' "'" "'"       > "$work/bypass-assignment-quoted.sh"
printf '"python3" -c "pass"\n'          > "$work/bypass-quoted-command.sh"
printf 'python3.11 -c "pass"\n'         > "$work/bypass-versioned.sh"
printf 'python3<<EOF\npass\nEOF\n'      > "$work/bypass-heredoc.sh"
printf 'python3\t-c "pass"\n'           > "$work/bypass-tab.sh"
# The two that walked past the line-wise exemptions: an exempt token and an exempt-looking comment
# share a line with a real invocation. `&&` as well as `;`, because the next rewrite is whichever
# separator was not thought of.
printf 'source "$script_dir/python-bin.sh"; python3 -c "pass"\n'  > "$work/bypass-after-source.sh"
printf 'source "$script_dir/python-bin.sh" && python3 -c "pass"\n' > "$work/bypass-after-source-and.sh"
printf 'msg="a:  #b"; python3 -c "pass"\n'                        > "$work/bypass-colon-hash.sh"

# Legal, and syntactically real: bash -n proves the fixture is the shape it claims to be, so a
# malformed fixture cannot make this case pass by accident.
{
  printf 'script_dir=.\n'
  printf 'source "$script_dir/python-bin.sh"\n'
  printf '  # python3 is chosen by python-bin.sh, and prose about it stays legal\n'
  printf 'python_json() { "$PYTHON" -c "$1"; }\n'
  printf '"$PYTHON" - <<%sPYTHON%s\nimport sys\nPYTHON\n' "'" "'"
} > "$work/legal-shapes.sh"

problems=""
"$BASH" -n "$work/legal-shapes.sh" 2>/dev/null || problems="the legal-shapes fixture is not valid bash; "
# The same fail-open the consumer discovery has: a loop over a glob that matched nothing runs its
# body zero times and reports success. The count is spelled out so that deleting a fixture is a
# failure rather than a quiet reduction in what this case covers; raise it when adding one.
shapes=("$work"/bypass-*.sh)
(( ${#shapes[@]} == 10 )) || problems="${problems}${#shapes[@]} bypass fixtures, expected 10; "
for shape in "${shapes[@]}"; do
  [[ -n "$(scan_for_a_named_interpreter "$shape")" ]] \
    || problems="${problems}$(basename "$shape" .sh) slipped past the guard; "
done
[[ -z "$(scan_for_a_named_interpreter "$work/legal-shapes.sh")" ]] \
  || problems="${problems}the guard fired on python_json or the heredoc delimiter; "
report "the guard catches every rewrite that defeated an earlier pattern" "$problems"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
