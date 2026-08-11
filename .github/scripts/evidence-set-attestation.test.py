# .github/scripts/evidence-set-attestation.test.py
"""Exercises read_evidence_set_attestation against an UNSIGNED subject -- the only real, exercisable
path in this session (see attest-verify.py's own Task 1 note: no real signed sample was obtainable).
The 'found a real attestation' path is written to spec, confirmed on first real CI run (roadmap 3.4),
same category of gap as attest-verify.py's own attestationVerified:True branch."""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence_set_attestation_mod = _load("evidence-set-attestation")
read_evidence_set_attestation = evidence_set_attestation_mod.read_evidence_set_attestation

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


# A registry_ref/tag with no real evidence-set pushed and no real attestation -- the attestation check
# targets an oci:// ref that gh cannot resolve at all locally (no GHCR credentials in this session), so
# this exercises the "not found" path the same way attest-verify.py's own test does, not a real
# multi-attestation scenario.
result = read_evidence_set_attestation(
    "localhost:1/nothing-here", "no-such-tag", "vulnerabilityScan",
    subject_digest="sha256:" + "1" * 64,
    expected_source_repo="trhlow/TVU-Event-Ticket",
    expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
)
report("an unreachable/unsigned target reports scanAttestationAbsent shape, not a crash",
       result.get("status") in ("absent", "error"),
       f"result={result!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
