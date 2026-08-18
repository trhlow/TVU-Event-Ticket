#!/usr/bin/env python3
"""Proves registry_fixture refuses, loudly, at each of the three points its ten predecessors trusted.

subprocess.run and urlopen are replaced, so this needs no Docker and runs in milliseconds. The happy
path against a real registry is already exercised by the ten suites that use the fixture; what could
not be tested there -- because it needs a broken docker -- is exactly what is tested here.

Each case asserts on the MESSAGE, not merely that something was raised. The whole point of this
fixture is that the failure names its own cause: `IndexError: list index out of range` and
`connection refused` are both "an exception happened", and neither told anyone what was wrong.
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import registry_fixture  # noqa: E402

passed = 0
failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


class FakeCompleted:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def with_fake_docker(responses, ready=True):
    """Replaces subprocess.run with a scripted docker, and urlopen with a registry that may not answer.

    `responses` maps the docker subcommand ("run", "port", "stop") to a FakeCompleted. Calls are
    recorded so a test can assert the container was cleaned up.
    """
    calls = []

    def fake_run(cmd, *_args, **_kwargs):
        calls.append(list(cmd))
        subcommand = cmd[1] if len(cmd) > 1 else ""
        return responses.get(subcommand, FakeCompleted())

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    def fake_urlopen(*_args, **_kwargs):
        if not ready:
            raise OSError("connection refused")
        return FakeResponse()

    real_run, real_urlopen, real_sleep = (
        subprocess.run, registry_fixture.urllib.request.urlopen, registry_fixture.time.sleep)
    subprocess.run = fake_run
    registry_fixture.subprocess.run = fake_run
    registry_fixture.urllib.request.urlopen = fake_urlopen
    registry_fixture.time.sleep = lambda _s: None  # so the readiness timeout case is instant

    def restore():
        subprocess.run = real_run
        registry_fixture.subprocess.run = real_run
        registry_fixture.urllib.request.urlopen = real_urlopen
        registry_fixture.time.sleep = real_sleep

    return calls, restore


def expect_error(name, responses, ready, must_mention, expect_stop=True):
    calls, restore = with_fake_docker(responses, ready=ready)
    try:
        registry_fixture.start_local_registry(ready_timeout_seconds=0.2)
        report(name, False, "no exception was raised; the fixture carried on with a broken registry")
        return
    except registry_fixture.RegistryFixtureError as exc:
        message = str(exc)
    except Exception as exc:  # noqa: BLE001
        report(name, False, f"raised {type(exc).__name__} instead of RegistryFixtureError: {exc}")
        return
    finally:
        restore()

    if must_mention.lower() not in message.lower():
        report(name, False, f"message does not mention {must_mention!r}: {message!r}")
        return

    stopped = any(c[:2] == ["docker", "stop"] for c in calls)
    if expect_stop and not stopped:
        report(name, False, f"raised correctly but left the container running: {message!r}")
        return
    report(name, True)


# 1. docker run fails outright -- the case eight suites never checked.
expect_error(
    "a failed docker run is reported as a failed docker run, not as an IndexError later",
    {"run": FakeCompleted(returncode=125, stderr="Cannot connect to the Docker daemon")},
    ready=True, must_mention="Cannot connect to the Docker daemon", expect_stop=False,
)

# 2. docker run exits 0 but prints nothing. Rarer, and the one that produced the empty container id
#    that then made `docker port ""` fail in a way that named nothing.
expect_error(
    "docker run exiting 0 with no container id is refused",
    {"run": FakeCompleted(returncode=0, stdout="   \n")},
    ready=True, must_mention="no container id", expect_stop=False,
)

# 3. docker port fails.
expect_error(
    "a failed docker port is reported before anything tries to use the port",
    {"run": FakeCompleted(stdout="abc123\n"),
     "port": FakeCompleted(returncode=1, stderr="No public port '5000/tcp' published")},
    ready=True, must_mention="No public port",
)

# 4. docker port succeeds but prints nothing -- the exact input that raised IndexError.
expect_error(
    "docker port printing nothing says the container published no port",
    {"run": FakeCompleted(stdout="abc123\n"), "port": FakeCompleted(stdout="\n")},
    ready=True, must_mention="published no port",
)

# 5. docker port prints something unparseable.
expect_error(
    "unparseable docker port output is refused rather than silently producing a bad port",
    {"run": FakeCompleted(stdout="abc123\n"), "port": FakeCompleted(stdout="not-a-mapping\n")},
    ready=True, must_mention="could not read a port number",
)

# 6. The registry never answers. Eight suites ran on regardless and died later at `crane push`
#    with "connection refused" -- which is what got misread as a flaky test, twice.
expect_error(
    "a registry that never becomes ready fails here, not thirty lines later at crane push",
    {"run": FakeCompleted(stdout="abc123\n"), "port": FakeCompleted(stdout="127.0.0.1:32768\n")},
    ready=False, must_mention="never answered",
)


# 7. The happy path still returns what callers expect.
calls, restore = with_fake_docker(
    {"run": FakeCompleted(stdout="abc123\n"), "port": FakeCompleted(stdout="127.0.0.1:32768\n")},
    ready=True)
try:
    container_id, host_port = registry_fixture.start_local_registry(ready_timeout_seconds=1)
    report("a healthy registry returns its container id and host port",
           container_id == "abc123" and host_port == "32768",
           f"got container_id={container_id!r}, host_port={host_port!r}")
    report("a successful start does not stop the container it just started",
           not any(c[:2] == ["docker", "stop"] for c in calls),
           f"calls were {calls!r}")
finally:
    restore()

# 8. IPv6 mappings contain colons; splitting on the wrong one yields a port that is not a port.
calls, restore = with_fake_docker(
    {"run": FakeCompleted(stdout="abc123\n"), "port": FakeCompleted(stdout="[::1]:49154\n")},
    ready=True)
try:
    _, host_port = registry_fixture.start_local_registry(ready_timeout_seconds=1)
    report("an IPv6 mapping yields the port, not part of the address",
           host_port == "49154", f"got {host_port!r}")
finally:
    restore()

# 9. Two address families, one port. The first line is enough and must be used.
calls, restore = with_fake_docker(
    {"run": FakeCompleted(stdout="abc123\n"),
     "port": FakeCompleted(stdout="0.0.0.0:32770\n[::]:32770\n")},
    ready=True)
try:
    _, host_port = registry_fixture.start_local_registry(ready_timeout_seconds=1)
    report("a two-line docker port output is read as one port", host_port == "32770",
           f"got {host_port!r}")
finally:
    restore()

# 10. Cleanup must never mask the failure that led to it.
calls, restore = with_fake_docker({"stop": FakeCompleted(returncode=1, stderr="no such container")},
                                  ready=True)
try:
    registry_fixture.stop_local_registry("gone-already")
    report("stopping a container that is already gone does not raise", True)
except Exception as exc:  # noqa: BLE001
    report("stopping a container that is already gone does not raise", False,
           f"raised {type(exc).__name__}: {exc}")
finally:
    restore()

try:
    registry_fixture.stop_local_registry("")
    report("stop_local_registry ignores an empty container id", True)
except Exception as exc:  # noqa: BLE001
    report("stop_local_registry ignores an empty container id", False,
           f"raised {type(exc).__name__}: {exc}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
