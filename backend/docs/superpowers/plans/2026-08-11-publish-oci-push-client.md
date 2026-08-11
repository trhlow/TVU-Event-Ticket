# Publish job: raw OCI push client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal OCI Distribution API client (`oci-push.py`) that can push a blob and a manifest to a
registry with byte-for-byte control over what gets written — no tool-injected annotations, because
`oras push` (the only tool this project's own test comments anticipated) was confirmed for real
(design doc §7a) to always add two annotations `.github/contracts/release-envelope.schema.json`/
`observation.schema.json`'s §2 forbids outright, and `crane` has no path to push an arbitrary custom
manifest at all.

**Architecture:** One module, two public functions (`push_blob`, `push_manifest`), built directly on
`urllib.request` (stdlib only, matching every other collector script's "no extra dependency" rule) and
implementing the standard Docker Registry v2 / OCI Distribution API: a two-step blob upload (`POST` to
start, `PUT` to complete, `HEAD` first to skip if already present) and a manifest `PUT`. Supports both
plain HTTP (the throwaway local registries this whole project's tests already use) and the bearer-token
challenge-response flow real registries like GHCR require, detected automatically from a `401` response
rather than configured up front — so the exact same function works against `local-registry.py`'s
throwaway registry in every test here AND against GHCR later without a code branch for which one it's
talking to.

**Tech Stack:** Python 3.10+, stdlib `urllib.request`/`urllib.error`/`json`/`base64`/`hashlib` only.
`.github/scripts/canonical.py`'s `canonical_bytes` for computing manifest bytes (never `json.dumps`
directly — same rule as every other digest in this pipeline). Tested against a real `registry:2`
throwaway container (the same image `local-registry.py` already uses).

## Global Constraints

- Same floor as every other script: Python 3.10+, self-contained under `.github/scripts/`,
  `PYTHON_BIN` may need to be `python` not `python3` on Windows.
- **Verified real fact (2026-08-11, design doc §7a):** `oras push` cannot be used to write a marker or
  evidence-set manifest — it always adds `layers[N].annotations["org.opencontainers.image.title"]` and
  manifest-level `annotations["org.opencontainers.image.created"]`, confirmed with no flag (including an
  empty `--annotation-file`) able to suppress either, and both trip `publish-decision.sh`'s
  annotations-forbidden guard into CONFLICT. `crane` has no subcommand for pushing an arbitrary manifest
  with custom-media-type layers at all (`crane push` only accepts a `docker save` tarball of a real
  image). This module exists specifically because neither existing tool in this repo's toolchain can do
  this job.
- The manifest bytes actually sent over the wire in the `PUT` request body must be exactly
  `canonical.canonical_bytes(manifest_dict)` — never a second `json.dumps` of the same dict, and never
  the registry's own re-serialization (registries store the literal bytes given to them; this project's
  own `markerDigest`/evidence-set digest verification later depends on reading back and re-hashing those
  exact bytes, established throughout the 3a/3b epic).
- No annotations anywhere this module writes on the caller's behalf. If a caller wants annotations
  (nothing in this design does), that is a value in the dict they pass in — this module never adds one
  itself, unlike `oras push`.
- Auth: try the request unauthenticated first. On a `401` response, parse the `WWW-Authenticate` header
  for `realm`, `service`, `scope`, request a bearer token from that realm (optionally with Basic auth
  credentials if the caller provided a username/password), retry the original request with
  `Authorization: Bearer <token>`. This is the standard flow every registry (Docker Hub, GHCR, a local
  `registry:2` with a token backend) speaks — a local throwaway `registry:2` container run with no auth
  config simply never returns `401`, so the same code path exercises cleanly against it without a
  special "local mode."
- No network calls other than the registry itself (pulling `registry:2` for the test fixture if not
  cached, and the registry HTTP calls this module makes on purpose).

---

## File Structure

- Create: `.github/scripts/oci-push.py` — `push_blob`, `push_manifest`, `PublishError`.
- Create: `.github/scripts/oci-push.test.py` — exercises both against a real throwaway `registry:2`.

## Interfaces

- `push_blob(registry_ref: str, content: bytes) -> str` — `registry_ref` is `host[:port]/repository`
  (no tag — a blob has no tag, only a digest). Computes the blob's digest from `content` itself
  (`sha256:` + hexdigest), checks with `HEAD` whether it already exists (skips the upload if so —
  idempotent, matching how every collector in this pipeline already treats re-runs), otherwise uploads
  it via the two-step POST/PUT flow. Returns the digest string. Raises `PublishError` on any HTTP
  failure or a digest mismatch between what was computed and what the registry reports back.
- `push_manifest(registry_ref: str, manifest_dict: dict, content_type: str, tag: str) -> str` —
  canonicalizes `manifest_dict` via `canonical.canonical_bytes`, `PUT`s it to `/v2/<repo>/manifests/<tag>`
  with the given `Content-Type`, returns the digest the registry assigns (read from the response's
  `Docker-Content-Digest` header, cross-checked against a locally computed `sha256` of the exact bytes
  sent — a mismatch here means the registry silently rewrote something, which must be a loud failure,
  not a value later code trusts blindly). Raises `PublishError` on any HTTP failure or a digest mismatch.
- Both functions accept optional `username: str | None = None, password: str | None = None` keyword
  arguments for the bearer-token exchange's Basic-auth step (unused against an unauthenticated local
  registry; this is what a later publish-job task will pass a GHCR token through as).

---

### Task 1: `oci-push.py` — blob and manifest push with bearer-token fallback

**Files:**
- Create: `.github/scripts/oci-push.py`
- Test: `.github/scripts/oci-push.test.py`

**Interfaces:**
- Consumes: a real throwaway `registry:2` container (started by the test itself, not by
  `local-registry.py` — that module is specifically for staging a pre-built image tarball for `crane`;
  this test pushes raw bytes with no image involved, so it manages its own throwaway registry directly).
- Produces: `push_blob`, `push_manifest`, `PublishError`, importable by a later evidence-set/marker
  writer task (not in this plan).

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/oci-push.test.py
"""Exercises push_blob/push_manifest against a real throwaway registry:2 -- not mocked, because the
entire point is proving the exact bytes sent are the exact bytes a real registry stores and reports
back, which a mock cannot do."""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location("oci_push", HERE / "oci-push.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
push_blob = _module.push_blob
push_manifest = _module.push_manifest
PublishError = _module.PublishError

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


def _wait_for_registry(port, timeout_seconds=30.0):
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise RuntimeError(f"registry on port {port} never became ready: {last_error}")


container_id = None
try:
    run_proc = subprocess.run(
        ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", "registry:2"],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if run_proc.returncode != 0:
        report("throwaway registry starts", False, run_proc.stderr.strip()[:500])
        print(f"\npassed={passed} failed={failed}")
        sys.exit(1)
    container_id = run_proc.stdout.strip()

    port_proc = subprocess.run(["docker", "port", container_id, "5000/tcp"],
                                capture_output=True, text=True, timeout=30, check=False)
    host_port = port_proc.stdout.strip().splitlines()[0].rsplit(":", 1)[1]
    _wait_for_registry(host_port)

    registry_ref = f"localhost:{host_port}/oci-push-test"

    content = b'{"hello": "oci-push"}'
    expected_digest = "sha256:" + hashlib.sha256(content).hexdigest()

    digest = push_blob(registry_ref, content)
    report("push_blob returns the correct digest", digest == expected_digest,
           f"got {digest!r}, expected {expected_digest!r}")

    digest_again = push_blob(registry_ref, content)
    report("pushing the same blob twice is idempotent (same digest, no error)",
           digest_again == expected_digest, f"got {digest_again!r}")

    manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "artifactType": "application/vnd.test.oci-push-check.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.empty.v1+json",
            "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
            "size": 2,
            "data": "e30=",
        },
        "layers": [{
            "mediaType": "application/vnd.test.oci-push-check.layer.v1+json",
            "digest": digest,
            "size": len(content),
        }],
    }
    push_blob(registry_ref, b"{}")  # the empty config blob, must exist before the manifest references it

    import sys as _sys
    _sys.path.insert(0, str(HERE))
    import canonical
    manifest_bytes = canonical.canonical_bytes(manifest)
    expected_manifest_digest = "sha256:" + hashlib.sha256(manifest_bytes).hexdigest()

    manifest_digest = push_manifest(registry_ref, manifest, manifest["mediaType"], "check")
    report("push_manifest returns the correct digest",
           manifest_digest == expected_manifest_digest,
           f"got {manifest_digest!r}, expected {expected_manifest_digest!r}")

    # Read it back with a plain HTTP GET (no oras/crane involved) and confirm the registry stored the
    # EXACT canonical bytes -- not a re-serialized copy that happens to be JSON-equal but byte-different.
    req = urllib.request.Request(
        f"http://localhost:{host_port}/v2/oci-push-test/manifests/check",
        headers={"Accept": manifest["mediaType"]},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        stored_bytes = resp.read()
    report("the registry stored the exact canonical bytes, not a re-serialized copy",
           stored_bytes == manifest_bytes,
           f"stored {len(stored_bytes)} bytes, expected {len(manifest_bytes)} bytes; "
           f"first diff at {next((i for i, (a, b) in enumerate(zip(stored_bytes, manifest_bytes)) if a != b), 'no diff in common prefix')}")

    report("the stored manifest carries no annotations key anywhere (unlike oras push's default)",
           "annotations" not in json.loads(stored_bytes)
           and all("annotations" not in layer for layer in json.loads(stored_bytes).get("layers", [])),
           f"stored manifest: {json.loads(stored_bytes)}")

    # Negative case: pushing to an address nothing is listening on must raise PublishError, not hang
    # or crash with a bare socket traceback a caller wouldn't know to catch.
    try:
        push_blob("localhost:1/nothing-here", b"irrelevant")
        report("pushing to an unreachable registry raises PublishError", False, "no exception was raised")
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

Run: `cd .github/scripts && python oci-push.test.py`
Expected: fails in the `importlib` load (`oci-push.py` does not exist yet).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/oci-push.py
"""A minimal OCI Distribution API client: push a blob, push a manifest, nothing else.

Exists because neither tool already in this repo's toolchain can push a spec-compliant marker or
evidence-set manifest (design doc section 7a, confirmed for real 2026-08-11): `oras push` always adds
two annotations release-envelope.schema.json/observation.schema.json forbid outright, with no flag able
to suppress either; `crane push` only accepts a docker-save tarball of a real image, no path for an
arbitrary manifest with custom-media-type layers. Every byte this module sends is exactly what the
caller handed it -- no tool-injected surprises.
"""
import hashlib
import re
import urllib.error
import urllib.request

import canonical

__all__ = ["push_blob", "push_manifest", "PublishError"]

_WWW_AUTHENTICATE_PARAM = re.compile(r'(\w+)="([^"]*)"')


class PublishError(Exception):
    pass


def _split_ref(registry_ref: str) -> tuple:
    if "/" not in registry_ref:
        raise PublishError(f"{registry_ref!r} has no repository path (expected host[:port]/repo)")
    host, repo = registry_ref.split("/", 1)
    return host, repo


def _request(method: str, url: str, data: bytes = None, headers: dict = None,
             username: str = None, password: str = None) -> "urllib.request.addinfourl":
    headers = dict(headers or {})
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        return urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            token = _exchange_bearer_token(exc, username, password)
            if token is None:
                raise PublishError(f"{method} {url} got 401 and no bearer token could be obtained: "
                                    f"{exc.read()[:1000]}") from exc
            headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                return urllib.request.urlopen(req, timeout=60)
            except urllib.error.HTTPError as retry_exc:
                raise PublishError(f"{method} {url} exited {retry_exc.code} after bearer auth: "
                                    f"{retry_exc.read()[:2000]}") from retry_exc
        raise PublishError(f"{method} {url} exited {exc.code}: {exc.read()[:2000]}") from exc
    except urllib.error.URLError as exc:
        raise PublishError(f"{method} {url} could not connect: {exc.reason}") from exc


def _exchange_bearer_token(unauthorized_exc, username, password):
    challenge = unauthorized_exc.headers.get("WWW-Authenticate", "")
    if not challenge.lower().startswith("bearer "):
        return None
    params = dict(_WWW_AUTHENTICATE_PARAM.findall(challenge))
    realm = params.get("realm")
    if not realm:
        return None
    query = "&".join(f"{k}={v}" for k, v in params.items() if k in ("service", "scope"))
    token_url = f"{realm}?{query}" if query else realm
    token_headers = {}
    if username is not None and password is not None:
        import base64
        credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        token_headers["Authorization"] = f"Basic {credentials}"
    req = urllib.request.Request(token_url, headers=token_headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            import json
            body = json.loads(resp.read())
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None
    return body.get("token") or body.get("access_token")


def push_blob(registry_ref: str, content: bytes, username: str = None, password: str = None) -> str:
    host, repo = _split_ref(registry_ref)
    digest = "sha256:" + hashlib.sha256(content).hexdigest()

    head_url = f"http://{host}/v2/{repo}/blobs/{digest}"
    try:
        _request("HEAD", head_url, username=username, password=password)
        return digest  # already present -- idempotent, nothing more to do
    except PublishError:
        pass  # not found (or any other HEAD failure) -- fall through to upload

    start_url = f"http://{host}/v2/{repo}/blobs/uploads/"
    start_resp = _request("POST", start_url, username=username, password=password)
    location = start_resp.headers.get("Location")
    if not location:
        raise PublishError(f"POST {start_url} did not return a Location header to upload to")
    if location.startswith("/"):
        location = f"http://{host}{location}"
    separator = "&" if "?" in location else "?"
    upload_url = f"{location}{separator}digest={digest}"

    put_resp = _request("PUT", upload_url, data=content,
                         headers={"Content-Type": "application/octet-stream"},
                         username=username, password=password)
    reported_digest = put_resp.headers.get("Docker-Content-Digest")
    if reported_digest and reported_digest != digest:
        raise PublishError(f"pushed blob as {digest} but registry reports {reported_digest}")
    return digest


def push_manifest(registry_ref: str, manifest_dict: dict, content_type: str, tag: str,
                   username: str = None, password: str = None) -> str:
    host, repo = _split_ref(registry_ref)
    manifest_bytes = canonical.canonical_bytes(manifest_dict)
    expected_digest = "sha256:" + hashlib.sha256(manifest_bytes).hexdigest()

    url = f"http://{host}/v2/{repo}/manifests/{tag}"
    resp = _request("PUT", url, data=manifest_bytes, headers={"Content-Type": content_type},
                     username=username, password=password)
    reported_digest = resp.headers.get("Docker-Content-Digest")
    if reported_digest and reported_digest != expected_digest:
        raise PublishError(
            f"pushed manifest as {expected_digest} but registry reports {reported_digest} -- the "
            f"registry may have rewritten the bytes"
        )
    return expected_digest
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python oci-push.test.py`
Expected: `passed=7 failed=0`. If the `HEAD` idempotency check misbehaves (some registries return a
non-404 error code for a missing blob rather than a clean 404), the `except PublishError: pass` in
`push_blob` already treats any `HEAD` failure as "not present, try uploading" — if the real
`registry:2` behaves differently than assumed here, trust the real HTTP status observed and adjust,
noting the discrepancy.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/oci-push.py .github/scripts/oci-push.test.py
git commit -m "feat(ci): a minimal OCI push client, since oras/crane can't write a spec-compliant manifest"
```

---

## Explicitly out of scope for this plan

- Building the actual evidence-set manifest (4 evidence layers + subject) or marker envelope push — a
  follow-up task/plan reusing `push_blob`/`push_manifest` plus `envelope.py`'s existing
  `envelope_for`/`marker_digest`.
- Real GHCR authentication end to end — this plan's bearer-token code path is written to the documented
  Docker Registry v2 / OCI Distribution spec and exercises the unauthenticated branch for real (a local
  `registry:2` with no auth backend never returns 401), but the authenticated branch against a real
  GHCR endpoint has not been exercised against a live server in this plan — that will happen for real
  the first time a CI job with `permissions: packages: write` actually runs this code, the same way
  `local-registry.py`'s registry-native crane calls were first exercised for real in prior slices'
  local tests before ever running in CI.
- Wiring anything into `.github/workflows/ci.yml` or touching `main`/GHCR for real.

## Self-Review Notes

- Spec coverage: design doc §7a (the oras/crane finding) is what this whole plan exists to answer.
- Placeholder scan: no TBD/TODO. The bearer-token exchange is fully implemented, not stubbed, even
  though this plan's own test can't exercise the authenticated branch (no real GHCR credentials
  available locally) — the code path exists and is correct per spec, just untested end-to-end here, and
  that gap is stated explicitly above rather than hidden.
- Type consistency: `push_blob`/`push_manifest` both take `registry_ref: str` in the same
  `host[:port]/repository` shape (no tag on `push_blob`, tag as a separate parameter on
  `push_manifest`) — checked against both the implementation and the test's actual calls above.
