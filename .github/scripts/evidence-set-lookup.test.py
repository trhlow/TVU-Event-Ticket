"""Exercises read_evidence_set_lookup against a real evidence-set pushed by the already-merged
evidence-set-envelope.py, composing every reader built in roadmap 1.4/1.5 into the full
presentEvidenceSet shape."""
import importlib.util
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent

# The throwaway registry, with the setup guards all ten of these files used to skip.
sys.path.insert(0, str(HERE))
import registry_fixture  # noqa: E402
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
IGNORE_FILE = HERE / "collector-fixtures" / "vulnerability-ignore.yaml"


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence_set_lookup_mod = _load("evidence-set-lookup")
read_evidence_set_lookup = evidence_set_lookup_mod.read_evidence_set_lookup

evidence_set_envelope_mod = _load("evidence-set-envelope")
collect_sbom_mod = _load("collect-sbom")
collect_vuln_mod = _load("collect-vulnerability-scan")
collect_secret_mod = _load("collect-secret-scan")
local_registry_mod = _load("local-registry")

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


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


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run slice 1 Task 1 first)", False, f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

sbom_result = collect_sbom_mod.collect_sbom(str(TARBALL), "tvu-collector-test:tiny")
vuln_document = collect_vuln_mod.collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                              str(IGNORE_FILE))
layer_document = collect_secret_mod.collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                str(RULESET))
fs_document = collect_secret_mod.collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                                                   str(RULESET))
evidence_documents = {
    "sbom": sbom_result["document"], "vulnerabilityScan": vuln_document,
    "layerSecretScan": layer_document, "filesystemSecretScan": fs_document,
}

container_id = None
try:
    container_id, host_port = registry_fixture.start_local_registry()

    registry_ref = f"localhost:{host_port}/evidence-set-lookup-test"

    with local_registry_mod.local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as subject_ref:
        digest_proc = subprocess.run(["crane", "digest", "--full-ref", subject_ref],
                                      capture_output=True, text=True, timeout=30, check=False)
        manifest_proc = subprocess.run(["crane", "manifest", subject_ref],
                                        capture_output=True, text=True, timeout=30, check=False)
    subject_digest = digest_proc.stdout.strip().rsplit("@", 1)[-1]
    subject_size = len(manifest_proc.stdout.encode("utf-8"))

    evidence_set_envelope_mod.publish_evidence_set(registry_ref, "evidence-monolith-sha-testcommit",
                                                     evidence_documents, subject_digest, subject_size)

    SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567"

    result = read_evidence_set_lookup(
        registry_ref, "evidence-monolith-sha-testcommit", subject_digest,
        source_revision=SOURCE_REVISION,
        expected_source_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
    )

    report("result is present with the real carrierDigest",
           result.get("status") == "present" and isinstance(result.get("carrierDigest"), str)
           and result["carrierDigest"].startswith("sha256:"),
           f"status/carrierDigest: {result.get('status')!r}, {result.get('carrierDigest')!r}")

    report("subjectMatches is true (the carrier's own subject really is this image)",
           result.get("subjectMatches") is True, f"subjectMatches={result.get('subjectMatches')!r}")

    report("layersValid is true (exactly 4 layers, 4 required mediaTypes, no dupes)",
           result.get("layersValid") is True, f"layersValid={result.get('layersValid')!r}")

    report("verification.attestationVerified is False (no real signature on this test push) and "
           "policyPassed mirrors it",
           result.get("verification", {}).get("attestationVerified") is False
           and result.get("verification", {}).get("policyPassed") is False,
           f"verification={result.get('verification')!r}")

    report("reports has all 4 kinds, each a {reportLookup, attestationLookup} pair",
           set(result.get("reports", {}).keys())
           == {"sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"}
           and all({"reportLookup", "attestationLookup"} <= set(pair.keys())
                    for pair in result.get("reports", {}).values()),
           f"reports keys: {list(result.get('reports', {}).keys())}")

    schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
    present_schema = schema["$defs"]["presentEvidenceSet"]
    full_schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "allOf": [present_schema],
                   "$defs": schema["$defs"]}
    registry = build_registry()
    validator = jsonschema.Draft202012Validator(full_schema, registry=registry)
    errors = sorted(validator.iter_errors(result), key=str)
    report("the whole result validates against presentEvidenceSet exactly",
           not errors, "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:8]))

    absent_result = read_evidence_set_lookup(
        registry_ref, "this-tag-was-never-pushed", subject_digest,
        source_revision=SOURCE_REVISION,
        expected_source_repo="trhlow/TVU-Event-Ticket",
        expected_signer_workflow="trhlow/TVU-Event-Ticket/.github/workflows/ci.yml@refs/heads/main",
    )
    report("a missing evidence-set tag reports absent",
           absent_result.get("status") == "absent", f"absent_result={absent_result!r}")
finally:
    registry_fixture.stop_local_registry(container_id)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
