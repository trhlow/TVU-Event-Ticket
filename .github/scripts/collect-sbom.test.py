# .github/scripts/collect-sbom.test.py
"""Exercises collect-sbom.py against a real image, not a mocked syft. A mock cannot tell you syft
changed its own output shape between versions -- the whole point of this test is to catch that."""
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"

import importlib.util

_spec = importlib.util.spec_from_file_location("collect_sbom", HERE / "collect-sbom.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_sbom, CollectorError = _module.collect_sbom, _module.CollectorError

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
    report("tiny-test-image.tar exists (run Task 1's docker build/save first)", False,
           f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

result = collect_sbom(str(TARBALL), "tvu-collector-test:tiny")

report("collect_sbom returns a dict with document and packageCount",
       isinstance(result, dict) and "document" in result and "packageCount" in result,
       f"got {result!r}" if not isinstance(result, dict) else "")

document = result.get("document", {})
report("document declares SPDX-2.3",
       document.get("spdxVersion") == "SPDX-2.3",
       f"spdxVersion={document.get('spdxVersion')!r}")

report("packageCount is a positive int (alpine:3.18 has real packages)",
       isinstance(result.get("packageCount"), int) and result["packageCount"] > 0,
       f"packageCount={result.get('packageCount')!r}")

report("document.packages length matches packageCount",
       len(document.get("packages", [])) == result.get("packageCount"),
       f"{len(document.get('packages', []))} != {result.get('packageCount')}")

# Negative case: a tarball that is not a valid docker-archive must raise CollectorError, not crash
# with a bare subprocess traceback -- a caller (the observation assembler) needs a catchable failure.
bogus = HERE / "collector-fixtures" / "not-a-real-tarball.tar"
bogus.write_bytes(b"not a tarball")
try:
    collect_sbom(str(bogus), "does-not-matter")
    report("a bogus tarball raises CollectorError", False, "no exception was raised")
except CollectorError:
    report("a bogus tarball raises CollectorError", True)
except Exception as exc:  # noqa: BLE001
    report("a bogus tarball raises CollectorError", False, f"raised {type(exc).__name__} instead")
finally:
    bogus.unlink()

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
