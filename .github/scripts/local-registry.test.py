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
