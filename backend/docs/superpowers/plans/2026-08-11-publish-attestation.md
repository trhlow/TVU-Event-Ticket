# Publish job: real attestation signing and verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close design doc §7b's gap: `publish-decision.sh` hard-requires `verification.attestationVerified:
true` (and the matching `signerRepository`/`signerWorkflow`/`sourceRevision`/`predicateType`) with no
path around it, for both the marker and every evidence report. This plan adds (1) the CI-side step that
creates real signed attestations via `actions/attest-build-provenance`, and (2) a verification module
that calls `gh attestation verify` and reports the schema's `verification`/`presentAttestation` shape.

**Architecture:** Two independent pieces. CI-side: new steps in a `publish` workflow job, using
`actions/attest-build-provenance@<pinned-sha>` once per pushed artifact (each image candidate, each
evidence-set, each marker) — this can only run for real inside a live GitHub Actions job with a real
OIDC token, so it is workflow YAML, not a locally-testable script. Verification-side: `attest-verify.py`,
a thin wrapper around `gh attestation verify` — delegates ALL identity matching to `gh`'s own
`--repo`/`--signer-workflow`/`--predicate-type`/`--source-digest` enforcement flags rather than parsing
`gh`'s JSON output for those fields, because a real signed sample to nail down the exact JSON field
paths was not obtainable in this session (multiple public artifacts checked, none had attestations
retrievable with the credentials available here — documented in Task 2 below, not glossed over). Exit
code 0 with all four enforcement flags passed is treated as proof all four facts hold; this is `gh`'s own
job to get right, this module's job is only to invoke it correctly and translate exit code into the
schema's boolean/string shape.

**Tech Stack:** GitHub Actions YAML (`actions/attest-build-provenance`), Python 3.10+ wrapping `gh
attestation verify` via `subprocess`.

## Global Constraints

- **Cannot be fully tested locally.** Attestation creation requires a live GitHub Actions OIDC token
  (`permissions: id-token: write`) that does not exist outside a real Actions run — confirmed by design
  doc §7b, not assumed. This plan's Task 1 (workflow YAML) has no local test; it is verified by reading
  GitHub's own documented `actions/attest-build-provenance` interface and by construction (pinned to a
  specific commit SHA, matching this repo's existing convention for every other third-party action in
  `.github/workflows/ci.yml`).
- Task 2 (`attest-verify.py`) genuinely could not be tested against a real signed artifact in this
  session: `gh attestation verify` was tried against several plausible public candidates
  (`checksums.txt` from `cli/cli`'s own release, `cosign`'s release checksums, `oci://ghcr.io/github/checkout`,
  `actions/attest-build-provenance`'s own source tarball) and every one either had no attestations
  retrievable or the local `gh` token (scopes: `gist, read:org, repo, workflow` — no `packages`) was
  denied access to the OCI registry. This is stated plainly rather than worked around by fabricating a
  fixture that merely looks like real `gh` output — see Task 2's own note on this.
- `gh attestation verify`'s enforcement flags this plan relies on:
  `--repo <owner>/<repo>` (matches `expected.sourceRepository`), `--signer-workflow
  <host/owner/repo/path/to/workflow>` (matches `expected.signerWorkflow`), `--predicate-type <uri>`
  (matches the per-kind `PREDICATE_TYPES` value), `--source-digest <sha1>` (the closest documented flag
  to `sourceRevision`'s meaning — "the digest associated with the source repository" in GitHub's own
  SLSA provenance terminology is the commit the build ran from; this mapping is stated as the plan's own
  best-available reading of the documented flag, to be confirmed the first time this runs against a real
  attestation in CI, not asserted as already proven).
- If `gh attestation verify` exits non-zero because no attestation exists at all (distinguishable from a
  verification failure by its stderr text, `"no attestations found"`), the observer must report this as
  `absent`, not `error` — matching `observation.schema.json`'s `attestationAbsent`/`error` split
  elsewhere in the contract (an artifact nobody signed yet is a different fact than a lookup that
  couldn't get an answer).

---

## File Structure

- Modify: `.github/workflows/ci.yml` — add attestation-creation steps to the (not-yet-existing) publish
  job. Since no `publish` job exists yet in this workflow (it is added by a later orchestration task, not
  in this plan), this task adds a **documented, ready-to-use step template** as a comment block plus a
  small standalone reusable composite step definition, rather than wiring it into a job that does not
  exist — wiring happens when the orchestration task creates the `publish` job itself.
- Create: `.github/scripts/attest-verify.py` — `verify_attestation`.
- Create: `.github/scripts/attest-verify.test.py` — exercises the code paths that ARE locally testable
  (an artifact with genuinely zero attestations, which is trivially reproducible — any freshly-created
  file has none), and documents clearly which paths are NOT locally testable.

## Interfaces

- `verify_attestation(artifact_ref: str, expected_repo: str, expected_signer_workflow: str,
  expected_predicate_type: str, expected_source_digest: str) -> dict` — returns a dict matching
  `presentAttestation`'s shape minus `queriedRef`/`subjectDigest`/`normalizedPredicate` (the caller,
  a later observer task, fills those in — `queriedRef` is the caller's own tag/ref choice,
  `subjectDigest` is already known to the caller before calling this, and `normalizedPredicate` needs
  the predicate body this module does not parse, per the constraint above): `{"attestationVerified":
  bool, "signerRepository": str, "signerWorkflow": str, "sourceRevision": str}`. Returns
  `attestationVerified: False` (not an exception) when `gh` reports "no attestations found" — this is a
  normal, expected outcome for an unsigned artifact, not a failure of this module. Raises
  `AttestationCheckError` for any other `gh` failure (network error, malformed ref, `gh` not
  authenticated) — a caller must be able to distinguish "verified false" from "the check itself broke."

---

### Task 1: CI workflow template for attestation creation

**Files:**
- Modify: `.github/workflows/ci.yml` (adds a documented step template near the top, in a comment block
  — not wired into a running job, since the `publish` job this belongs in does not exist yet).

- [ ] **Step 1: Add the documented template**

Insert near the top of `.github/workflows/ci.yml`, right after the existing `permissions:` block
(currently lines 11-14):

```yaml
# --- Attestation creation template, for the publish job a later commit adds ---
#
# publish-decision.sh (already merged, CI-verified) hard-requires verification.attestationVerified:
# true for both the marker and every evidence report -- there is no path around it (see design doc
# 2026-08-11-collector-publish-job-design.md section 7b). Each artifact this pipeline pushes
# (candidate images, both evidence-sets, prepared/final markers) needs its own real signed attestation
# via actions/attest-build-provenance, which needs id-token/attestations write permission ON THE JOB
# THAT CREATES IT, not at the workflow level (least-privilege, same rule this file's own top comment
# already states for packages: write).
#
# publish:
#   needs: [backend, frontend, lint]
#   if: github.ref == 'refs/heads/main' && github.event_name == 'push'
#   permissions:
#     contents: read
#     packages: write
#     id-token: write
#     attestations: write
#   steps:
#     - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
#     # ... build/push steps that produce each artifact's real digest ...
#     - name: Attest the monolith candidate image
#       uses: actions/attest-build-provenance@<pin-to-a-real-commit-sha-when-wiring-this-in>
#       with:
#         subject-name: ghcr.io/trhlow/tvu-event-ticket/monolith
#         subject-digest: ${{ steps.push-monolith-candidate.outputs.digest }}
#         push-to-registry: true
#     # ... repeat once per artifact: frontend candidate, monolith evidence-set, frontend evidence-set,
#     #     prepared marker (final marker gets its own attestation only after COMPLETE, in the same
#     #     step that promotes tags) ...
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "docs(ci): template the attestation-creation steps the publish job will need"
```

---

### Task 2: `attest-verify.py` — verify a real attestation

**Files:**
- Create: `.github/scripts/attest-verify.py`
- Test: `.github/scripts/attest-verify.test.py`

**Interfaces:**
- Consumes: the `gh` CLI (already authenticated on this machine via `gh auth login`, confirmed working
  for `gh attestation verify`'s help/error paths during design).
- Produces: `verify_attestation`, `AttestationCheckError`, importable by a later observer task.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python attest-verify.test.py`
Expected: fails in the `importlib` load (`attest-verify.py` does not exist yet).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/attest-verify.py
"""Verifies a real GitHub build-provenance attestation via `gh attestation verify`.

Delegates ALL identity matching to gh's own enforcement flags (--repo, --signer-workflow,
--predicate-type, --source-digest) rather than parsing gh's JSON output for those fields -- no real
signed sample was obtainable in this session to confirm the exact JSON field paths (design doc section
7b / this plan's Global Constraints record what was tried). A 0 exit code with all four flags passed is
gh's own proof all four facts hold; this module's job is only to invoke it correctly and translate the
result into the shape observation.schema.json's presentAttestation needs, not to re-derive what gh
already checked.
"""
import subprocess

__all__ = ["verify_attestation", "AttestationCheckError"]


class AttestationCheckError(Exception):
    pass


def verify_attestation(artifact_ref: str, expected_repo: str, expected_signer_workflow: str,
                        expected_predicate_type: str, expected_source_digest: str) -> dict:
    try:
        proc = subprocess.run(
            ["gh", "attestation", "verify", artifact_ref,
             "--repo", expected_repo,
             "--signer-workflow", expected_signer_workflow,
             "--predicate-type", expected_predicate_type,
             "--source-digest", expected_source_digest,
             "--format", "json"],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise AttestationCheckError(f"gh is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise AttestationCheckError(f"gh attestation verify timed out for {artifact_ref}") from exc

    if proc.returncode == 0:
        return {
            "attestationVerified": True,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "sourceRevision": expected_source_digest,
        }

    stderr = proc.stderr.strip()
    if "no attestations found" in stderr.lower() or "404" in stderr:
        return {
            "attestationVerified": False,
            "signerRepository": expected_repo,
            "signerWorkflow": expected_signer_workflow,
            "sourceRevision": expected_source_digest,
        }

    raise AttestationCheckError(
        f"gh attestation verify exited {proc.returncode} for {artifact_ref}: {stderr[:2000]}"
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python attest-verify.test.py`
Expected: `passed=3 failed=0`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/attest-verify.py .github/scripts/attest-verify.test.py
git commit -m "feat(ci): verify real attestations via gh attestation verify"
```

---

## Explicitly out of scope for this plan

- Wiring the CI template from Task 1 into a real running `publish` job — happens when the observer/
  orchestration task creates that job.
- Confirming `--source-digest`'s exact semantics against a real signed artifact from THIS repo, and
  confirming `verify_attestation`'s `attestationVerified: True` branch against a real signature at all
  — both need a live CI run to exercise for the first time, the same category of gap already accepted
  for `oci-push.py`'s bearer-auth path.
- `normalizedPredicate` construction (the caller's job, once it has the verified predicate body — this
  plan's `verify_attestation` deliberately does not parse or return the predicate body).

## Self-Review Notes

- Spec coverage: design doc §7b's whole finding (attestation is mandatory, not optional) is what this
  plan exists to close.
- Placeholder scan: no TBD/TODO. The untested branches are stated as explicit, real gaps with a named
  reason (no real signed sample obtainable) and a named remediation (confirm on first real CI run) —
  not silently glossed over.
- Type consistency: `verify_attestation`'s return shape (`attestationVerified`, `signerRepository`,
  `signerWorkflow`, `sourceRevision`) matches exactly the subset of `presentAttestation`'s required keys
  this module is responsible for, as stated in Interfaces above.
