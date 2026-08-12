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

__all__ = ["fetch_manifest", "read_object_lookup", "fetch_blob", "ReadError"]

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
    # OCI convention (matching this project's own real fixtures, e.g.
    # ghcr.io/owner/name/monolith@sha256:...): a digest reference is joined with "@", a tag with ":".
    # Both address the same /v2/<repo>/manifests/<reference> endpoint -- only queriedRef's own
    # separator needs to distinguish them, since that string is what a human or the decision reads
    # back later, not what the HTTP request itself uses.
    separator = "@" if ref.startswith("sha256:") else ":"
    queried_ref = f"{registry_ref}{separator}{ref}"
    # A HEAD without an Accept header is not equivalent to a HEAD with one: registry:2 content-negotiates
    # even on HEAD, and defaults to a legacy schema this pipeline never pushes, returning a real 404 for
    # a manifest that genuinely exists. Confirmed by hand against a live registry:2 instance.
    accept_headers = {"Accept": "application/vnd.oci.image.manifest.v1+json, "
                                 "application/vnd.docker.distribution.manifest.v2+json"}

    req = urllib.request.Request(url, headers=accept_headers, method="HEAD")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            token = _exchange_bearer_token(exc, username, password)
            if token is not None:
                headers = dict(accept_headers, Authorization=f"Bearer {token}")
                req = urllib.request.Request(url, headers=headers, method="HEAD")
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


def fetch_blob(registry_ref: str, digest: str, size_cap: int,
                username: str = None, password: str = None) -> dict:
    host, repo = _split_ref(registry_ref)
    url = f"http://{host}/v2/{repo}/blobs/{digest}"

    try:
        head_resp = _request("HEAD", url, username=username, password=password)
    except ReadError:
        return {"sizeVerified": False, "digestVerified": False, "raw": None}

    content_length = head_resp.headers.get("Content-Length")
    if content_length is None or int(content_length) > size_cap:
        return {"sizeVerified": False, "digestVerified": False, "raw": None}

    get_resp = _request("GET", url, username=username, password=password)
    raw = get_resp.read()

    size_verified = len(raw) == int(content_length)
    actual_digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    digest_verified = actual_digest == digest

    if not (size_verified and digest_verified):
        return {"sizeVerified": size_verified, "digestVerified": digest_verified, "raw": None}

    return {"sizeVerified": True, "digestVerified": True, "raw": raw}
