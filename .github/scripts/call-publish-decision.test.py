# .github/scripts/call-publish-decision.test.py
"""Exercises call_publish_decision against publish-decision.sh for real: a genuinely clean throwaway
registry (nothing ever pushed) assembled into a real observation via assemble_observation, which must
decide ABSENT/build_new -- the same clean-slate case publish-decision.test.sh itself exercises (line
~1189: ABSENT ["build_new"] cleanupDebt=false retryable=false) -- plus a real malformed-observation case
proving publish-decision.sh's own UNKNOWN safety net is reached through this thin wrapper, not bypassed.
"""
import importlib.util
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

HERE = pathlib.Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


call_publish_decision_mod = _load("call-publish-decision")
call_publish_decision = call_publish_decision_mod.call_publish_decision
PublishDecisionError = call_publish_decision_mod.PublishDecisionError

assemble_observation_mod = _load("assemble-observation")
assemble_observation = assemble_observation_mod.assemble_observation

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


_malformed_result = call_publish_decision({"not": "an observation"}, bash=BASH)
report("a real malformed observation reaches publish-decision.sh's own UNKNOWN safety net",
       _malformed_result.get("state") == "UNKNOWN",
       f"result={_malformed_result!r}")

COMMIT = "0123456789abcdef0123456789abcdef01234567"

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

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{host_port}/v2/", timeout=2) as resp:
                if resp.status == 200:
                    break
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)

    monolith_ref = f"localhost:{host_port}/test/monolith"
    frontend_ref = f"localhost:{host_port}/test/frontend"
    release_ref = f"localhost:{host_port}/test/release"

    # Nothing is ever pushed here -- every one of the 10 lookups comes back genuinely absent/skipped,
    # exercising the real clean-slate path through assemble_observation into publish-decision.sh.
    observation = assemble_observation(monolith_ref, frontend_ref, release_ref, COMMIT, "production",
                                        str(REPO_ROOT), bash=BASH)
    # build_expected's own repositories/registry are the real, hardcoded GHCR constants (proven
    # separately by build-expected.test.py) -- publish-decision.sh real-binds each queriedRef against
    # them (`scope = expected.registry + "/" + repositories[role]`), so a throwaway local registry
    # legitimately fails that check unless expected is overridden to match where this test actually
    # pushed. This override tests only the call_publish_decision wrapper, not build_expected's values.
    observation["expected"]["registry"] = f"localhost:{host_port}"
    observation["expected"]["repositories"] = {"release": "test/release", "monolith": "test/monolith",
                                                "frontend": "test/frontend"}
    result = call_publish_decision(observation, bash=BASH)

    report("a genuinely clean-slate real observation decides ABSENT with build_new",
           result == {"state": "ABSENT", "actions": ["build_new"], "reason": "nothing published for this commit",
                       "cleanupDebt": False, "retryable": False},
           f"result={result!r}")
finally:
    if container_id:
        subprocess.run(["docker", "stop", container_id], capture_output=True, text=True, timeout=30,
                        check=False)

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
