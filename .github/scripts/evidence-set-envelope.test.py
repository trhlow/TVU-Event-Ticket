"""Exercises evidence_set_envelope_for/publish_evidence_set against a real throwaway registry, using
the REAL evidence documents the slice 1/2 collectors produce from the tiny test-image fixture -- not
fabricated documents, because the whole point is proving the real pipeline's own output round-trips
through a real push/pull cycle unchanged."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
SCHEMA_PATH = HERE.parent / "contracts" / "release-evidence-set.schema.json"

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence_set_envelope = _load("evidence-set-envelope")
evidence_set_envelope_for = evidence_set_envelope.evidence_set_envelope_for
publish_evidence_set = evidence_set_envelope.publish_evidence_set
PublishError = evidence_set_envelope.PublishError

collect_sbom_mod = _load("collect-sbom")
collect_vuln_mod = _load("collect-vulnerability-scan")
collect_secret_mod = _load("collect-secret-scan")
local_registry_mod = _load("local-registry")

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
    resources = {}
    for path in sorted(SCHEMA_PATH.parent.rglob("*.schema.json")):
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

RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"

# Real evidence content -- exactly what the already-merged collectors produce, not a fixture invented
# for this test.
sbom_result = collect_sbom_mod.collect_sbom(str(TARBALL), "tvu-collector-test:tiny")
vuln_document = collect_vuln_mod.collect_vulnerability_scan(str(TARBALL), "tvu-collector-test:tiny")
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
    run_proc = subprocess.run(
        ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", "registry:2"],
        capture_output=True, text=True, timeout=60, check=False,
    )
    container_id = run_proc.stdout.strip()
    port_proc = subprocess.run(["docker", "port", container_id, "5000/tcp"],
                                capture_output=True, text=True, timeout=30, check=False)
    host_port = port_proc.stdout.strip().splitlines()[0].rsplit(":", 1)[1]

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    break
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)

    registry_ref = f"localhost:{host_port}/evidence-set-test"

    # A real subject to bind to: push the tiny fixture itself into the SAME throwaway registry and
    # read its real manifest digest/size back, the same pattern collect-flyway-inventory.py already
    # uses for boundTo.
    with local_registry_mod.local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as subject_ref:
        digest_proc = subprocess.run(["crane", "digest", "--full-ref", subject_ref],
                                      capture_output=True, text=True, timeout=30, check=False)
        manifest_proc = subprocess.run(["crane", "manifest", subject_ref],
                                        capture_output=True, text=True, timeout=30, check=False)
    subject_digest = digest_proc.stdout.strip().rsplit("@", 1)[-1]
    subject_size = len(manifest_proc.stdout.encode("utf-8"))

    manifest_digest = publish_evidence_set(registry_ref, "evidence-monolith-sha-testcommit",
                                            evidence_documents, subject_digest, subject_size)

    report("publish_evidence_set returns a real sha256 digest",
           manifest_digest.startswith("sha256:") and len(manifest_digest) == len("sha256:") + 64,
           f"manifest_digest={manifest_digest!r}")

    # Read the pushed manifest back with a plain HTTP GET and validate it against the real schema.
    req = urllib.request.Request(
        f"http://localhost:{host_port}/v2/evidence-set-test/manifests/evidence-monolith-sha-testcommit",
        headers={"Accept": "application/vnd.oci.image.manifest.v1+json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        stored_manifest = json.loads(resp.read())

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    registry = build_registry()
    validator = jsonschema.Draft202012Validator(schema, registry=registry)
    errors = sorted(validator.iter_errors(stored_manifest), key=str)
    report("the pushed manifest validates against release-evidence-set.schema.json exactly",
           not errors,
           "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5]))

    report("the pushed manifest has exactly 4 layers, one per evidence kind",
           len(stored_manifest.get("layers", [])) == 4,
           f"layers={[l.get('mediaType') for l in stored_manifest.get('layers', [])]}")

    report("the pushed manifest carries no annotations anywhere",
           "annotations" not in stored_manifest
           and "annotations" not in stored_manifest.get("config", {})
           and all("annotations" not in layer for layer in stored_manifest.get("layers", [])),
           f"stored manifest: {stored_manifest}")

    report("subject binds to the real image digest/size, not a placeholder",
           stored_manifest.get("subject", {}).get("digest") == subject_digest
           and stored_manifest.get("subject", {}).get("size") == subject_size,
           f"subject={stored_manifest.get('subject')!r}")

    # Negative case: a raised PublishError from oci-push.py must propagate, not be swallowed.
    try:
        publish_evidence_set("localhost:1/nothing-here", "irrelevant", evidence_documents,
                              subject_digest, subject_size)
        report("pushing to an unreachable registry raises PublishError", False,
               "no exception was raised")
    except PublishError:
        report("pushing to an unreachable registry raises PublishError", True)
    except Exception as exc:  # noqa: BLE001
        report("pushing to an unreachable registry raises PublishError", False,
               f"raised {type(exc).__name__} instead")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
