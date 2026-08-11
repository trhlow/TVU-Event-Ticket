# .github/scripts/attest-verify.test.py
"""Exercises verify_attestation against what CAN be proven locally: a fresh file with genuinely zero
attestations (any newly-created file qualifies -- nobody has signed it, so gh must report "no
attestations found" for real, not a fabricated response). The "a real signature verifies successfully"
path is NOT exercised here -- design doc's own note (and this plan's Global Constraints) records that no
real signed artifact could be obtained in this session to test against; that path is proven for real the
first time this runs inside actual CI against a real actions/attest-build-provenance-signed artifact,
the same category of gap oci-push.py's bearer-token auth path already has.
"""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location("attest_verify", HERE / "attest-verify.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
verify_attestation = _module.verify_attestation
AttestationCheckError = _module.AttestationCheckError

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


unsigned_file = HERE / "collector-fixtures" / "definitely-unsigned.txt"
unsigned_file.write_text("nobody has ever attested this file", encoding="utf-8")
try:
    result = verify_attestation(
        str(unsigned_file),
        expected_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
        expected_predicate_type="https://slsa.dev/provenance/v1",
        expected_source_digest="0" * 40,
    )
    report("an unsigned artifact returns attestationVerified: False, not an exception",
           result.get("attestationVerified") is False,
           f"result={result!r}")
    report("an unsigned artifact's result still has the other three keys (all meaningless when "
           "unverified, but the shape must be complete for a caller that doesn't branch on the "
           "boolean before reading the rest)",
           {"signerRepository", "signerWorkflow", "sourceRevision"} <= set(result.keys()),
           f"result keys: {sorted(result.keys())}")
except AttestationCheckError as exc:
    report("an unsigned artifact returns attestationVerified: False, not an exception", False,
           f"raised AttestationCheckError instead: {exc}")
finally:
    unsigned_file.unlink()

# A nonexistent artifact path is a different failure class -- gh itself cannot even attempt the check,
# which must be AttestationCheckError, not a silently-false result indistinguishable from "checked and
# unsigned."
try:
    verify_attestation(
        str(HERE / "collector-fixtures" / "this-path-does-not-exist-at-all.bin"),
        expected_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
        expected_predicate_type="https://slsa.dev/provenance/v1",
        expected_source_digest="0" * 40,
    )
    report("a nonexistent artifact path raises AttestationCheckError", False,
           "no exception was raised")
except AttestationCheckError:
    report("a nonexistent artifact path raises AttestationCheckError", True)
except Exception as exc:  # noqa: BLE001
    report("a nonexistent artifact path raises AttestationCheckError", False,
           f"raised {type(exc).__name__} instead")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
