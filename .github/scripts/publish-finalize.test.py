# .github/scripts/publish-finalize.test.py
"""Exercises publish-finalize.py's own glue -- the exit-code contract -- with finalize_publish stubbed
out. The real finalize_publish is already exhaustively covered by run-publish.test.py; this file's only
untested logic is that it exits 0 on a real publish and non-zero (never silently green) when the run
did not actually publish."""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


publish_finalize_mod = _load("publish-finalize")

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


ARGV = [
    "publish-finalize.py",
    "--monolith-ref", "r1", "--frontend-ref", "r2", "--release-ref", "r3",
    "--commit", "a" * 40, "--environment", "production",
    "--repo-root", str(HERE.parent.parent),
]


def _run_with_stub(published, state):
    publish_finalize_mod._run_publish.finalize_publish = \
        lambda *a, **kw: {"published": published,
                           "decision": {"state": state, "actions": [], "reason": "stubbed reason",
                                        "cleanupDebt": False, "retryable": False}}
    sys.argv = ARGV
    try:
        publish_finalize_mod.main()
        return 0
    except SystemExit as exc:
        return exc.code or 0


report("a real publish (published=True) exits 0", _run_with_stub(True, "COMPLETE") == 0,
       f"exit code was not 0")
report("a refused publish (published=False) exits non-zero, never silently green",
       _run_with_stub(False, "CONFLICT") != 0, f"exit code was 0")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
