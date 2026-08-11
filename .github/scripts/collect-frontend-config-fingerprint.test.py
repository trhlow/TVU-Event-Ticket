# .github/scripts/collect-frontend-config-fingerprint.test.py
"""Exercises collect_frontend_config_fingerprint against the real tracked frontend/.env.production and
the real frontend-config.sh -- not mocked, since the entire point is proving the two agree."""
import importlib.util
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent

_spec = importlib.util.spec_from_file_location(
    "collect_frontend_config_fingerprint", HERE / "collect-frontend-config-fingerprint.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_frontend_config_fingerprint = _module.collect_frontend_config_fingerprint
CollectorError = _module.CollectorError

BASH = os.environ.get("PUBLISH_DECISION_BASH", "bash")

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


fingerprint = collect_frontend_config_fingerprint(str(REPO_ROOT), bash=BASH)

report("fingerprint is a 64-char hex digest",
       bool(re.match(r"^[0-9a-f]{64}$", fingerprint)),
       f"fingerprint={fingerprint!r}")

fingerprint_again = collect_frontend_config_fingerprint(str(REPO_ROOT), bash=BASH)
report("running it twice against the same tree yields the same fingerprint",
       fingerprint == fingerprint_again,
       f"first={fingerprint!r}, second={fingerprint_again!r}")

# Negative case: a repo root with no frontend/.env.production must raise CollectorError, not hang or
# print an empty-string hash that would compare equal to a config missing every required key (the
# exact fail-open bug frontend-config.sh's own header comment describes and was rewritten to prevent).
empty_root = HERE / "collector-fixtures"
try:
    collect_frontend_config_fingerprint(str(empty_root), bash=BASH)
    report("a directory with no frontend/.env.production raises CollectorError", False,
           "no exception was raised")
except CollectorError:
    report("a directory with no frontend/.env.production raises CollectorError", True)
except Exception as exc:  # noqa: BLE001
    report("a directory with no frontend/.env.production raises CollectorError", False,
           f"raised {type(exc).__name__} instead")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
