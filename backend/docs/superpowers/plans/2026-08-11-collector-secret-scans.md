# Collector: secret scans (layer + filesystem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce two real, schema-valid secret-scan predicate documents from a built image tarball —
`filesystemSecretScan` (flattened rootfs) and `layerSecretScan` (each layer scanned separately) — using
the exact tools and extraction methods the predicate schemas and spec already pin: `crane` for
extraction, `trivy fs --scanners secret` for scanning, per design doc §3.3/§3.3b (verified against real
tool runs, not documentation, on 2026-08-11).

**Architecture:** One shared helper module (`local-registry.py`) that stages a `docker save` tarball
into a throwaway local registry container so `crane` can address it (crane's `export`/`blob`
subcommands are registry-native only — confirmed by a real failed `daemon://` attempt during design,
see design doc §3.3b). One collector module (`collect-secret-scan.py`) exposing two functions,
`collect_filesystem_secret_scan` and `collect_layer_secret_scan`, both built on top of the registry
helper, both enforcing the byte-cap/timeout table from design doc §3.3a before trusting any bytes they
extract. One repo-tracked ruleset file Trivy's `--secret-config` reads, because the predicate schemas
require `ruleset.version`+`ruleset.digest` to name a file Git tracks, not Trivy's built-in defaults.

**Tech Stack:** Python 3.10+, `crane` 0.21.9, `trivy` 0.73.0 (both already installed via scoop, same
as slice 1), Docker (`registry:2` image, `docker run`/`docker port`/`docker stop`), `jsonschema` +
`referencing` (same pattern slice 1's `collect-vulnerability-scan.test.py` already established for
resolving the predicate schemas' `$ref` into `observation.schema.json` without a network fetch).

## Global Constraints

- Same floor and directory constraints as slice 1 (`backend/docs/superpowers/plans/2026-08-11-collector-sbom-vuln-scan.md`):
  Python 3.10+, everything self-contained under `.github/scripts/`, `PYTHON_BIN` env var may be needed
  on this Windows machine (`python`, not `python3`).
- `PREDICATE_TYPES["layerSecretScan"]` and `PREDICATE_TYPES["filesystemSecretScan"]` are already defined
  in `.github/scripts/envelope.py` — import them, do not redeclare the URIs.
- Both predicate documents must validate against `.github/contracts/predicates/layerSecretScan.schema.json`
  and `.github/contracts/predicates/filesystemSecretScan.schema.json` exactly: `required: [scanner,
  ruleset, target, timestamp, findings, truncated]`, `additionalProperties: false`. Neither predicate
  carries a `vulnerabilityDb` field — that is vulnerability-scan-only (spec
  `evidence-verification-contract-design.md:302`, already handled in slice 1's design note).
- `ruleset.version`/`ruleset.digest` must name a file Git tracks, not Trivy's default config (design doc
  §3.3, mirroring master spec's "policy must come from a tracked file, not a workflow input" rule).
- Byte caps (design doc §3.3a, `evidence-verification-contract-design.md:331-343`), copied verbatim, not
  reinterpreted: report blob 8 MiB, carrier/marker manifest 64 KiB, marker payload 256 KiB, one layer
  blob (compressed) during per-layer scan 2 GiB, total compressed layers for one image 8 GiB, total
  decompressed bytes 24 GiB, file count after decompression 2,000,000, timeout per extract+scan 20
  minutes, `findings` capped at 100 then `truncated: true`. A descriptor that declares a size over cap
  must be refused **before downloading** (`CollectorError`, never even start the transfer). A stream
  that exceeds a cap **during** extraction must stop immediately (`CollectorError`), not finish and
  check after. `publish-decision.sh` does not enforce any of this today (confirmed by grep — no byte
  cap constants exist there) — the collector is the only place these caps are enforced right now.
- `trivy fs --scanners secret` omits the `Results[].Class == "secret"` entry entirely when zero secrets
  are found — it does **not** emit an empty `Secrets: []` array (confirmed for real, design doc §3.3b).
  Code must treat "no such entry present" as zero findings, not as an error or a signal to retry.
- `crane export`/`crane blob` only accept registry references (`host:port/name:tag` or `@digest`) —
  neither accepts a local `docker save` tarball path nor a locally-tagged daemon image directly
  (confirmed: a `daemon://<tag>` attempt fails with a DNS lookup error on this crane build). Every task
  below routes through the local-registry helper (Task 1) for this reason.
- No network calls other than the tool invocations themselves and the local registry (which never
  leaves `localhost`). No GHCR, no secrets, no `.env` file.

---

## File Structure

- Create: `.github/scripts/local-registry.py` — the throwaway-registry helper, a context manager other
  collector modules can reuse.
- Create: `.github/scripts/local-registry.test.py` — exercises the helper against the Task-1 fixture
  from slice 1 (`.github/scripts/collector-fixtures/tiny-test-image.tar`).
- Create: `.github/scripts/collector-fixtures/trivy-secret-ruleset.yaml` — the repo-tracked ruleset file
  Trivy's `--secret-config` reads.
- Create: `.github/scripts/collect-secret-scan.py` — `collect_filesystem_secret_scan` and
  `collect_layer_secret_scan`.
- Create: `.github/scripts/collect-secret-scan.test.py` — exercises both functions against the same
  fixture image.

## Interfaces

- `local-registry.py` exposes `local_registry_ref(tarball_path: str, image_name: str)` — a context
  manager (use with `with local_registry_ref(...) as ref:`) that pushes the tarball into a throwaway
  registry container and yields a `localhost:<port>/<name>:local` string `crane` can address. Raises
  `CollectorError` (defined in this module) on any docker/crane failure. Guarantees the container is
  stopped in a `finally` block even if the caller raises inside the `with` block.
- `collect-secret-scan.py` exposes:
  - `collect_filesystem_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict` —
    returns a document validating against `filesystemSecretScan.schema.json`.
  - `collect_layer_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict` —
    returns a document validating against `layerSecretScan.schema.json`.
  - Both raise this module's own `CollectorError` (not `local-registry.py`'s — each module defines its
    own, matching the no-shared-base-module convention slice 1 already established for
    `collect-sbom.py`/`collect-vulnerability-scan.py`). `collect-secret-scan.py` imports
    `local_registry_ref` from `local-registry.py` via the same `importlib.util` hyphen-load pattern the
    test files use, and lets `local-registry.py`'s `CollectorError` propagate unchanged when the
    registry helper itself fails (it does not re-wrap it — a caller catching `Exception` broadly still
    sees a clear message either way; only fully module-owned failures get this module's own
    `CollectorError`).

---

### Task 1: `local-registry.py` — throwaway registry helper + ruleset file

**Files:**
- Create: `.github/scripts/local-registry.py`
- Test: `.github/scripts/local-registry.test.py`
- Create: `.github/scripts/collector-fixtures/trivy-secret-ruleset.yaml`

**Interfaces:**
- Consumes: `.github/scripts/collector-fixtures/tiny-test-image.tar` (already committed, slice 1 Task
  1), `docker` and `crane` on PATH.
- Produces: `local_registry_ref(tarball_path, image_name)` context manager, `CollectorError`, both
  importable by Task 2/3.

- [ ] **Step 1: Write the ruleset file**

Trivy's `--secret-config` flag reads a YAML file. A minimal, real, valid one that just turns on Trivy's
built-in rule set (no custom regex needed for this project — the predicate schema only requires the
*file* to exist and be versioned/hashed, not that it diverges from Trivy's defaults):

```yaml
# .github/scripts/collector-fixtures/trivy-secret-ruleset.yaml
#
# The ruleset predicateSchemas require (layerSecretScan.schema.json / filesystemSecretScan.schema.json:
# `ruleset.version` + `ruleset.digest`) must name a file this repo tracks, not Trivy's untracked
# built-in default -- mirrors the master spec's "policy comes from a tracked file, not a workflow
# input" rule. version: "1" below is this file's own version marker (bump it by hand if the rules
# below ever change; the digest the collector reports is computed from these bytes directly, so a
# stale version string does not silently hide a real change -- only a stale value that still matches
# these bytes would, and this file's own version is the version, not a separate ledger to fall out of
# sync).
version: "1"
enable-builtin-rules: true
```

- [ ] **Step 2: Write the failing test**

```python
# .github/scripts/local-registry.test.py
"""Exercises local_registry_ref against a real tarball and real docker/crane -- not mocked, because a
mock cannot tell you crane changed its own CLI behavior or that a registry container failed to bind a
port on this machine."""
import importlib.util
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"

_spec = importlib.util.spec_from_file_location("local_registry", HERE / "local-registry.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
local_registry_ref = _module.local_registry_ref
CollectorError = _module.CollectorError

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

container_was_running = None
with local_registry_ref(str(TARBALL), "tvu-collector-test:tiny") as ref:
    report("ref looks like a localhost registry reference",
           ref.startswith("localhost:") and ":" in ref.split("/", 1)[-1],
           f"ref={ref!r}")

    manifest_proc = subprocess.run(["crane", "manifest", ref], capture_output=True, text=True,
                                    timeout=30, check=False)
    report("crane manifest resolves the pushed ref",
           manifest_proc.returncode == 0 and manifest_proc.stdout.strip().startswith("{"),
           f"exit={manifest_proc.returncode}, stderr={manifest_proc.stderr.strip()[:300]}")

    ps_proc = subprocess.run(["docker", "ps", "--filter", "ancestor=registry:2", "--format", "{{.ID}}"],
                              capture_output=True, text=True, timeout=15, check=False)
    container_was_running = bool(ps_proc.stdout.strip())
    report("a registry:2 container is running while inside the context manager",
           container_was_running, f"docker ps output: {ps_proc.stdout!r}")

# Outside the `with` block now -- the container must be gone.
ps_proc = subprocess.run(["docker", "ps", "--filter", "ancestor=registry:2", "--format", "{{.ID}}"],
                          capture_output=True, text=True, timeout=15, check=False)
report("the registry container is stopped after the context manager exits",
       not ps_proc.stdout.strip(), f"docker ps output: {ps_proc.stdout!r}")

# Negative case: a bogus tarball must raise CollectorError and still clean up (no leaked container).
bogus = HERE / "collector-fixtures" / "not-a-real-tarball-2.tar"
bogus.write_bytes(b"not a tarball")
try:
    with local_registry_ref(str(bogus), "does-not-matter"):
        pass
    report("a bogus tarball raises CollectorError", False, "no exception was raised")
except CollectorError:
    report("a bogus tarball raises CollectorError", True)
except Exception as exc:  # noqa: BLE001
    report("a bogus tarball raises CollectorError", False, f"raised {type(exc).__name__} instead")
finally:
    bogus.unlink()

ps_proc = subprocess.run(["docker", "ps", "--filter", "ancestor=registry:2", "--format", "{{.ID}}"],
                          capture_output=True, text=True, timeout=15, check=False)
report("no registry container leaked after a failed push",
       not ps_proc.stdout.strip(), f"docker ps output: {ps_proc.stdout!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .github/scripts && python local-registry.test.py`
Expected: `ModuleNotFoundError`-style failure from `importlib` (`local-registry.py` does not exist yet)
— the `spec_from_file_location`/`exec_module` calls raise because the file is missing.

- [ ] **Step 4: Write the implementation**

```python
# .github/scripts/local-registry.py
"""Throwaway local OCI registry: crane's export/blob subcommands only accept registry references, not
local docker-archive tarballs or daemon-tagged images (confirmed against crane 0.21.9 -- a
`daemon://<tag>` attempt fails with a DNS lookup error, this build has no such scheme). This module
stages a tarball into a registry container running only for the extraction's duration, so crane can
address it -- pushing the exact same tarball bytes the CI job already built and tested, not a rebuild.
"""
import contextlib
import subprocess
import time
import urllib.error
import urllib.request

__all__ = ["local_registry_ref", "CollectorError"]


class CollectorError(Exception):
    pass


@contextlib.contextmanager
def local_registry_ref(tarball_path: str, image_name: str):
    container_id = None
    try:
        run_proc = subprocess.run(
            ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", "registry:2"],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if run_proc.returncode != 0:
            raise CollectorError(
                f"docker run registry:2 exited {run_proc.returncode}: {run_proc.stderr.strip()[:2000]}"
            )
        container_id = run_proc.stdout.strip()

        port_proc = subprocess.run(
            ["docker", "port", container_id, "5000/tcp"],
            capture_output=True, text=True, timeout=30, check=False,
        )
        if port_proc.returncode != 0 or not port_proc.stdout.strip():
            raise CollectorError(
                f"could not read the published port for {container_id}: "
                f"{port_proc.stderr.strip()[:500]}"
            )
        # docker port may print one line per address family; the host port number is the same on
        # both, so the first line is enough.
        host_port = port_proc.stdout.strip().splitlines()[0].rsplit(":", 1)[1]

        _wait_for_registry(host_port)

        safe_name = "".join(c if c.isalnum() else "-" for c in image_name).strip("-").lower() or "image"
        ref = f"localhost:{host_port}/{safe_name}:local"

        push_proc = subprocess.run(
            ["crane", "push", tarball_path, ref],
            capture_output=True, text=True, timeout=300, check=False,
        )
        if push_proc.returncode != 0:
            raise CollectorError(f"crane push exited {push_proc.returncode}: "
                                  f"{push_proc.stderr.strip()[:2000]}")

        yield ref
    finally:
        if container_id:
            subprocess.run(["docker", "stop", container_id], capture_output=True, text=True,
                            timeout=30, check=False)


def _wait_for_registry(host_port: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise CollectorError(f"local registry on port {host_port} never became ready: {last_error}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .github/scripts && python local-registry.test.py`
Expected: `passed=5 failed=0`. If the "container is stopped" checks fail, run `docker ps -a --filter
ancestor=registry:2` by hand to see what's actually left running and read `docker logs <id>` for why
`docker stop` didn't remove it (the `--rm` flag on `docker run` should auto-remove on stop, so a
leftover here means the container never actually stopped, not that `--rm` didn't fire).

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/local-registry.py .github/scripts/local-registry.test.py .github/scripts/collector-fixtures/trivy-secret-ruleset.yaml
git commit -m "feat(ci): add a throwaway local registry helper for crane-based extraction"
```

---

### Task 2: `collect_filesystem_secret_scan` — flattened rootfs

**Files:**
- Create: `.github/scripts/collect-secret-scan.py` (this task writes the file; Task 3 extends it)
- Test: `.github/scripts/collect-secret-scan.test.py` (this task writes the filesystem-scan half; Task 3
  extends it)

**Interfaces:**
- Consumes: `local_registry_ref` and `CollectorError` from Task 1's `local-registry.py` (via
  `importlib.util`, matching this directory's hyphenated-filename convention), the ruleset file from
  Task 1, `envelope.PREDICATE_TYPES["filesystemSecretScan"]`.
- Produces: `collect_filesystem_secret_scan(tarball_path, image_name, ruleset_path) -> dict`, importable
  by a later observation-assembly task (not in this plan).

- [ ] **Step 1: Confirm real byte counts before writing the cap-enforcement code**

Using the fixture already built (slice 1 Task 1), get its real per-layer and total compressed sizes to
know what numbers this task's test is actually exercising (these are all far under every cap in the
table — the point of this step is to know the real baseline, not to hit a limit):

Run (needs Task 1's registry helper working first, or run by hand once with a manual registry + push,
same as design doc §3.3b's manual verification):
```
docker run -d --rm -p 5599:5000 --name secret-scan-probe registry:2
crane push .github/scripts/collector-fixtures/tiny-test-image.tar localhost:5599/probe:local
crane manifest localhost:5599/probe:local
docker stop secret-scan-probe
```
Read the `layers[].size` values from the printed manifest — these are the real compressed sizes Task 3
will sum and compare against the 8 GiB total-compressed cap.

- [ ] **Step 2: Write the failing test (filesystem half only)**

```python
# .github/scripts/collect-secret-scan.test.py
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
FS_SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "filesystemSecretScan.schema.json"
LAYER_SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "layerSecretScan.schema.json"

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

_spec = importlib.util.spec_from_file_location("collect_secret_scan", HERE / "collect-secret-scan.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_filesystem_secret_scan = _module.collect_filesystem_secret_scan
CollectorError = _module.CollectorError

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


def build_registry(schema_path):
    contracts_dir = schema_path.parent.parent
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

fs_schema = json.loads(FS_SCHEMA_PATH.read_text(encoding="utf-8"))
fs_registry = build_registry(FS_SCHEMA_PATH)
fs_validator = jsonschema.Draft202012Validator(fs_schema, registry=fs_registry)

fs_document = collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny", str(RULESET))

fs_errors = sorted(fs_validator.iter_errors(fs_document), key=str)
report("filesystemSecretScan document validates exactly",
       not fs_errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in fs_errors[:5]))

report("filesystemSecretScan findings is empty for this clean fixture (alpine:3.18 base has no secrets)",
       fs_document.get("findings") == [] and fs_document.get("truncated") is False,
       f"findings={fs_document.get('findings')!r}, truncated={fs_document.get('truncated')!r}")

report("filesystemSecretScan ruleset names the tracked file's real version and a real digest",
       fs_document.get("ruleset", {}).get("version") == "1"
       and isinstance(fs_document.get("ruleset", {}).get("digest"), str)
       and fs_document["ruleset"]["digest"].startswith("sha256:"),
       f"ruleset={fs_document.get('ruleset')!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: fails immediately in the `importlib` load (`collect-secret-scan.py` does not exist).

- [ ] **Step 4: Write the implementation (filesystem half)**

```python
# .github/scripts/collect-secret-scan.py
"""Wraps crane + Trivy to produce layerSecretScan/filesystemSecretScan predicate documents.

filesystemSecretScan flattens the image (crane export, whiteouts applied -- that is what flatten
means) and scans the merged tree. layerSecretScan extracts every layer separately (crane blob per
layer digest, whiteouts deliberately ignored -- that is the point of a per-layer scan: it catches a
secret deleted in a later layer but still physically present in the image). Both scan with
`trivy fs --scanners secret`, confirmed for real (design doc section 3.3b) to omit the
Results[].Class == "secret" entry entirely -- not an empty Secrets array -- when nothing is found.
"""
import datetime
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import tarfile
import tempfile

_HERE = pathlib.Path(__file__).resolve().parent
_registry_spec = importlib.util.spec_from_file_location("local_registry", _HERE / "local-registry.py")
_registry_module = importlib.util.module_from_spec(_registry_spec)
_registry_spec.loader.exec_module(_registry_module)
local_registry_ref = _registry_module.local_registry_ref

__all__ = ["collect_filesystem_secret_scan", "collect_layer_secret_scan", "CollectorError"]

MAX_FINDINGS = 100
SCAN_TIMEOUT_SECONDS = 20 * 60  # design doc 3.3a: 20 minutes per extract+scan


class CollectorError(Exception):
    pass


def _ruleset_descriptor(ruleset_path: str) -> dict:
    text = pathlib.Path(ruleset_path).read_bytes()
    # version: "1" is read out of the tracked file's own YAML rather than hardcoded here, so a real
    # edit to the file (and its version bump) is the only way this value ever changes -- no separate
    # ledger to fall out of sync with the bytes actually hashed.
    version = None
    for line in text.decode("utf-8").splitlines():
        if line.strip().startswith("version:"):
            version = line.split(":", 1)[1].strip().strip('"')
            break
    if version is None:
        raise CollectorError(f"{ruleset_path} has no top-level 'version:' line")
    digest = "sha256:" + hashlib.sha256(text).hexdigest()
    return {"version": version, "digest": digest}


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_trivy_fs_secret(tree_path: str, ruleset_path: str) -> list:
    """Returns the raw findings list (list of {"severity", "fixAvailable"} dicts), honoring the
    confirmed-real quirk that a Class:"secret" Results entry is entirely absent when nothing is found."""
    try:
        proc = subprocess.run(
            ["trivy", "fs", "--scanners", "secret", "--secret-config", ruleset_path,
             "--format", "json", "--quiet", tree_path],
            capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"trivy is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"trivy fs timed out scanning {tree_path} (cap: {SCAN_TIMEOUT_SECONDS}s)") from exc

    if proc.returncode != 0:
        raise CollectorError(f"trivy fs exited {proc.returncode} scanning {tree_path}: "
                              f"{proc.stderr.strip()[:2000]}")

    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"trivy fs did not print valid JSON: {exc}") from exc

    findings = []
    for result in raw.get("Results") or []:
        if result.get("Class") != "secret":
            continue  # e.g. the incidental "os-pkgs" entry Trivy always emits -- not a finding source
        for secret in result.get("Secrets") or []:
            findings.append({
                "severity": secret.get("Severity", "UNKNOWN"),
                "fixAvailable": False,  # a leaked secret has no "fixed version"; always false by kind
            })
    return findings


def _cap_findings(all_findings: list) -> tuple:
    truncated = len(all_findings) > MAX_FINDINGS
    return all_findings[:MAX_FINDINGS], truncated


def collect_filesystem_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict:
    ruleset = _ruleset_descriptor(ruleset_path)

    with local_registry_ref(tarball_path, image_name) as ref:
        with tempfile.TemporaryDirectory(prefix="fs-secret-scan-") as workdir:
            workdir_path = pathlib.Path(workdir)
            export_tar = workdir_path / "flat.tar"

            export_proc = subprocess.run(
                ["crane", "export", ref, str(export_tar)],
                capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
            )
            if export_proc.returncode != 0:
                raise CollectorError(f"crane export exited {export_proc.returncode}: "
                                      f"{export_proc.stderr.strip()[:2000]}")

            extracted_dir = workdir_path / "extracted"
            extracted_dir.mkdir()
            with tarfile.open(export_tar) as tf:
                tf.extractall(extracted_dir, filter="data")

            all_findings = _run_trivy_fs_secret(str(extracted_dir), ruleset_path)

    findings, truncated = _cap_findings(all_findings)

    return {
        "scanner": {"name": "trivy", "version": _trivy_version()},
        "ruleset": ruleset,
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }


def _trivy_version() -> str:
    proc = subprocess.run(["trivy", "--version"], capture_output=True, text=True, timeout=30,
                           check=False)
    for line in proc.stdout.splitlines():
        if line.strip().startswith("Version:"):
            return line.split(":", 1)[1].strip()
    return "unknown"
```

`tarfile.extractall(..., filter="data")` (Python 3.12+ default, explicit here for 3.10/3.11 too) refuses
absolute paths and path traversal from the tar itself — a real, not cosmetic, guard given this tarball's
contents come from a container image, which is untrusted input by the same logic the byte caps exist
for.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: `passed=3 failed=0`. If `tarfile.extractall` raises about symlinks or a filter rejection on
this Windows machine (Windows has historically had friction extracting symlinked tar entries — this was
observed informally during design verification, see design doc §3.3b's own note about `tar -xf` symlink
errors when manually testing crane export output), catch `tarfile.ExtractError`/`OSError` around the
extraction and re-raise as `CollectorError` with the real underlying message, rather than letting a
platform-specific crash surface as an unhandled traceback — do not attempt to work around the OS
limitation itself in this task; a Linux CI runner (where this eventually runs for real) does not have
this constraint.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/collect-secret-scan.py .github/scripts/collect-secret-scan.test.py
git commit -m "feat(ci): collect a filesystemSecretScan predicate via crane export + Trivy"
```

---

### Task 3: `collect_layer_secret_scan` — per-layer, byte caps enforced

**Files:**
- Modify: `.github/scripts/collect-secret-scan.py` (add the function)
- Modify: `.github/scripts/collect-secret-scan.test.py` (add the layer-scan assertions)

**Interfaces:**
- Consumes: everything Task 2 already imports, plus `crane manifest`'s real JSON (to read
  `layers[].digest`/`layers[].size` — the exact shape already observed for real in design doc §3.3b:
  `{"layers": [{"digest": "sha256:...", "size": N, ...}, ...]}`).
- Produces: `collect_layer_secret_scan(tarball_path, image_name, ruleset_path) -> dict`.

- [ ] **Step 1: Write the failing test additions**

Append to `.github/scripts/collect-secret-scan.test.py` (after the existing filesystem-scan assertions,
before the final `print(f"\npassed=...")`/`sys.exit(...)` lines — move those two lines to the true end
of the file):

```python
collect_layer_secret_scan = _module.collect_layer_secret_scan

layer_schema = json.loads(LAYER_SCHEMA_PATH.read_text(encoding="utf-8"))
layer_registry = build_registry(LAYER_SCHEMA_PATH)
layer_validator = jsonschema.Draft202012Validator(layer_schema, registry=layer_registry)

layer_document = collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny", str(RULESET))

layer_errors = sorted(layer_validator.iter_errors(layer_document), key=str)
report("layerSecretScan document validates exactly",
       not layer_errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in layer_errors[:5]))

report("layerSecretScan findings is empty for this clean fixture",
       layer_document.get("findings") == [] and layer_document.get("truncated") is False,
       f"findings={layer_document.get('findings')!r}, truncated={layer_document.get('truncated')!r}")

# A tarball with a declared layer size the collector cannot possibly match must raise CollectorError,
# not silently under-report -- this is the "descriptor declares a value the collector cannot trust"
# case the byte-cap discipline exists to catch, exercised here via the simplest real trigger: a
# tarball that does not exist at all still has to fail through CollectorError, not a bare
# FileNotFoundError a caller wouldn't know to catch.
missing_tarball = str(HERE / "collector-fixtures" / "this-file-does-not-exist.tar")
try:
    collect_layer_secret_scan(missing_tarball, "does-not-matter", str(RULESET))
    report("a missing tarball raises CollectorError (layer scan)", False, "no exception was raised")
except CollectorError:
    report("a missing tarball raises CollectorError (layer scan)", True)
except Exception as exc:  # noqa: BLE001
    report("a missing tarball raises CollectorError (layer scan)", False,
           f"raised {type(exc).__name__} instead")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: `AttributeError: module ... has no attribute 'collect_layer_secret_scan'` — the function does
not exist yet, but Task 2's filesystem-scan assertions above it in the file still ran and reported
`ok` first (confirms Task 2 remains intact while this task is red).

- [ ] **Step 3: Write the implementation (layer half)**

Append to `.github/scripts/collect-secret-scan.py`:

```python
TOTAL_LAYER_COMPRESSED_CAP = 8 * 1024 ** 3       # 8 GiB
ONE_LAYER_COMPRESSED_CAP = 2 * 1024 ** 3         # 2 GiB
TOTAL_DECOMPRESSED_CAP = 24 * 1024 ** 3          # 24 GiB
MAX_EXTRACTED_FILE_COUNT = 2_000_000


def collect_layer_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict:
    ruleset = _ruleset_descriptor(ruleset_path)

    with local_registry_ref(tarball_path, image_name) as ref:
        manifest_proc = subprocess.run(
            ["crane", "manifest", ref], capture_output=True, text=True, timeout=30, check=False,
        )
        if manifest_proc.returncode != 0:
            raise CollectorError(f"crane manifest exited {manifest_proc.returncode}: "
                                  f"{manifest_proc.stderr.strip()[:2000]}")
        try:
            manifest = json.loads(manifest_proc.stdout)
        except json.JSONDecodeError as exc:
            raise CollectorError(f"crane manifest did not print valid JSON: {exc}") from exc

        layers = manifest.get("layers") or []
        if not layers:
            raise CollectorError(f"{ref}'s manifest declares no layers")

        # Size-before-hash discipline (design doc 3.3a / 3a section 2): every declared size is
        # checked against its cap BEFORE any blob is downloaded, not after.
        total_declared = 0
        for layer in layers:
            size = layer.get("size")
            if not isinstance(size, int) or size < 0:
                raise CollectorError(f"{ref}'s manifest declares a layer with an invalid size: {layer!r}")
            if size > ONE_LAYER_COMPRESSED_CAP:
                raise CollectorError(
                    f"{ref}'s layer {layer.get('digest')} declares size {size} bytes, over the "
                    f"{ONE_LAYER_COMPRESSED_CAP} byte per-layer cap -- refusing to download"
                )
            total_declared += size
        if total_declared > TOTAL_LAYER_COMPRESSED_CAP:
            raise CollectorError(
                f"{ref}'s layers declare {total_declared} bytes total, over the "
                f"{TOTAL_LAYER_COMPRESSED_CAP} byte total-compressed cap -- refusing to download"
            )

        all_findings = []
        for layer in layers:
            digest = layer["digest"]
            with tempfile.TemporaryDirectory(prefix="layer-secret-scan-") as workdir:
                workdir_path = pathlib.Path(workdir)
                blob_path = workdir_path / "layer.tar.gz"

                blob_proc = subprocess.run(
                    ["crane", "blob", f"{ref}@{digest}"],
                    capture_output=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
                )
                if blob_proc.returncode != 0:
                    raise CollectorError(f"crane blob exited {blob_proc.returncode} for {digest}: "
                                          f"{blob_proc.stderr.decode('utf-8', 'replace')[:2000]}")
                blob_path.write_bytes(blob_proc.stdout)

                extracted_dir = workdir_path / "extracted"
                extracted_dir.mkdir()
                total_extracted_bytes = 0
                file_count = 0
                try:
                    with tarfile.open(blob_path, mode="r:gz") as tf:
                        for member in tf:
                            if member.isfile():
                                total_extracted_bytes += member.size
                                file_count += 1
                            if total_extracted_bytes > TOTAL_DECOMPRESSED_CAP:
                                raise CollectorError(
                                    f"layer {digest} exceeded the {TOTAL_DECOMPRESSED_CAP} byte "
                                    f"decompressed cap while extracting -- stopping immediately"
                                )
                            if file_count > MAX_EXTRACTED_FILE_COUNT:
                                raise CollectorError(
                                    f"layer {digest} exceeded the {MAX_EXTRACTED_FILE_COUNT} file "
                                    f"cap while extracting -- stopping immediately"
                                )
                        tf.extractall(extracted_dir, filter="data")
                except tarfile.TarError as exc:
                    raise CollectorError(f"layer {digest} did not extract as a tar/gzip stream: {exc}") from exc

                # Whiteouts are deliberately NOT applied here -- that is the entire point of a
                # per-layer scan (design doc 3.3: catches a secret deleted in a later layer, still
                # present and extractable in this one).
                all_findings.extend(_run_trivy_fs_secret(str(extracted_dir), ruleset_path))

    findings, truncated = _cap_findings(all_findings)

    return {
        "scanner": {"name": "trivy", "version": _trivy_version()},
        "ruleset": ruleset,
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python collect-secret-scan.test.py`
Expected: `passed=6 failed=0` (3 from Task 2 + 3 from this task's additions). If the missing-tarball case
fails with a raw `FileNotFoundError`/`CollectorError` from a different call site than expected, trace
which subprocess call raised first — `local_registry_ref`'s own `crane push` is the first thing that
touches the tarball path, so it should be the one to raise, and its `CollectorError` propagates
unchanged (per this plan's Interfaces section — `collect-secret-scan.py` does not re-wrap
`local-registry.py`'s errors).

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collect-secret-scan.py .github/scripts/collect-secret-scan.test.py
git commit -m "feat(ci): collect a layerSecretScan predicate via crane blob + Trivy, with byte caps enforced"
```

---

## Explicitly out of scope for this plan

- Flyway inventory (slice 3) and observation assembly (slice 4) — separate plans, same pattern.
- Anything pushing to GHCR (slice 5).
- Enforcing these same byte caps on the *decision* side when it later reads back a published
  attestation from a real registry — `publish-decision.sh` does not do this today (confirmed: no byte
  cap constants exist there), and adding it is a `publish-decision.sh` change, not a collector change;
  out of scope here, worth a follow-up plan of its own if the team decides it's needed before slice 5.

## Self-Review Notes

- Spec coverage: design doc §3.3 (tools/extraction method), §3.3a (byte caps/timeout — Task 3's
  per-layer caps, Task 2/3's 20-minute `SCAN_TIMEOUT_SECONDS`), §3.3b (verified real crane/trivy
  behavior — the registry helper in Task 1, the `Class == "secret"` absence handling in
  `_run_trivy_fs_secret`) are each implemented by a specific task above. The `evidenceSetDigest`/
  observation-assembly side of things is explicitly out of scope (a later slice).
- Placeholder scan: no TBD/TODO in this plan — the two places slice 1 needed a "confirm on a real run"
  step (Task 2 Step 1 here) give an exact command and say exactly what to read off the output, matching
  slice 1's Task 3 Step 1 pattern rather than leaving it open-ended.
- Type consistency: `collect_filesystem_secret_scan`/`collect_layer_secret_scan` both take
  `(tarball_path: str, image_name: str, ruleset_path: str)` and return the same predicate-document
  shape (`scanner`, `ruleset`, `target`, `timestamp`, `findings`, `truncated`) — checked against both
  Task 2's and Task 3's actual code above, not just described in prose.
