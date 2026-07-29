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
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SUBJECT = "publish-decision.sh"
SUITE = "publish-decision.test.sh"

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
    "marker_fork_ignored": (
        'if final["markerDigest"] != prepared["markerDigest"]:', "if False:"),
    "same_digest_different_content": (
        'if canonical(final["content"]) != canonical(prepared["content"]):', "if False:"),
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
    "verification_policy_ignored": (
        'if verification.get("policyPassed") is not True:', "if False:"),
    "retry_range_narrowed": (
        "or (type(code) is int and 500 <= code <= 599)", ""),
    "cleanup_debt_lost_on_unknown": (
        'return unknown(f"{name}: lookup failed with code={code}", retryable, cleanup_debt)',
        'return unknown(f"{name}: lookup failed with code={code}", retryable)'),
    "status_type_unchecked": (
        'require(type(status) is str, f"lookups.{name}.status must be a string, got {status!r}")',
        "pass"),
    "skipped_reason_unchecked": (
        'require(lookup.get("reason") in SKIP_REASONS,', "require(True,"),
}


def run_suite(directory):
    result = subprocess.run(["bash", SUITE], cwd=directory, capture_output=True, text=True)
    red = sum(1 for line in result.stdout.splitlines() if line.startswith("FAIL"))
    return result.returncode, red


def main():
    with tempfile.TemporaryDirectory() as workspace:
        workspace = pathlib.Path(workspace)
        for name in (SUBJECT, SUITE):
            shutil.copy(HERE / name, workspace / name)
        pristine = (workspace / SUBJECT).read_text(encoding="utf-8")

        # A suite that is already red proves nothing about any mutation.
        code, red = run_suite(workspace)
        if code != 0:
            print(f"the suite is red before any mutation ({red} failing); fix that first")
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
            code, red = run_suite(workspace)
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
