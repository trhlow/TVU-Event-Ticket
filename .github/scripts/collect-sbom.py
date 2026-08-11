# .github/scripts/collect-sbom.py
"""Wraps syft to produce an SPDX 2.3 SBOM from a docker-archive tarball.

Reads from a tarball, not a live image tag, because the tarball is the artifact the CI job already
built and tested (design doc section 3.0: the byte that was tested is the byte that ships) -- pulling
by tag would risk syft resolving a different image than the one under test if the daemon's tag moved
between build and collect.
"""
import hashlib
import json
import subprocess

import canonical

__all__ = ["collect_sbom", "CollectorError"]


class CollectorError(Exception):
    pass


def collect_sbom(tarball_path: str, image_name: str) -> dict:
    try:
        proc = subprocess.run(
            ["syft", f"docker-archive:{tarball_path}", "-o", "spdx-json"],
            capture_output=True, text=True, timeout=1200, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"syft is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"syft timed out scanning {tarball_path}") from exc

    if proc.returncode != 0:
        raise CollectorError(
            f"syft exited {proc.returncode} scanning {tarball_path} (image {image_name}): "
            f"{proc.stderr.strip()[:2000]}"
        )

    try:
        document = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"syft did not print valid JSON: {exc}") from exc

    if document.get("spdxVersion") != "SPDX-2.3":
        raise CollectorError(
            f"syft produced spdxVersion={document.get('spdxVersion')!r}, expected 'SPDX-2.3' -- "
            f"syft's default SPDX version may have changed; pin it explicitly if so"
        )

    packages = document.get("packages", [])
    if not isinstance(packages, list):
        raise CollectorError(f"SPDX document's 'packages' is {type(packages).__name__}, expected list")

    canonical_payload = canonical.canonical_bytes(document)
    return {
        "document": document,
        "packageCount": len(packages),
        "canonicalDigest": "sha256:" + hashlib.sha256(canonical_payload).hexdigest(),
        "canonicalSize": len(canonical_payload),
    }


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("usage: collect-sbom.py <tarball-path> <image-name>", file=sys.stderr)
        sys.exit(2)
    result = collect_sbom(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
