"""Exercises read_evidence_set_report against a real evidence-set pushed by the already-merged
evidence-set-envelope.py, using the 4 real (now-unified) collector outputs -- not a fixture invented
for this test."""
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


evidence_set_report_mod = _load("evidence-set-report")
read_evidence_set_report = evidence_set_report_mod.read_evidence_set_report

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


def build_registry(schema_dir):
    resources = {}
    for path in sorted(schema_dir.rglob("*.schema.json")):
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
    "sbom": sbom_result["document"],
    "vulnerabilityScan": vuln_document,
    "layerSecretScan": layer_document,
    "filesystemSecretScan": fs_document,
}

container_id = None
try:
    container_id, host_port = registry_fixture.start_local_registry()

    registry_ref = f"localhost:{host_port}/evidence-set-report-test"

    with local_registry_mod.local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as subject_ref:
        digest_proc = subprocess.run(["crane", "digest", "--full-ref", subject_ref],
                                      capture_output=True, text=True, timeout=30, check=False)
        manifest_proc = subprocess.run(["crane", "manifest", subject_ref],
                                        capture_output=True, text=True, timeout=30, check=False)
    subject_digest = digest_proc.stdout.strip().rsplit("@", 1)[-1]
    subject_size = len(manifest_proc.stdout.encode("utf-8"))

    evidence_set_envelope_mod.publish_evidence_set(registry_ref, "evidence-monolith-sha-testcommit",
                                                     evidence_documents, subject_digest, subject_size)

    # --- SBOM kind ---
    sbom_report = read_evidence_set_report(registry_ref, "evidence-monolith-sha-testcommit", "sbom",
                                            subject_digest)
    report("sbom report is present with digestVerified/sizeVerified/schemaValid all true",
           sbom_report.get("status") == "present"
           and sbom_report.get("digestVerified") is True
           and sbom_report.get("sizeVerified") is True
           and sbom_report.get("schemaValid") is True,
           f"sbom_report={sbom_report!r}"[:500])

    sbom_defs_schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
    sbom_content_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "allOf": [sbom_defs_schema["$defs"]["sbomDocumentContent"]],
        "$defs": {"digest": sbom_defs_schema["$defs"]["digest"]},
    }
    sbom_validator = jsonschema.Draft202012Validator(sbom_content_schema)
    sbom_errors = sorted(sbom_validator.iter_errors(sbom_report.get("normalizedReport", {})), key=str)
    report("sbom normalizedReport validates against sbomDocumentContent exactly",
           not sbom_errors, "; ".join(f"{list(e.path)}: {e.message}" for e in sbom_errors[:5]))

    # --- vulnerabilityScan kind ---
    vuln_report = read_evidence_set_report(registry_ref, "evidence-monolith-sha-testcommit",
                                            "vulnerabilityScan", subject_digest)
    report("vulnerabilityScan report is present and verified",
           vuln_report.get("status") == "present" and vuln_report.get("schemaValid") is True,
           f"vuln_report status/schemaValid: {vuln_report.get('status')!r}, {vuln_report.get('schemaValid')!r}")

    predicates_dir = HERE.parent / "contracts" / "predicates"
    combined_registry = build_registry(HERE.parent / "contracts")
    normalized_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "allOf": [sbom_defs_schema["$defs"]["normalizedScanContent"]],
        "$defs": {k: v for k, v in sbom_defs_schema["$defs"].items()
                  if k in ("digest", "hex64", "scanPolicy", "scanCounts", "severityCount", "finding")},
    }
    normalized_validator = jsonschema.Draft202012Validator(normalized_schema)
    normalized_errors = sorted(
        normalized_validator.iter_errors(vuln_report.get("normalizedReport", {})), key=str)
    report("vulnerabilityScan normalizedReport validates against normalizedScanContent exactly",
           not normalized_errors,
           "; ".join(f"{list(e.path)}: {e.message}" for e in normalized_errors[:5]))

    report("vulnerabilityScan normalizedReport.target is the imageDigest object form",
           vuln_report.get("normalizedReport", {}).get("target") == {"imageDigest": subject_digest},
           f"target={vuln_report.get('normalizedReport', {}).get('target')!r}")

    # --- A kind that was never pushed under this tag (wrong tag) reports absent ---
    absent_report = read_evidence_set_report(registry_ref, "this-tag-was-never-pushed",
                                              "vulnerabilityScan", subject_digest)
    report("a missing evidence-set tag reports absent",
           absent_report.get("status") == "absent",
           f"absent_report={absent_report!r}")
finally:
    registry_fixture.stop_local_registry(container_id)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
