# Publish job: evidence-set builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and push a real evidence-set OCI manifest (`.github/contracts/release-evidence-set.schema.json`)
— the four evidence documents (SBOM, vulnerabilityScan, layerSecretScan, filesystemSecretScan) as
layers, plus a `subject` binding it to the image it describes — using `oci-push.py` (just merged) and
the same annotation-free construction discipline `envelope.py`'s `envelope_for` already established for
markers.

**Architecture:** One function, `evidence_set_envelope_for`, builds the manifest dict (pure, no I/O,
same shape as `envelope_for`). One function, `publish_evidence_set`, does the actual pushing: pushes
each evidence document as a canonical-bytes blob, pushes the shared empty config blob, builds the
manifest referencing the real digests/sizes those pushes returned, pushes the manifest itself under the
tag this project's naming convention uses (`evidence-{monolith,frontend}-sha-<commit>`, per design doc
§2's repository table). Both live in a new `evidence-set-envelope.py`, mirroring `envelope.py`'s own
split between pure construction and (in a later task, not `envelope.py` itself) actual publishing.

**Tech Stack:** Python 3.10+, this project's existing `canonical.py`, `envelope.py` (for the shared
`MANIFEST_MEDIA_TYPE`/`EMPTY_CONFIG_*` constants — not duplicated), and the just-merged `oci-push.py`.
Tested against a real throwaway `registry:2`, reusing the 4 evidence documents the slice 1/2 collectors
already produce for real from the tiny test-image fixture.

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- The manifest this task builds must validate against `.github/contracts/release-evidence-set.schema.json`
  exactly: `schemaVersion: 2`, `mediaType` = the shared manifest media type, `artifactType` =
  `"application/vnd.evts.evidence-set.v1+json"`, `config` = the shared empty config, `layers` = exactly
  4 entries (one per evidence kind, `contains`/`minContains`/`maxContains` = 1 each in the schema),
  `subject` = `{mediaType, digest, size}` of the image manifest this evidence-set is about.
  `additionalProperties: false` throughout — no stray key survives.
- The four layer media types are fixed by the schema's own `constants.layerMediaTypes`:
  `application/vnd.evts.evidence.{sbom,vulnerabilityScan,layerSecretScan,filesystemSecretScan}.v1+json`.
  Do not invent different strings — copy these exactly.
- No annotations anywhere (same rule as `oci-push.py`'s own plan) — `evidence_set_envelope_for` must
  produce a dict with no `annotations` key at manifest, config, or layer level, matching
  `envelope_for`'s own "No annotations key" comment.
- Each evidence document, when pushed as a blob, must be pushed as `canonical.canonical_bytes(document)`
  — the same rule as every other digest in this pipeline, and the reason `layers[N].digest`/`.size` must
  come from what `push_blob` actually returned, never computed separately and assumed to match.
- `subject.digest`/`.size` must be the REAL image manifest's digest/size, as read from the registry
  (via `crane manifest`/`crane digest`, the pattern `collect-flyway-inventory.py`'s `_image_digest`
  already established) — not invented, not the tarball's own digest (which is docker-save format, a
  different byte layout than what a registry assigns).

---

## File Structure

- Create: `.github/scripts/evidence-set-envelope.py` — `evidence_set_envelope_for`,
  `publish_evidence_set`.
- Create: `.github/scripts/evidence-set-envelope.test.py` — exercises both against a real throwaway
  registry, using the tiny test-image fixture's real evidence documents from the already-merged
  collectors.

## Interfaces

- `evidence_set_envelope_for(evidence_documents: dict, subject_digest: str, subject_size: int) -> dict`
  — pure function, no I/O. `evidence_documents` is `{"sbom": <blob digest/size pair>, ...}` — actually
  takes the ALREADY-PUSHED layer descriptors (`{"digest": ..., "size": ...}` per kind), not the raw
  evidence content, so this function stays pure and testable without a registry (mirrors
  `envelope_for`'s own purity — it takes already-canonicalized `content`, not something requiring I/O).
  Returns a dict matching `release-evidence-set.schema.json`'s `evidenceSetManifest` shape.
- `publish_evidence_set(registry_ref: str, tag: str, evidence_documents: dict, subject_digest: str,
  subject_size: int) -> str` — the impure orchestrator: for each of the 4 kinds in
  `evidence_documents` (raw Python dicts, e.g. what `collect_sbom(...)["document"]` or
  `collect_vulnerability_scan(...)` returned), canonicalizes and pushes it as a blob via
  `oci-push.push_blob`, builds the layer descriptor list from what came back, pushes the shared empty
  config blob, calls `evidence_set_envelope_for` with the real pushed descriptors, pushes the resulting
  manifest via `oci-push.push_manifest`. Returns the manifest's digest. Raises this module's own
  `PublishError` (re-exported from `oci-push.py`'s own `PublishError` — this module does not define a
  second exception type for the same failure class, unlike the collector modules' `CollectorError`
  convention, because this is push-side work building directly on `oci-push.py`'s own contract, not a
  new failure domain).

---

### Task 1: `evidence-set-envelope.py` — build and push a real evidence-set manifest

**Files:**
- Create: `.github/scripts/evidence-set-envelope.py`
- Test: `.github/scripts/evidence-set-envelope.test.py`

**Interfaces:**
- Consumes: `push_blob`/`push_manifest`/`PublishError` from the just-merged `oci-push.py`;
  `MANIFEST_MEDIA_TYPE`/`EMPTY_CONFIG_MEDIA_TYPE`/`EMPTY_CONFIG_DIGEST`/`EMPTY_CONFIG_SIZE`/
  `EMPTY_CONFIG_DATA` from `envelope.py`; `collect_sbom`/`collect_vulnerability_scan`/
  `collect_filesystem_secret_scan`/`collect_layer_secret_scan` from the already-merged collector
  modules (the test uses these to get REAL evidence content, not fabricated documents); the tiny
  test-image fixture and `local_registry_ref` (to get a real subject digest to bind to, matching how
  `collect-flyway-inventory.py` already obtains one).
- Produces: `evidence_set_envelope_for`, `publish_evidence_set`, importable by a later marker-writer
  task (not in this plan).

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/evidence-set-envelope.test.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python evidence-set-envelope.test.py`
Expected: fails in the `_load("evidence-set-envelope")` call (`evidence-set-envelope.py` does not exist
yet).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/evidence-set-envelope.py
"""Builds and pushes a real evidence-set OCI manifest (release-evidence-set.schema.json): four evidence
reports (SBOM, vulnerabilityScan, layerSecretScan, filesystemSecretScan) as layers, bound to the image
they describe via `subject`. No annotations anywhere -- same discipline as envelope.py's own
envelope_for, and the same reason oci-push.py exists at all (design doc section 7a: oras push cannot be
trusted not to add them).
"""
import importlib.util
import pathlib

import canonical

_HERE = pathlib.Path(__file__).resolve().parent

_envelope_spec = importlib.util.spec_from_file_location("envelope", _HERE / "envelope.py")
_envelope_module = importlib.util.module_from_spec(_envelope_spec)
_envelope_spec.loader.exec_module(_envelope_module)

_push_spec = importlib.util.spec_from_file_location("oci_push", _HERE / "oci-push.py")
_push_module = importlib.util.module_from_spec(_push_spec)
_push_spec.loader.exec_module(_push_module)
push_blob = _push_module.push_blob
push_manifest = _push_module.push_manifest
PublishError = _push_module.PublishError

__all__ = ["evidence_set_envelope_for", "publish_evidence_set", "PublishError"]

ARTIFACT_TYPE = "application/vnd.evts.evidence-set.v1+json"

LAYER_MEDIA_TYPES = {
    "sbom": "application/vnd.evts.evidence.sbom.v1+json",
    "vulnerabilityScan": "application/vnd.evts.evidence.vulnerabilityScan.v1+json",
    "layerSecretScan": "application/vnd.evts.evidence.layerSecretScan.v1+json",
    "filesystemSecretScan": "application/vnd.evts.evidence.filesystemSecretScan.v1+json",
}

# Fixed order for determinism -- a schema's `contains`/minContains/maxContains does not care about
# layer order, but a stable order means two runs over the same content produce byte-identical
# manifests, which matters for the same reason collect-flyway-inventory.py's determinism test does.
_KIND_ORDER = ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan")


def evidence_set_envelope_for(layer_descriptors: dict, subject_digest: str, subject_size: int) -> dict:
    layers = []
    for kind in _KIND_ORDER:
        descriptor = layer_descriptors[kind]
        layers.append({
            "mediaType": LAYER_MEDIA_TYPES[kind],
            "digest": descriptor["digest"],
            "size": descriptor["size"],
        })
    return {
        "schemaVersion": 2,
        "mediaType": _envelope_module.MANIFEST_MEDIA_TYPE,
        "artifactType": ARTIFACT_TYPE,
        "config": {
            "mediaType": _envelope_module.EMPTY_CONFIG_MEDIA_TYPE,
            "digest": _envelope_module.EMPTY_CONFIG_DIGEST,
            "size": _envelope_module.EMPTY_CONFIG_SIZE,
            "data": _envelope_module.EMPTY_CONFIG_DATA,
        },
        "layers": layers,
        "subject": {
            "mediaType": _envelope_module.MANIFEST_MEDIA_TYPE,
            "digest": subject_digest,
            "size": subject_size,
        },
    }


def publish_evidence_set(registry_ref: str, tag: str, evidence_documents: dict,
                          subject_digest: str, subject_size: int,
                          username: str = None, password: str = None) -> str:
    layer_descriptors = {}
    for kind in _KIND_ORDER:
        content = canonical.canonical_bytes(evidence_documents[kind])
        digest = push_blob(registry_ref, content, username=username, password=password)
        layer_descriptors[kind] = {"digest": digest, "size": len(content)}

    push_blob(registry_ref, b"{}", username=username, password=password)  # shared empty config blob

    manifest = evidence_set_envelope_for(layer_descriptors, subject_digest, subject_size)
    return push_manifest(registry_ref, manifest, manifest["mediaType"], tag,
                          username=username, password=password)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python evidence-set-envelope.test.py`
Expected: `passed=6 failed=0`. This test runs all 4 collectors plus 2 real registry round-trips, so
expect it to take noticeably longer than any single collector's own test — that is the real cost of
proving the whole chain together, not a hang.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/evidence-set-envelope.py .github/scripts/evidence-set-envelope.test.py
git commit -m "feat(ci): build and push a real evidence-set manifest from the 4 collector outputs"
```

---

## Explicitly out of scope for this plan

- The marker envelope's own push (prepared/final) — a follow-up task reusing `envelope.py`'s
  `envelope_for` plus `oci-push.py`, the same pattern this plan just established for evidence-sets.
- Candidate-tag pushing for the images themselves (step 3 of design doc §4's 8-step flow) — this plan
  assumes a subject digest/size already exist (obtained the same way `collect-flyway-inventory.py`
  already does, via `local_registry_ref` + `crane`), not that this plan pushes the image itself.
- Calling `publish-decision.sh` with the result — a follow-up integration task once both the
  evidence-set and marker writers exist.
- Real GHCR credentials/wiring into CI.

## Self-Review Notes

- Spec coverage: `release-evidence-set.schema.json`'s full `evidenceSetManifest` shape (schemaVersion,
  mediaType, artifactType, config, exactly-4 layers by media type, subject) is built and schema-
  validated for real in Task 1.
- Placeholder scan: no TBD/TODO.
- Type consistency: `evidence_set_envelope_for` takes already-pushed `layer_descriptors` (a pure
  function, matching `envelope_for`'s own purity), while `publish_evidence_set` is the only impure
  entry point that does I/O — checked against both the implementation and the test's actual call shapes
  above.
