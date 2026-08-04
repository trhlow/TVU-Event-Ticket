#!/usr/bin/env python3
"""Mutation runner for publish-decision.sh.

Every guard in the decision function is a claim that something cannot happen. A suite that stays
green when a guard is deleted is not evidence for that claim -- and this suite has twice been
fail-open in ways only mutation testing revealed: once because a crashed comparison printed
nothing and nothing counted as success, once because a schema change left two fixtures rejected by
a different guard before they reached the one they were written for.

A runner, not a mutator. It copies the scripts to a temporary directory, applies each mutation
there, requires the suite to go red, and reports survivors. The working tree is never touched, so a
run that dies halfway leaves nothing half-mutated behind; the previous version edited in place and
had to be restored by hand, which is also why its results were only reproducible by whoever ran it.

Usage:  python3 .github/scripts/publish-decision.mutations.py
Exit:   0 if every mutation was caught, 1 otherwise.
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
# Which bash runs the suite. On a Linux runner the default is the only one there is; on a Windows
# workstation `bash` on PATH is WSL's, which cannot see the interpreter this script was started
# with, so every run reported the baseline red and no mutation was ever exercised. A red baseline is
# refused rather than reported as a result, so this only ever cost a run -- but it cost every run.
BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")
SUBJECT = "publish-decision.sh"
SUITE = "publish-decision.test.sh"
PYTHON_BIN_LIB = "python-bin.sh"
# The subject imports this rather than restating the canonical form, so it has to travel with the
# scripts into the workspace. Without it the baseline is red and no mutation is exercised at all.
CANONICAL_LIB = "canonical.py"
# The suite derives every marker's envelope from its content rather than typing one beside it, so it
# imports this the way the subject imports canonical.py. Without it here the baseline is red -- 72
# cases failing on an unreadable observation -- and the runner refuses to exercise a single mutation,
# which is how it sat between the envelope commit and this one: not wrong, simply never run.
ENVELOPE_LIB = "envelope.py"

# If this runner started at all, its own interpreter works, so hand that one down rather than
# letting the children fall back to a `python3` that may be a stub. An explicit PYTHON_BIN still
# wins: the caller may be testing a different interpreter on purpose.
CHILD_ENV = {**os.environ, "PYTHON_BIN": os.environ.get("PYTHON_BIN") or sys.executable}

# Each entry removes exactly one guard. The key is what gets reported when a mutation survives.
MUTATIONS = {
    "conflict_carries_actions": (
        'return decision("CONFLICT", [], reason, cleanup_debt)',
        'return decision("CONFLICT", ["build_new"], reason, cleanup_debt)'),
    "schema_version_loose_type": (
        'require(type(value) is int, f"{where} must be an integer, got {value!r}")',
        'require(isinstance(value, (int, float)), "x")'),
    "regex_match_not_fullmatch": (
        "pattern.fullmatch(value)", "pattern.match(value)"),
    "absence_without_404": (
        'require(exact_int(lookup.get("observedCode"), f"lookups.{name}.observedCode") == 404,',
        "require(True,"),
    "status_fields_not_enforced": (
        "require(present_fields <= allowed_fields,",
        "require(True or present_fields <= allowed_fields,"),
    # The shared allowed-set restored, with required still chosen per kind: a tag may carry the
    # marker's fields and a marker may carry a tag's digest, which is exactly the divergence the one
    # shared "present" entry used to hide. It reddens the two field-set witnesses and nothing else.
    #
    # `kind = "marker"` was the obvious mutation and it is the wrong one. Judged as a marker, the tag
    # is missing markerDigest and ociEnvelope -- it was `content` until content became conditional --
    # so it is still refused and both witnesses stay green, while every object
    # lookup in every valid fixture becomes a marker and reddens a crowd of unrelated cases. It would
    # have been reported as caught while proving nothing about the rule it names.
    "present_allowed_fields_unioned": (
        "required_fields, allowed_fields = PRESENT_FIELDS[kind]",
        "required_fields = PRESENT_FIELDS[kind][0]\n"
        '            allowed_fields = PRESENT_FIELDS["marker"][1] | PRESENT_FIELDS["object"][1]'),
    "marker_fork_ignored": (
        'if final["markerDigest"] != prepared["markerDigest"]:', "if False:"),
    "same_digest_different_content": (
        'if canonical_bytes(final["content"]) != canonical_bytes(prepared["content"]):',
        "if False:"),
    "complete_skips_digest_objects": (
        '        problem = missing_or_mismatched(objects, claimed, "digest object")\n'
        "        if problem:\n"
        "            return conflict(problem, cleanup_debt)\n"
        '        problem = missing_or_mismatched(tags, claimed, "tag")',
        '        problem = missing_or_mismatched(tags, claimed, "tag")'),
    "absent_ignores_digest_objects": (
        '        stray += [f"{image} digest object" for image in IMAGES\n'
        '                  if objects[image]["status"] == "present"]\n',
        ""),
    "migration_records_unvalidated": (
        "if type(record) is not dict:", "if False and type(record) is not dict:"),
    "inventory_checksum_not_recomputed": (
        'if inventory.get("checksum") != computed:', "if False:"),
    # The schema now lets a negative verdict be stated, which makes the decision the only thing
    # standing between "verification came back false" and a release. Before this fixture existed the
    # schema refused the observation first, so this guard was never the one that fired.
    "negative_verdict_accepted": (
        'if verification.get("attestationVerified") is not True:',
        "if False:"),
    "verification_policy_ignored": (
        'if verification.get("policyPassed") is not True:', "if False:"),
    "retry_range_narrowed": (
        "or (type(code) is int and 500 <= code <= 599)", ""),
    "cleanup_debt_lost_on_unknown": (
        "return unknown(reason, retryable, cleanup_debt)",
        "return unknown(reason, retryable)"),
    # The scan used to return inside the loop, so with a 503 and a 403 present together the verdict
    # followed whichever lookup name sorted first. Restoring that is restoring the bug.
    "first_error_decides_retryable": (
        "retryable = all(retryable_failure(lookup) for _, lookup in failures)",
        "retryable = retryable_failure(failures[0][1])"),
    "status_type_unchecked": (
        'require(type(status) is str, f"lookups.{name}.status must be a string, got {status!r}")',
        "pass"),
    "skipped_reason_unchecked": (
        'require(lookup.get("reason") in SKIP_REASONS,', "require(True,"),
    "registry_unchecked": (
        'require(type(expected.get("registry")) is str and expected["registry"],',
        "require(True,"),
    "queried_ref_scope_ignored": (
        'require(ref.startswith(scope + ":") or ref.startswith(scope + "@"),',
        "require(True,"),
    "skipped_ref_unchecked": (
        "require(ref is None,", "require(True,"),
    "verification_predicate_ignored": (
        'predicate = verification.get("predicateType")\n'
        "    if type(predicate) is not str or not predicate:",
        'predicate = verification.get("predicateType")\n    if False:'),
    "evidence_kinds_narrowed": (
        'for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):',
        'for kind in ("sbom", "vulnerabilityScan"):'),
    "evidence_predicate_ignored": (
        '                predicate = entry.get("predicateType")\n'
        "                if type(predicate) is not str or not predicate:",
        '                predicate = entry.get("predicateType")\n                if False:'),
    "evidence_result_ignored": (
        'if entry.get("passed") is not True:', "if False:"),
    "installed_rank_unchecked": (
        "if type(rank) is not int or rank < 1:", "if False:"),
    "repeatable_duplicates_allowed": (
        "if script in seen_repeatables:", "if False:"),
    "canonical_order_ignored": (
        'ordered = sorted(migrations, key=lambda record: record["installedRank"])',
        "ordered = migrations"),
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
    # The mutation the eight per-lookup cases were actually written for. lookup_repository_ignored
    # below is caught only as collateral: under it the other lookups in the same observation fall
    # outside the release scope and one of those is refused first, so all eight still reach UNKNOWN
    # for the wrong reason and would report `caught` with the eight deleted. This one widens the
    # scope instead of moving it, leaving every other lookup valid, so only the eight can object.
    "queried_ref_scope_any_repository": (
        'require(ref.startswith(scope + ":") or ref.startswith(scope + "@"),',
        'require(any(ref.startswith(f"{expected[\'registry\']}/{other}{sep}")\n'
        '                   for other in repositories.values() for sep in (":", "@")),'),
    # Nesting made this guard load-bearing and simultaneously cost it its witness: the look-alike
    # was built on the old flat scope and stopped extending the new one.
    "scope_separator_ignored": (
        'require(ref.startswith(scope + ":") or ref.startswith(scope + "@"),',
        "require(ref.startswith(scope),"),
    "oci_repository_pattern_ignored": (
        'exact_str(repositories[role], f"expected.repositories.{role}", OCI_REPOSITORY)',
        'require(type(repositories[role]) is str and repositories[role], f"expected.repositories.{role}")'),
    "repositories_extra_role_allowed": (
        "require(not extra_roles,", "require(True,"),
    "top_level_keys_open": (
        "require(not unexpected_top,", "require(True,"),
    "expected_keys_open": (
        "require(not unexpected_expected,", "require(True,"),
    # Before the split these two were one string, so this comparison could not be got wrong.
    # A payload may be read only when exactly one layer says which bytes are the payload. The two
    # arms are separate mutations because they answer differently: presence is an agreement between
    # the marker and its envelope, so breaking it is UNKNOWN, while the layer count itself is a fact
    # about the bytes the digest names, so breaking it is CONFLICT.
    "content_presence_unchecked": (
        'require(("content" in marker) == one_layer,', "require(True,"),
    "layer_count_ignored": (
        "if not one_layer:", "if False:"),
    "signer_compared_to_release_repository": (
        'if verification.get("signerRepository") != expected["sourceRepository"]:',
        'if verification.get("signerRepository") != expected["repositories"]["release"]:'),
}


# Long enough for a slow runner, short enough that a mutation which introduces a loop fails the
# lint job in minutes rather than occupying it until the job timeout.
SUITE_TIMEOUT_SECONDS = 120


# An excerpt rather than the whole capture, and kept from the end. A suite that could not start says
# so in one line; a suite that died mid-run says so in its last few, which is where a traceback puts
# the reason. Pasting four hundred lines into a job log is how a report stops being read, and keeping
# a silent fraction of them is how someone concludes the suite printed nothing -- so what was left
# out is counted out loud.
EXCERPT_LINES = 15
EXCERPT_LINE_CHARS = 200


def excerpt(label, text):
    lines = (text or "").splitlines()
    if not lines:
        return f"{label}: nothing"
    dropped = len(lines) - EXCERPT_LINES
    kept = lines[-EXCERPT_LINES:] if dropped > 0 else lines
    if dropped > 0:
        head = f"{label}, last {len(kept)} of {len(lines)} lines ({dropped} earlier omitted):"
    else:
        head = f"{label}:"
    body = []
    for line in kept:
        if len(line) > EXCERPT_LINE_CHARS:
            line = f"{line[:EXCERPT_LINE_CHARS]} [{len(line) - EXCERPT_LINE_CHARS} chars omitted]"
        body.append(f"  | {line}")
    return "\n".join([head] + body)


def run_suite(directory):
    """Returns (exit code, failing cases, timed_out, stdout, stderr)."""
    try:
        result = subprocess.run([BASH, SUITE], cwd=directory, capture_output=True, text=True,
                                timeout=SUITE_TIMEOUT_SECONDS, env=CHILD_ENV)
    except subprocess.TimeoutExpired:
        return None, 0, True, "", ""
    red = sum(1 for line in result.stdout.splitlines() if line.startswith("FAIL"))
    return result.returncode, red, False, result.stdout, result.stderr


def main():
    with tempfile.TemporaryDirectory() as workspace:
        workspace = pathlib.Path(workspace)
        for name in (SUBJECT, SUITE, PYTHON_BIN_LIB, CANONICAL_LIB, ENVELOPE_LIB):
            shutil.copy(HERE / name, workspace / name)
        pristine = (workspace / SUBJECT).read_text(encoding="utf-8")

        # A suite that is already red proves nothing about any mutation.
        code, red, timed_out, out, err = run_suite(workspace)
        if timed_out:
            # The baseline hanging is a defect in the suite or the runner, not a result about any
            # guard, so it must not be reported as one.
            print(f"the suite did not finish within {SUITE_TIMEOUT_SECONDS}s before any mutation")
            return 1
        if code != 0:
            # The count alone was the whole report for a while, and a baseline that dies before
            # printing a single FAIL line has a count of zero -- so it read "(0 failing)" and said
            # nothing about a bash that could not start or an interpreter that ran nothing.
            print(f"the suite is red before any mutation ({red} failing, exit {code}); fix that first")
            print(excerpt("its stdout", out))
            print(excerpt("its stderr", err))
            return 1
        print("baseline: suite green")

        survivors = []
        for name, (old, new) in MUTATIONS.items():
            if old not in pristine:
                # A mutation that no longer applies is not a caught mutation: the guard it targets
                # may have been renamed, or removed entirely, and either way nothing was tested.
                print(f"STALE    {name}: the code it mutates is gone")
                survivors.append(name)
                continue
            (workspace / SUBJECT).write_text(pristine.replace(old, new, 1), encoding="utf-8")
            code, red, timed_out, _, _ = run_suite(workspace)
            if timed_out:
                # A mutant that hangs was still detected -- the suite noticed something -- but it is
                # worth distinguishing from a clean red, because the cause is a loop rather than an
                # assertion.
                print(f"caught   {name} (by timeout)")
                (workspace / SUBJECT).write_text(pristine, encoding="utf-8")
                continue
            if code == 0:
                print(f"SURVIVED {name}: the suite stayed green without this guard")
                survivors.append(name)
            else:
                print(f"caught   {name} ({red} failing)")
            (workspace / SUBJECT).write_text(pristine, encoding="utf-8")

        print()
        if survivors:
            print(f"{len(survivors)} of {len(MUTATIONS)} mutations survived: " + ", ".join(survivors))
            return 1
        print(f"all {len(MUTATIONS)} mutations caught")
        return 0


if __name__ == "__main__":
    sys.exit(main())
