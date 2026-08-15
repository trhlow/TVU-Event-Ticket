# .github/scripts/run-publish.test.py
"""Exercises run_publish end to end against a throwaway registry: real candidate pushes, real
collectors (syft/trivy/a real Postgres Flyway run for the monolith image), a real prepared marker, a
real publish-decision.sh call, real tag promotion, and a real final decision -- the entire design doc
section 4 loop, no mocks. Uses the real monolith-test-image.tar fixture (not the tiny generic one) so
collect_flyway_inventory has real Flyway migrations to read; frontend reuses the tiny fixture, matching
every other test this session that never needed a real frontend image to exercise the OCI plumbing.
"""
import hashlib
import importlib.util
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

HERE = pathlib.Path(__file__).resolve().parent
MONOLITH_TARBALL = HERE / "collector-fixtures" / "monolith-test-image.tar"
FRONTEND_TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
IGNORE_FILE = HERE / "collector-fixtures" / "vulnerability-ignore.yaml"
REPO_ROOT = HERE.parent.parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


run_publish_mod = _load("run-publish")
run_publish = run_publish_mod.run_publish

_canonical = _load("canonical")

DECISION_SCRIPT = HERE / "publish-decision.sh"


def _call_publish_decision_in_process(observation, bash=None):
    """A real observation from real collectors can exceed a Windows dev machine's ~32KB CreateProcess
    command-line limit -- publish-decision.sh always argv-passes the observation to its embedded
    python (`"$PYTHON" - "$script_dir" "$observation" <<'PYTHON'`), regardless of caller, which is not
    something to work around by touching that frozen, CI-verified script. Real GitHub Actions Linux
    runners have a ~2MB ARG_MAX and never hit this -- this in-process exec exists only so this test can
    verify the exact same decision logic on this machine without crossing an OS process boundary.
    Mirrors manifest-agreement.test.sh's own established technique for exercising this same heredoc
    in-process (there, only its ENVELOPE_CONSTANTS preamble; here, the whole thing).
    """
    text = DECISION_SCRIPT.read_text(encoding="utf-8")
    opener = "<<'PYTHON'\n"
    start = text.find(opener)
    end = text.find("\nPYTHON\n", start + len(opener))
    if start < 0 or end < 0:
        raise AssertionError("publish-decision.sh no longer carries a PYTHON heredoc")
    program = text[start + len(opener):end]

    observation_text = _canonical.canonical_bytes(observation).decode("utf-8")
    namespace = {"__name__": "publish_decision_program"}
    saved_argv = sys.argv
    sys.argv = [str(DECISION_SCRIPT), str(HERE), observation_text]
    try:
        exec(compile(program, str(DECISION_SCRIPT), "exec"), namespace)  # noqa: S102
    finally:
        sys.argv = saved_argv
    return namespace["result"]


passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


for path in (MONOLITH_TARBALL, FRONTEND_TARBALL, RULESET, IGNORE_FILE):
    if not path.exists():
        report(f"{path.name} exists", False, f"{path} is missing")
if failed:
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

COMMIT = "fedcba9876543210fedcba9876543210fedcba98"
ENVIRONMENT = "production"

container_id = None
try:
    run_proc = subprocess.run(
        ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", "registry:2"],
        capture_output=True, text=True, timeout=60, check=False,
    )
    container_id = run_proc.stdout.strip()
    if run_proc.returncode != 0 or not container_id:
        # A stopped Docker daemon used to surface here as `IndexError: list index out of range` two
        # lines down -- an unreadable way to say "this suite never ran". Say what actually happened.
        raise SystemExit(
            "the throwaway registry could not be started, so NOTHING in this suite ran (this is not a "
            f"test failure -- no test was executed): docker exited {run_proc.returncode}: "
            f"{run_proc.stderr.strip()[:500]}"
        )
    port_proc = subprocess.run(["docker", "port", container_id, "5000/tcp"],
                                capture_output=True, text=True, timeout=30, check=False)
    port_lines = port_proc.stdout.strip().splitlines()
    if not port_lines:
        raise SystemExit(
            f"registry container {container_id[:12]} published no host port for 5000/tcp, so nothing "
            f"in this suite ran: {port_proc.stderr.strip()[:500]}"
        )
    host_port = port_lines[0].rsplit(":", 1)[1]

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    break
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)

    monolith_ref = f"localhost:{host_port}/test/monolith"
    frontend_ref = f"localhost:{host_port}/test/frontend"
    release_ref = f"localhost:{host_port}/test/release"
    expected_override = {
        "registry": f"localhost:{host_port}",
        "repositories": {"release": "test/release", "monolith": "test/monolith",
                          "frontend": "test/frontend"},
    }

    result = run_publish(
        str(MONOLITH_TARBALL), str(FRONTEND_TARBALL), monolith_ref, frontend_ref, release_ref,
        COMMIT, ENVIRONMENT, str(REPO_ROOT), str(RULESET), str(IGNORE_FILE), bash=BASH,
        expected_override=expected_override,
        call_publish_decision_fn=_call_publish_decision_in_process,
    )

    # No real GitHub attestation signing is possible in a local test (actions/attest-build-provenance
    # only works inside real GitHub Actions with OIDC, roadmap Phase 3) -- every marker/evidence-set
    # this run pushes is therefore correctly and safely unverified, and the decision must refuse to
    # promote or finalize anything on that basis. published True can only be proven once Phase 3 wires
    # real signing into CI; what this test proves instead is that the orchestration mechanically does
    # every real step correctly (candidate push, evidence-set push, prepared marker, real decision call)
    # and stops safely -- never falsely claiming success -- exactly as design doc section 4 step 8 says.
    decision = result.get("decision", {})
    report("the run correctly refuses to publish (no real attestation signing exists locally)",
           result.get("published") is False and decision.get("state") == "CONFLICT",
           f"result={ {k: v for k, v in result.items() if k != 'observation'} !r}")

    reason = decision.get("reason", "")
    report("the only reason is unverified attestations -- not a policy-recompute mismatch or a "
           "subject-binding mismatch (both would indicate a real bug elsewhere in this run)",
           "attestationVerified is False" in reason
           and "recomputes to" not in reason
           and "subjectMatches is False" not in reason,
           f"reason={reason!r}")

    subjects = result.get("subjects", [])
    report("push_publish_artifacts emits exactly the 11 real attestation subjects this run needs "
           "(8 per-kind reports + 2 evidence-set carriers + 1 marker)",
           len(subjects) == 11
           and sum(1 for s in subjects if s["kind"] == "generic") == 10
           and sum(1 for s in subjects if s["kind"] == "provenance") == 1
           and all(isinstance(s["digest"], str) and s["digest"].startswith("sha256:") for s in subjects),
           f"subjects={[{'name': s['name'], 'kind': s['kind']} for s in subjects]!r}")
    report("the marker subject carries no predicate (actions/attest-build-provenance supplies its own)",
           next(s for s in subjects if s["name"] == "release-marker")["predicate"] is None,
           f"marker subject={next(s for s in subjects if s['name'] == 'release-marker')!r}")
    report("the sbom subject's predicate is the SPDX document itself, unmodified",
           next(s for s in subjects if s["name"] == "monolith-sbom-report")["predicateType"]
           == "https://spdx.dev/Document/v2.3",
           f"sbom subject predicateType={next(s for s in subjects if s['name'] == 'monolith-sbom-report')['predicateType']!r}")

    # A scan predicate is the report document with EXACTLY ONE field changed: reportDigest, which on
    # the signed side must name the report layer as stored (spec section 8/10 -- "read only from the
    # attestation side and compared against the report's own descriptor digest"). The document's own
    # reportDigest is necessarily the digest of itself-without-that-field, so the two differ by
    # construction, and publish-decision.sh's binding check failed on every real run until this
    # distinction existed. Asserting "one field, that field, and nothing else" is what stops the fix
    # from silently becoming "the predicate drifted from the report".
    for image, kind in (("monolith", "vulnerabilityScan"), ("frontend", "layerSecretScan")):
        subj = next(s for s in subjects if s["name"] == f"{image}-{kind}-report")
        pred = subj["predicate"]
        # The value the collector puts INSIDE the document: the digest of the document without its
        # own reportDigest. If the signed predicate still carried this, the decision's binding check
        # would fail exactly as it did on the real run -- so this is the value it must NOT be.
        self_excluding = "sha256:" + hashlib.sha256(_canonical.canonical_bytes(
            {k: v for k, v in pred.items() if k != "reportDigest"})).hexdigest()
        # Putting that value back reconstructs the report EXACTLY as the evidence set stored it, so its
        # canonical digest is the layer descriptor digest -- derived here, not copied from the producer.
        # Equality therefore proves both halves at once: the predicate names the stored blob, and it
        # differs from that blob in this one field only (any other drift changes these bytes too).
        stored_document = {**pred, "reportDigest": self_excluding}
        stored_digest = "sha256:" + hashlib.sha256(
            _canonical.canonical_bytes(stored_document)).hexdigest()
        report(f"{image}/{kind}: the signed predicate's reportDigest is the stored report blob's own "
               f"descriptor digest, and that one field is the only difference between them",
               pred.get("reportDigest") == stored_digest,
               f"predicate reportDigest={pred.get('reportDigest')!r} "
               f"stored blob digest={stored_digest!r} self_excluding={self_excluding!r}")
    report("every subject's subjectName is a real registry/repo reference, not the descriptive name "
           "(actions/attest's push-to-registry requires a valid OCI image reference -- a real CI run "
           "against GHCR rejected a descriptive label like 'release-marker' with "
           "'Invalid image name')",
           all(s["subjectName"] in (monolith_ref, frontend_ref, release_ref) for s in subjects),
           f"subjectNames={[s['subjectName'] for s in subjects]!r}")

    # Every attestation subject must be a real MANIFEST in the registry, never a layer blob: a report
    # is a blob inside its evidence-set carrier, so attesting it at its own digest fails with a real
    # 404 from the registry (confirmed 2026-08-12). Each of an image's 4 report subjects therefore
    # shares that image's evidence-set carrier digest -- exactly what evidence-set-attestation.py
    # already verifies against (oci://registry:evidence-set-tag, distinguished by predicateType).
    for image, image_ref in (("monolith", monolith_ref), ("frontend", frontend_ref)):
        carrier = next(s for s in subjects if s["name"] == f"{image}-evidence-set")
        image_reports = [s for s in subjects if s["name"].startswith(f"{image}-")
                         and s["name"].endswith("-report")]
        report(f"all 4 {image} report subjects are attested against the evidence-set carrier's own "
               f"manifest digest, not their (unattestable) layer-blob digests",
               len(image_reports) == 4
               and all(s["digest"] == carrier["digest"] for s in image_reports),
               f"carrier={carrier['digest']!r} reports={[(s['name'], s['digest']) for s in image_reports]!r}")

    report("the two evidence-set carriers have genuinely different digests (so the shared-digest "
           "check above is not passing by coincidence)",
           next(s for s in subjects if s["name"] == "monolith-evidence-set")["digest"]
           != next(s for s in subjects if s["name"] == "frontend-evidence-set")["digest"],
           "both carriers reported the same digest")

    lookups = result.get("observation", {}).get("lookups", {})
    report("both evidence-sets' subject correctly matches the candidate digest they were pushed "
           "against (assemble-observation.py's *Tag-vs-*Candidate binding fix)",
           lookups.get("monolithEvidenceSet", {}).get("subjectMatches") is True
           and lookups.get("frontendEvidenceSet", {}).get("subjectMatches") is True,
           f"monolithEvidenceSet.subjectMatches={lookups.get('monolithEvidenceSet', {}).get('subjectMatches')!r} "
           f"frontendEvidenceSet.subjectMatches={lookups.get('frontendEvidenceSet', {}).get('subjectMatches')!r}")
    report("preparedMarker is present with real content (pushed successfully, just not yet trusted)",
           lookups.get("preparedMarker", {}).get("status") == "present",
           f"preparedMarker={lookups.get('preparedMarker')!r}")
    report("candidate objects are present at the real pushed digests",
           lookups.get("monolithCandidate", {}).get("status") == "present"
           and lookups.get("frontendCandidate", {}).get("status") == "present",
           f"monolithCandidate={lookups.get('monolithCandidate')!r} "
           f"frontendCandidate={lookups.get('frontendCandidate')!r}")

    # Re-running against the same commit must be safely repeatable -- still CONFLICT for the same
    # reason, never a crash and never an accidental promotion.
    second_result = run_publish(
        str(MONOLITH_TARBALL), str(FRONTEND_TARBALL), monolith_ref, frontend_ref, release_ref,
        COMMIT, ENVIRONMENT, str(REPO_ROOT), str(RULESET), str(IGNORE_FILE), bash=BASH,
        expected_override=expected_override,
        call_publish_decision_fn=_call_publish_decision_in_process,
    )
    report("re-running the same commit is safely repeatable (still refuses, same reason class)",
           second_result.get("published") is False
           and second_result.get("decision", {}).get("state") == "CONFLICT"
           and "attestationVerified is False" in second_result.get("decision", {}).get("reason", ""),
           f"second_result={ {k: v for k, v in second_result.items() if k != 'observation'} !r}")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
