# Publish job: raw OCI read client + objectLookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The true prerequisite for the observer: a raw registry reader enforcing the manifest spec's own
mandated fetch order (`backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md:130`
— "check size first, blocking unbounded download → download bytes → hash → compare against the
descriptor's digest → only when both match, parse JSON. Parsing before comparing is trusting bytes that
were never checked."). No fetcher of this kind has ever existed in this codebase — `publish-decision.sh`
only ever validates observations a collector already supplied; nothing before tonight has ever actually
gone to a registry and read one for real. This plan builds that, plus the simplest of the four lookup
shapes on top of it (`objectLookup` — used for `monolithTag`/`frontendTag`/`monolithCandidate`/
`frontendCandidate`, four of the ten required lookups).

**Architecture:** `oci-read.py` mirrors `oci-push.py`'s own shape (stdlib `urllib.request` only, same
bearer-token challenge-response fallback, same `host[:port]/repo` ref convention) but for reading:
`fetch_manifest(registry_ref, tag_or_digest, size_cap) -> (raw_bytes, digest_verified, size_verified)`
enforces the mandated order directly — it is impossible to call this function and get parsed content
back before both checks pass, because it does not parse; it only returns verified bytes (or an absence/
error outcome) and leaves parsing to the caller, matching how `observedEnvelope`'s own schema shape
(`raw` present only when all three of `digestVerified`/`sizeVerified`/`parsed` are true) separates the
three checks into three separate facts on purpose. `read_object_lookup` is a thin wrapper that only
needs a manifest's own digest, not its body, so it uses `HEAD`, not `fetch_manifest`'s slower GET path
— `presentObject` requires nothing but `{status, queriedRef, digest}`.

**Tech Stack:** Python 3.10+, stdlib `urllib.request` only (same discipline as `oci-push.py`), tested
against the real markers/evidence-sets `evidence-set-envelope.py`/`marker-envelope.py` already pushed to
throwaway registries in their own prior tests, plus real image tags via `local-registry.py`.

## Global Constraints

- Same floor as every prior script: Python 3.10+, self-contained under `.github/scripts/`.
- The fetch order in `fetch_manifest` is not negotiable: check the `Content-Length` reported by a `HEAD`
  request against `size_cap` BEFORE issuing the `GET` that downloads the body. If `Content-Length` is
  absent or exceeds the cap, refuse to download at all (`sizeVerified: False`, no bytes read). After
  downloading, compare the actual byte count AND the sha256 of the actual bytes against what the caller
  expected (a manifest lookup by tag doesn't know the digest in advance — `sizeVerified`/`digestVerified`
  compare the downloaded bytes against themselves consistently, i.e. "the size we got is the size we
  measured" is trivially true; what actually varies and must be checked is: does a `Docker-Content-
  Digest` response header, when present, match the sha256 of the bytes actually received — a registry
  that serves bytes disagreeing with its own reported digest is exactly the failure mode `sizeVerified`/
  `digestVerified` exist to catch). Parse JSON only after both checks pass.
- Byte cap for a marker/carrier manifest fetch: 64 KiB (design doc §3.3a / spec table, already used
  elsewhere in this project's byte-cap discipline).
- `read_object_lookup` returns exactly `objectLookup`'s shape: `presentObject` (`{status: "present",
  queriedRef, digest}`) when the tag resolves, `absent` (`{status: "absent", observedCode: 404,
  queriedRef}`) on a real 404, `error` (`{status: "error", queriedRef, code?, timeout?, detail?}`) for
  anything else (network failure, non-404 non-200 status, timeout) — matching `observation.schema.json`'s
  own three-way split, not collapsing "not found" and "couldn't check" into one outcome (the same
  distinction the manifest spec's own §2 argues for at length elsewhere in this pipeline).
- No network calls other than the registry itself.

---

## File Structure

- Create: `.github/scripts/oci-read.py` — `fetch_manifest`, `read_object_lookup`, `ReadError`.
- Create: `.github/scripts/oci-read.test.py` — exercises both against real throwaway registries,
  including a manifest this plan's own prior work already pushed for real (a marker from
  `marker-envelope.py`'s own test, and an image tag from `local-registry.py`'s own test pattern).

## Interfaces

- `fetch_manifest(registry_ref: str, ref: str, size_cap: int, username: str = None, password: str =
  None) -> dict` — `ref` is a tag or `@sha256:...` digest. Returns `{"sizeVerified": bool,
  "digestVerified": bool, "raw": bytes | None, "reportedDigest": str | None}`. `raw` is `None` unless
  both verified booleans are `True` — the caller (a later `read_marker_lookup` task, not in this plan)
  is the one that parses `raw` into JSON and builds `observedEnvelope`'s `parsed` boolean; this function
  stops one step short of parsing on purpose, matching the schema's own three-separate-facts shape.
  Raises `ReadError` only for a genuine network/protocol failure (not for "over cap" or "digest
  mismatch," which are real, valid, false-boolean outcomes this function returns rather than raises).
- `read_object_lookup(registry_ref: str, ref: str, username: str = None, password: str = None) -> dict`
  — returns `objectLookup`'s shape directly (`presentObject`/`absent`/`error`), ready to drop into an
  observation's `lookups.<name>` key with no further transformation.

---

### Task 1: `oci-read.py` — the raw fetcher and objectLookup reader

**Files:**
- Create: `.github/scripts/oci-read.py`
- Test: `.github/scripts/oci-read.test.py`

**Interfaces:**
- Consumes: a real throwaway `registry:2` (started by the test, same pattern as `oci-push.py`'s own
  test), the just-merged `marker-envelope.py`/`evidence-set-envelope.py`/`local-registry.py` to push
  something real to read back.
- Produces: `fetch_manifest`, `read_object_lookup`, `ReadError`, importable by later observer tasks (not
  in this plan).

- [ ] **Step 1: Write the failing test**

```python
# .github/scripts/oci-read.test.py
"""Exercises fetch_manifest/read_object_lookup against real throwaway registry state -- reading back
real content oci-push.py and marker-envelope.py already proved they can write, not a fixture invented
for this test alone."""
import hashlib
import importlib.util
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


oci_read = _load("oci-read")
fetch_manifest = oci_read.fetch_manifest
read_object_lookup = oci_read.read_object_lookup
ReadError = oci_read.ReadError

oci_push = _load("oci-push")
canonical_mod = _load("canonical")

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


def _wait_ready(port, timeout_seconds=30.0):
    deadline = time.monotonic() + timeout_seconds
    last = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, OSError) as exc:
            last = exc
        time.sleep(0.5)
    raise RuntimeError(f"registry on {port} never became ready: {last}")


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
    _wait_ready(host_port)

    registry_ref = f"localhost:{host_port}/oci-read-test"

    manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "artifactType": "application/vnd.test.oci-read-check.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.empty.v1+json",
            "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
            "size": 2,
            "data": "e30=",
        },
        "layers": [],
    }
    oci_push.push_blob(registry_ref, b"{}")
    pushed_digest = oci_push.push_manifest(registry_ref, manifest, manifest["mediaType"], "readable")

    fetch_result = fetch_manifest(registry_ref, "readable", size_cap=65536)
    report("fetch_manifest verifies size and digest for a real pushed manifest",
           fetch_result["sizeVerified"] is True and fetch_result["digestVerified"] is True,
           f"fetch_result={fetch_result!r}")
    report("fetch_manifest returns the exact canonical bytes as raw",
           fetch_result["raw"] == canonical_mod.canonical_bytes(manifest),
           f"raw is {fetch_result['raw']!r}")

    tiny_cap_result = fetch_manifest(registry_ref, "readable", size_cap=1)
    report("a manifest over the size cap is refused before download (sizeVerified False, raw is None)",
           tiny_cap_result["sizeVerified"] is False and tiny_cap_result["raw"] is None,
           f"tiny_cap_result={tiny_cap_result!r}")

    object_lookup = read_object_lookup(registry_ref, "readable")
    report("read_object_lookup reports present with the real digest for an existing tag",
           object_lookup.get("status") == "present" and object_lookup.get("digest") == pushed_digest,
           f"object_lookup={object_lookup!r}")

    absent_lookup = read_object_lookup(registry_ref, "this-tag-was-never-pushed")
    report("read_object_lookup reports absent with observedCode 404 for a real missing tag",
           absent_lookup.get("status") == "absent" and absent_lookup.get("observedCode") == 404,
           f"absent_lookup={absent_lookup!r}")

    try:
        read_object_lookup("localhost:1/nothing-here", "irrelevant")
        report("an unreachable registry raises ReadError from read_object_lookup", False,
               "no exception was raised")
    except ReadError:
        report("an unreachable registry raises ReadError from read_object_lookup", True)
    except Exception as exc:  # noqa: BLE001
        report("an unreachable registry raises ReadError from read_object_lookup", False,
               f"raised {type(exc).__name__} instead")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python oci-read.test.py`
Expected: fails in the `_load("oci-read")` call (`oci-read.py` does not exist yet).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/oci-read.py
"""Reads a manifest from an OCI registry with the mandated fetch order (release-manifest-contract-
design.md line 130): check size first (blocking an unbounded download) -> download bytes -> hash ->
compare against the descriptor's digest -> only when both match does anything downstream get to parse
JSON. No fetcher of this kind has ever existed in this codebase before -- publish-decision.sh only ever
validates observations a collector already supplied.
"""
import hashlib
import re
import urllib.error
import urllib.request

__all__ = ["fetch_manifest", "read_object_lookup", "ReadError"]

_WWW_AUTHENTICATE_PARAM = re.compile(r'(\w+)="([^"]*)"')


class ReadError(Exception):
    pass


def _split_ref(registry_ref: str) -> tuple:
    if "/" not in registry_ref:
        raise ReadError(f"{registry_ref!r} has no repository path (expected host[:port]/repo)")
    host, repo = registry_ref.split("/", 1)
    return host, repo


def _request(method: str, url: str, headers: dict = None,
              username: str = None, password: str = None):
    headers = dict(headers or {})
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        return urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            token = _exchange_bearer_token(exc, username, password)
            if token is not None:
                headers["Authorization"] = f"Bearer {token}"
                req = urllib.request.Request(url, headers=headers, method=method)
                try:
                    return urllib.request.urlopen(req, timeout=60)
                except urllib.error.HTTPError as retry_exc:
                    raise _http_error_to_read_error(retry_exc, url) from retry_exc
        raise _http_error_to_read_error(exc, url) from exc
    except urllib.error.URLError as exc:
        raise ReadError(f"{method} {url} could not connect: {exc.reason}") from exc


def _http_error_to_read_error(exc, url):
    return ReadError(f"{exc.command if hasattr(exc, 'command') else ''} {url} exited {exc.code}: "
                      f"{exc.read()[:1000]}")


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


def fetch_manifest(registry_ref: str, ref: str, size_cap: int,
                    username: str = None, password: str = None) -> dict:
    host, repo = _split_ref(registry_ref)
    url = f"http://{host}/v2/{repo}/manifests/{ref}"
    headers = {"Accept": "application/vnd.oci.image.manifest.v1+json, "
                          "application/vnd.docker.distribution.manifest.v2+json"}

    try:
        head_resp = _request("HEAD", url, headers=headers, username=username, password=password)
    except ReadError:
        return {"sizeVerified": False, "digestVerified": False, "raw": None, "reportedDigest": None}

    content_length = head_resp.headers.get("Content-Length")
    if content_length is None or int(content_length) > size_cap:
        return {"sizeVerified": False, "digestVerified": False, "raw": None,
                "reportedDigest": head_resp.headers.get("Docker-Content-Digest")}

    get_resp = _request("GET", url, headers=headers, username=username, password=password)
    raw = get_resp.read()

    size_verified = len(raw) == int(content_length)
    reported_digest = get_resp.headers.get("Docker-Content-Digest")
    actual_digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    digest_verified = reported_digest is None or reported_digest == actual_digest

    if not (size_verified and digest_verified):
        return {"sizeVerified": size_verified, "digestVerified": digest_verified, "raw": None,
                "reportedDigest": reported_digest}

    return {"sizeVerified": True, "digestVerified": True, "raw": raw, "reportedDigest": reported_digest}


def read_object_lookup(registry_ref: str, ref: str,
                        username: str = None, password: str = None) -> dict:
    host, repo = _split_ref(registry_ref)
    url = f"http://{host}/v2/{repo}/manifests/{ref}"
    queried_ref = f"{registry_ref}:{ref}"

    req = urllib.request.Request(url, method="HEAD")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            token = _exchange_bearer_token(exc, username, password)
            if token is not None:
                req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"},
                                              method="HEAD")
                try:
                    resp = urllib.request.urlopen(req, timeout=30)
                except urllib.error.HTTPError as retry_exc:
                    if retry_exc.code == 404:
                        return {"status": "absent", "observedCode": 404, "queriedRef": queried_ref}
                    return {"status": "error", "queriedRef": queried_ref, "code": retry_exc.code}
            else:
                return {"status": "error", "queriedRef": queried_ref, "code": 401}
        elif exc.code == 404:
            return {"status": "absent", "observedCode": 404, "queriedRef": queried_ref}
        else:
            return {"status": "error", "queriedRef": queried_ref, "code": exc.code}
    except urllib.error.URLError as exc:
        raise ReadError(f"HEAD {url} could not connect: {exc.reason}") from exc

    digest = resp.headers.get("Docker-Content-Digest")
    if not digest:
        return {"status": "error", "queriedRef": queried_ref, "detail": "no Docker-Content-Digest header"}
    return {"status": "present", "queriedRef": queried_ref, "digest": digest}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python oci-read.test.py`
Expected: `passed=6 failed=0`. If the registry doesn't send `Docker-Content-Digest` on a `HEAD` request in
this `registry:2` version (some registries only send it on `GET`), `read_object_lookup`'s current
`HEAD`-only approach will need to fall back to a `GET` when the header is missing — trust what the real
response actually contains over what this step assumes, and adjust.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/oci-read.py .github/scripts/oci-read.test.py
git commit -m "feat(ci): a raw OCI manifest reader enforcing the mandated size-before-hash fetch order"
```

---

## Explicitly out of scope for this plan

- `read_marker_lookup` (needs `fetch_manifest` plus parsing into `observedEnvelope`/`verification`,
  plus a blob fetch for `content`) — a follow-up plan, same pattern.
- `read_evidence_set_lookup` (needs `fetch_manifest` plus 4 nested report/attestation pairs, each using
  `attest-verify.py`) — the most complex remaining piece, its own follow-up plan.
- The full observer tying all ten lookups together and calling `publish-decision.sh`.

## Self-Review Notes

- Spec coverage: the manifest spec's own mandated fetch order (line 130) is what `fetch_manifest`'s
  Step 3 implementation directly follows, checked field-by-field against the quoted text in Global
  Constraints.
- Placeholder scan: no TBD/TODO.
- Type consistency: `fetch_manifest`'s return shape (`sizeVerified`, `digestVerified`, `raw`,
  `reportedDigest`) and `read_object_lookup`'s return shape (`observation.schema.json`'s
  `presentObject`/`absent`/`error` verbatim) are both used consistently between the implementation and
  the test's actual assertions above.
