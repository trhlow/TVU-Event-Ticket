"""The throwaway `registry:2` the publish-contract suites push to.

Ten suites had their own copy of this, and every copy was wrong in the same direction: it trusted
the setup steps and only noticed a problem much later, somewhere unrelated.

  * Eight never checked `docker run`. A failed start leaves `container_id` empty, `docker port ""`
    then prints nothing, and `.splitlines()[0]` raises `IndexError: list index out of range` --
    naming neither docker nor the image nor the real cause.
  * All ten took `docker port` on faith the same way.
  * Eight let the readiness loop simply run out and carry on. The test then pushed to a registry
    that was never listening and died at `crane push` with **connection refused**, thirty lines and
    several seconds away from the actual failure.

That last one is not hypothetical. During this branch's work a stale container made two suites fail
exactly like that, and "connection refused" from a push is indistinguishable from a flaky test --
it was read as one, twice, before the cause was found. A fixture that says "the registry never
became ready" costs nothing and ends that guess.

Setup failures raise. They are not test failures -- nothing was tested -- and reporting them as
`failed=1` would put them in the same bucket as a genuine contract violation.
"""

import subprocess
import time
import urllib.error
import urllib.request

REGISTRY_IMAGE = "registry:2"


class RegistryFixtureError(RuntimeError):
    """The fixture could not be brought up. The suite never got as far as testing anything."""


def start_local_registry(ready_timeout_seconds=30.0):
    """Starts a registry on a random loopback port and waits until it answers.

    Returns ``(container_id, host_port)``. Raises :class:`RegistryFixtureError` on any failure,
    having already removed the container if one was started -- a fixture that fails and leaks is
    worse than one that fails.
    """
    run_proc = subprocess.run(
        ["docker", "run", "-d", "--rm", "-p", "127.0.0.1:0:5000", REGISTRY_IMAGE],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if run_proc.returncode != 0:
        raise RegistryFixtureError(
            f"docker run {REGISTRY_IMAGE} exited {run_proc.returncode}: "
            f"{run_proc.stderr.strip()[:500]}"
        )
    container_id = run_proc.stdout.strip()
    if not container_id:
        raise RegistryFixtureError(
            f"docker run {REGISTRY_IMAGE} exited 0 but printed no container id; "
            f"stderr: {run_proc.stderr.strip()[:500]}"
        )

    try:
        host_port = _published_port(container_id)
        _wait_until_ready(host_port, ready_timeout_seconds)
    except BaseException:
        # Including KeyboardInterrupt: a container left behind by an interrupted run is the very
        # thing that produced the false "flaky" failures described above.
        stop_local_registry(container_id)
        raise

    return container_id, host_port


def _published_port(container_id):
    port_proc = subprocess.run(
        ["docker", "port", container_id, "5000/tcp"],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if port_proc.returncode != 0:
        raise RegistryFixtureError(
            f"docker port {container_id} exited {port_proc.returncode}: "
            f"{port_proc.stderr.strip()[:500]}"
        )
    lines = port_proc.stdout.strip().splitlines()
    if not lines:
        raise RegistryFixtureError(
            f"docker port {container_id} printed nothing, so the container published no port"
        )
    # docker port may print one line per address family; the host port is the same on both, so the
    # first line is enough. rsplit on the last colon because an IPv6 address contains colons too.
    _, _, port = lines[0].rpartition(":")
    if not port.isdigit():
        raise RegistryFixtureError(
            f"could not read a port number out of docker port's output: {lines[0]!r}"
        )
    return port


def _wait_until_ready(host_port, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    return
                last_error = f"HTTP {resp.status}"
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise RegistryFixtureError(
        f"the registry on port {host_port} never answered /v2/ within {timeout_seconds:g}s; "
        f"last error: {last_error}"
    )


def stop_local_registry(container_id):
    """Stops the container. Started with --rm, so stopping removes it.

    Never raises: this runs in a ``finally``, and a cleanup error must not replace the real failure
    that sent us there.
    """
    if not container_id:
        return
    try:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True,
                       timeout=30, check=False)
    except (subprocess.SubprocessError, OSError):
        pass
