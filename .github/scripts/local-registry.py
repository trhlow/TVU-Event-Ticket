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
