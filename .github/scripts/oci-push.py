# .github/scripts/oci-push.py
"""A minimal OCI Distribution API client: push a blob, push a manifest, nothing else.

Exists because neither tool already in this repo's toolchain can push a spec-compliant marker or
evidence-set manifest (design doc section 7a, confirmed for real 2026-08-11): `oras push` always adds
two annotations release-envelope.schema.json/observation.schema.json forbid outright, with no flag able
to suppress either; `crane push` only accepts a docker-save tarball of a real image, no path for an
arbitrary manifest with custom-media-type layers. Every byte this module sends is exactly what the
caller handed it -- no tool-injected surprises.
"""
import base64
import hashlib
import json
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


def _scheme_for(host: str) -> str:
    # Real registries (GHCR included) are HTTPS-only -- confirmed for real 2026-08-12, first CI run
    # against ghcr.io: a hardcoded http:// here (fine against the throwaway registry:2 containers
    # every test in this session uses, which serve plain HTTP) got a real 405 UNSUPPORTED from GHCR.
    # localhost/127.0.0.1 are the only hosts this module or its tests ever point at a plain-HTTP
    # registry, so they are the only ones that stay on http -- matching how docker/crane themselves
    # only treat local-looking hosts as insecure-by-default.
    bare_host = host.split(":", 1)[0]
    return "http" if bare_host in ("localhost", "127.0.0.1") else "https"


def _request(method: str, url: str, data: bytes = None, headers: dict = None,
             username: str = None, password: str = None):
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
        credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        token_headers["Authorization"] = f"Basic {credentials}"
    req = urllib.request.Request(token_url, headers=token_headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None
    return body.get("token") or body.get("access_token")


def push_blob(registry_ref: str, content: bytes, username: str = None, password: str = None) -> str:
    host, repo = _split_ref(registry_ref)
    scheme = _scheme_for(host)
    digest = "sha256:" + hashlib.sha256(content).hexdigest()

    head_url = f"{scheme}://{host}/v2/{repo}/blobs/{digest}"
    try:
        _request("HEAD", head_url, username=username, password=password)
        return digest  # already present -- idempotent, nothing more to do
    except PublishError:
        pass  # not found (or any other HEAD failure) -- fall through to upload

    start_url = f"{scheme}://{host}/v2/{repo}/blobs/uploads/"
    start_resp = _request("POST", start_url, username=username, password=password)
    location = start_resp.headers.get("Location")
    if not location:
        raise PublishError(f"POST {start_url} did not return a Location header to upload to")
    if location.startswith("/"):
        location = f"{scheme}://{host}{location}"
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
    scheme = _scheme_for(host)
    manifest_bytes = canonical.canonical_bytes(manifest_dict)
    expected_digest = "sha256:" + hashlib.sha256(manifest_bytes).hexdigest()

    url = f"{scheme}://{host}/v2/{repo}/manifests/{tag}"
    resp = _request("PUT", url, data=manifest_bytes, headers={"Content-Type": content_type},
                     username=username, password=password)
    reported_digest = resp.headers.get("Docker-Content-Digest")
    if reported_digest and reported_digest != expected_digest:
        raise PublishError(
            f"pushed manifest as {expected_digest} but registry reports {reported_digest} -- the "
            f"registry may have rewritten the bytes"
        )
    return expected_digest
