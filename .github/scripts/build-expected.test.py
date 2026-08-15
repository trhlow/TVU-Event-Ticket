# .github/scripts/build-expected.test.py
"""Exercises build_expected against the real repo, validating against observation.schema.json's real
`expected` $def -- including a real call to collect_frontend_config_fingerprint, not a stubbed value."""
import importlib.util
import json
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent

_spec = importlib.util.spec_from_file_location("build_expected_mod", HERE / "build-expected.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
build_expected = _module.build_expected

try:
    import jsonschema
except ImportError:
    print("FAIL  jsonschema is not installed; the contract cannot be checked")
    sys.exit(1)

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


expected = build_expected(str(REPO_ROOT), bash=BASH)

schema = json.loads((HERE.parent / "contracts" / "observation.schema.json").read_text(encoding="utf-8"))
expected_schema = schema["properties"]["expected"]
full_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "allOf": [expected_schema],
    "$defs": {k: v for k, v in schema["$defs"].items() if k in ("ociRepository", "hex64")},
}
validator = jsonschema.Draft202012Validator(full_schema)
errors = sorted(validator.iter_errors(expected), key=str)
report("build_expected's real output validates against observation.schema.json's expected shape exactly",
       not errors, "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5]))

report("the three repositories are three genuinely different values",
       len(set(expected["repositories"].values())) == 3,
       f"repositories={expected['repositories']!r}")

report("frontendConfigFingerprint is a real 64-char hex digest, not a placeholder",
       bool(re.match(r"^[0-9a-f]{64}$", expected.get("frontendConfigFingerprint", ""))),
       f"frontendConfigFingerprint={expected.get('frontendConfigFingerprint')!r}")

expected_again = build_expected(str(REPO_ROOT), bash=BASH)
report("running it twice against the same tree yields the same expected block (deterministic)",
       expected == expected_again,
       f"first={expected!r}\nsecond={expected_again!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
