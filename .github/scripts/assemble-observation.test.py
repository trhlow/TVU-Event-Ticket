# .github/scripts/assemble-observation.test.py
"""Exercises assemble_observation end to end: pushes real tags, a real marker, and real evidence-sets
for both images into one throwaway registry (repos monolith/frontend/release at different paths within
the same registry, mirroring the real 3-repository layout), then asserts the FULL resulting observation
validates against observation.schema.json itself -- the top-level integration test for everything
Phase 1 + 2.1/2.2 built tonight."""
import importlib.util
import json
import os
import pathlib
import subprocess
import sys

BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

HERE = pathlib.Path(__file__).resolve().parent

# The throwaway registry, with the setup guards all ten of these files used to skip.
sys.path.insert(0, str(HERE))
import registry_fixture  # noqa: E402
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
IGNORE_FILE = HERE / "collector-fixtures" / "vulnerability-ignore.yaml"
REPO_ROOT = HERE.parent.parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assemble_observation_mod = _load("assemble-observation")
assemble_observation = assemble_observation_mod.assemble_observation

marker_envelope_mod = _load("marker-envelope")
evidence_set_envelope_mod = _load("evidence-set-envelope")
envelope_mod = _load("envelope")
collect_sbom_mod = _load("collect-sbom")
collect_vuln_mod = _load("collect-vulnerability-scan")
collect_secret_mod = _load("collect-secret-scan")

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)


def build_registry():
    contracts_dir = HERE.parent / "contracts"
    resources = {}
    for path in sorted(contracts_dir.rglob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        schema_id = contents.get("$id")
        if isinstance(schema_id, str) and schema_id:
            resources[schema_id] = referencing.Resource.from_contents(
                contents, default_specification=referencing.jsonschema.DRAFT202012)
    return referencing.Registry().with_resources(resources.items())

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run slice 1 Task 1 first)", False, f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

SOURCE_REPO = "trhlow/TVU-Event-Ticket"
WORKFLOW = ".github/workflows/ci.yml"
COMMIT = "0123456789abcdef0123456789abcdef01234567"
ENVIRONMENT = "production"

container_id = None
try:
    container_id, host_port = registry_fixture.start_local_registry()

    monolith_ref = f"localhost:{host_port}/monolith"
    frontend_ref = f"localhost:{host_port}/frontend"
    release_ref = f"localhost:{host_port}/release"

    # Push the monolith and frontend images (both from the same tiny fixture, for simplicity -- this
    # test only proves the assembly wiring, not that two different images were built).
    monolith_image = f"{monolith_ref}:monolith-{COMMIT}"
    frontend_image = f"{frontend_ref}:frontend-{COMMIT}"
    subprocess.run(["crane", "push", str(TARBALL), monolith_image], capture_output=True, text=True,
                    timeout=60, check=True)
    subprocess.run(["crane", "push", str(TARBALL), frontend_image], capture_output=True, text=True,
                    timeout=60, check=True)
    monolith_digest_proc = subprocess.run(["crane", "digest", monolith_image], capture_output=True,
                                           text=True, timeout=30, check=True)
    monolith_digest = monolith_digest_proc.stdout.strip()
    monolith_manifest_proc = subprocess.run(["crane", "manifest", monolith_image], capture_output=True,
                                             text=True, timeout=30, check=True)
    monolith_size = len(monolith_manifest_proc.stdout.encode("utf-8"))
    frontend_digest_proc = subprocess.run(["crane", "digest", frontend_image], capture_output=True,
                                           text=True, timeout=30, check=True)
    frontend_digest = frontend_digest_proc.stdout.strip()

    # Candidate tags (same digest, different tag -- a real publish job promotes candidate -> final tag
    # only after COMPLETE; this test just needs both tags to exist).
    subprocess.run(["crane", "tag", monolith_image, f"candidate-monolith-{COMMIT}"],
                    capture_output=True, text=True, timeout=30, check=True)
    subprocess.run(["crane", "tag", frontend_image, f"candidate-frontend-{COMMIT}"],
                    capture_output=True, text=True, timeout=30, check=True)

    # Evidence sets for both images, from real collector output.
    sbom_result = collect_sbom_mod.collect_sbom(str(TARBALL), "tvu-collector-test:tiny")
    vuln_document = collect_vuln_mod.collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                  str(IGNORE_FILE))
    layer_document = collect_secret_mod.collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                     str(RULESET))
    fs_document = collect_secret_mod.collect_filesystem_secret_scan(str(TARBALL),
                                                                       "tvu-collector-test:tiny",
                                                                       str(RULESET))
    evidence_documents = {
        "sbom": sbom_result["document"], "vulnerabilityScan": vuln_document,
        "layerSecretScan": layer_document, "filesystemSecretScan": fs_document,
    }
    evidence_set_envelope_mod.publish_evidence_set(monolith_ref, f"evidence-monolith-sha-{COMMIT}",
                                                     evidence_documents, monolith_digest, monolith_size)
    evidence_set_envelope_mod.publish_evidence_set(frontend_ref, f"evidence-frontend-sha-{COMMIT}",
                                                     evidence_documents, frontend_digest, monolith_size)

    # A prepared marker (content shaped closely enough to exercise the assembly, matching
    # marker-lookup.test.py's own established fixture-content pattern).
    marker_content = {
        "commit": COMMIT, "environment": ENVIRONMENT,
        "frontendConfigFingerprint": "a" * 64,
        "images": {"monolith": monolith_digest, "frontend": frontend_digest},
        "provenance": {
            "monolith": {"revision": COMMIT, "subjectDigest": monolith_digest},
            "frontend": {"revision": COMMIT, "subjectDigest": frontend_digest},
        },
        "evidence": {
            "sbom": {"monolith": {"digest": "sha256:" + "3" * 64, "subjectDigest": monolith_digest,
                                   "predicateType": "https://spdx.dev/Document/v2.3",
                                   "documentValidated": True, "packageCount": 1},
                     "frontend": {"digest": "sha256:" + "4" * 64, "subjectDigest": frontend_digest,
                                  "predicateType": "https://spdx.dev/Document/v2.3",
                                  "documentValidated": True, "packageCount": 1}},
            "vulnerabilityScan": {
                "monolith": {"digest": "sha256:" + "5" * 64, "subjectDigest": monolith_digest,
                             "predicateType": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
                             "passed": True},
                "frontend": {"digest": "sha256:" + "6" * 64, "subjectDigest": frontend_digest,
                             "predicateType": "https://evts.id.vn/attestations/vulnerabilityScan/v1",
                             "passed": True}},
            "layerSecretScan": {
                "monolith": {"digest": "sha256:" + "7" * 64, "subjectDigest": monolith_digest,
                             "predicateType": "https://evts.id.vn/attestations/layerSecretScan/v1",
                             "passed": True},
                "frontend": {"digest": "sha256:" + "8" * 64, "subjectDigest": frontend_digest,
                             "predicateType": "https://evts.id.vn/attestations/layerSecretScan/v1",
                             "passed": True}},
            "filesystemSecretScan": {
                "monolith": {"digest": "sha256:" + "9" * 64, "subjectDigest": monolith_digest,
                             "predicateType": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
                             "passed": True},
                "frontend": {"digest": "sha256:" + "a" * 64, "subjectDigest": frontend_digest,
                             "predicateType": "https://evts.id.vn/attestations/filesystemSecretScan/v1",
                             "passed": True}},
            "evidenceSetDigest": {"monolith": "sha256:" + "b" * 64, "frontend": "sha256:" + "c" * 64},
        },
        "flywayInventory": {
            "boundTo": monolith_digest, "checksum": "d" * 64,
            "migrations": [{"installedRank": 1, "version": "1", "type": "SQL",
                             "script": "V1__init.sql", "checksum": 12345, "success": True}],
        },
    }
    marker_envelope_mod.publish_marker(release_ref, f"prepared-{COMMIT}", marker_content)

    observation = assemble_observation(
        monolith_ref, frontend_ref, release_ref, COMMIT, ENVIRONMENT, str(REPO_ROOT), bash=BASH,
    )

    report("observation has schemaVersion 1 and the real commit",
           observation.get("schemaVersion") == 1 and observation.get("commit") == COMMIT,
           f"schemaVersion/commit: {observation.get('schemaVersion')!r}, {observation.get('commit')!r}")

    report("all 10 lookups are present in the assembled observation",
           set(observation.get("lookups", {}).keys()) == {
               "finalMarker", "preparedMarker", "monolithTag", "frontendTag",
               "monolithDigestObject", "frontendDigestObject", "monolithCandidate",
               "frontendCandidate", "monolithEvidenceSet", "frontendEvidenceSet",
           },
           f"lookup keys: {sorted(observation.get('lookups', {}).keys())}")

    report("monolithTag is present with the real pushed digest",
           observation["lookups"]["monolithTag"].get("status") == "present"
           and observation["lookups"]["monolithTag"].get("digest") == monolith_digest,
           f"monolithTag={observation['lookups']['monolithTag']!r}")

    report("monolithDigestObject re-resolved the same digest independently",
           observation["lookups"]["monolithDigestObject"].get("status") == "present"
           and observation["lookups"]["monolithDigestObject"].get("digest") == monolith_digest,
           f"monolithDigestObject={observation['lookups']['monolithDigestObject']!r}")

    report("finalMarker (never pushed in this test) is absent, not an error",
           observation["lookups"]["finalMarker"].get("status") == "absent",
           f"finalMarker={observation['lookups']['finalMarker']!r}")

    report("preparedMarker is present with real content matching what was pushed",
           observation["lookups"]["preparedMarker"].get("status") == "present"
           and observation["lookups"]["preparedMarker"].get("content") == marker_content,
           f"preparedMarker status: {observation['lookups']['preparedMarker'].get('status')!r}")

    # Everything above runs against a PROMOTED state -- monolith-<commit> was pushed, so the tag and
    # the marker's claim agree and a digest-object lookup derived from either one looks identical.
    # publish-finalize never runs in that state on a first publish: it decides whether promotion is
    # safe, so the tag is legitimately absent and the only thing claiming a digest is the marker.
    # .github/contracts/fixtures/valid/prepared-only.json states what must be observed there --
    # monolithTag absent, monolithDigestObject PRESENT at the digest preparedMarker.content.images
    # claims -- and nothing exercised it until a real GHCR run produced "the marker records monolith
    # sha256:c8cd27f9... but its digest object lookup was skipped as having no claimed digest".
    #
    # A tag-derived lookup also cannot fail: re-resolving the digest a present tag just returned
    # proves nothing about the marker's claim, which is the whole question the decision asks here
    # ("a release whose bytes are gone is not complete just because a document says so").
    PRE_PROMOTION_COMMIT = "1234567890abcdef1234567890abcdef12345678"
    pre_promotion_content = {**marker_content, "commit": PRE_PROMOTION_COMMIT}
    marker_envelope_mod.publish_marker(release_ref, f"prepared-{PRE_PROMOTION_COMMIT}",
                                        pre_promotion_content)
    pre_promotion = assemble_observation(
        monolith_ref, frontend_ref, release_ref, PRE_PROMOTION_COMMIT, ENVIRONMENT, str(REPO_ROOT),
        bash=BASH,
    )

    report("pre-promotion: the release tag really is absent (so this case is the real one, not a "
           "repeat of the promoted case above)",
           pre_promotion["lookups"]["monolithTag"].get("status") == "absent",
           f"monolithTag={pre_promotion['lookups']['monolithTag']!r}")

    report("pre-promotion: monolithDigestObject resolves the digest the MARKER claims, even though "
           "no tag points at it yet",
           pre_promotion["lookups"]["monolithDigestObject"].get("status") == "present"
           and pre_promotion["lookups"]["monolithDigestObject"].get("digest") == monolith_digest,
           f"monolithDigestObject={pre_promotion['lookups']['monolithDigestObject']!r}")

    report("pre-promotion: frontendDigestObject likewise",
           pre_promotion["lookups"]["frontendDigestObject"].get("status") == "present"
           and pre_promotion["lookups"]["frontendDigestObject"].get("digest") == frontend_digest,
           f"frontendDigestObject={pre_promotion['lookups']['frontendDigestObject']!r}")

    # The opposite direction, so the fix above cannot be "always look something up". With no marker
    # there is no claimed digest, and skipped is the honest answer -- the question was never asked.
    # valid/nothing-published.json records exactly this pairing, and the decision relies on it to
    # tell a clean slate from an unexplained object.
    CLEAN_SLATE_COMMIT = "89abcdef0123456789abcdef0123456789abcdef"
    clean_slate = assemble_observation(
        monolith_ref, frontend_ref, release_ref, CLEAN_SLATE_COMMIT, ENVIRONMENT, str(REPO_ROOT),
        bash=BASH,
    )
    report("clean slate: with no marker claiming anything, the digest-object lookup is skipped, not "
           "invented",
           clean_slate["lookups"]["monolithDigestObject"].get("status") == "skipped"
           and clean_slate["lookups"]["monolithDigestObject"].get("queriedRef") is None,
           f"monolithDigestObject={clean_slate['lookups']['monolithDigestObject']!r}")

    schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
    registry = build_registry()
    validator = jsonschema.Draft202012Validator(schema, registry=registry)
    errors = sorted(validator.iter_errors(observation), key=str)
    report("the ENTIRE assembled observation validates against observation.schema.json",
           not errors, "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:10]))
finally:
    registry_fixture.stop_local_registry(container_id)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
