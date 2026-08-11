# .github/scripts/collect-secret-scan.test.py
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
TARBALL = HERE / "collector-fixtures" / "tiny-test-image.tar"
RULESET = HERE / "collector-fixtures" / "trivy-secret-ruleset.yaml"
FS_SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "filesystemSecretScan.schema.json"
LAYER_SCHEMA_PATH = HERE.parent / "contracts" / "predicates" / "layerSecretScan.schema.json"

try:
    import jsonschema
    import referencing
    import referencing.jsonschema
except ImportError:
    print("FAIL  jsonschema and referencing are not both installed; the contract cannot be checked")
    sys.exit(1)

_spec = importlib.util.spec_from_file_location("collect_secret_scan", HERE / "collect-secret-scan.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_filesystem_secret_scan = _module.collect_filesystem_secret_scan
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


def build_registry(schema_path):
    contracts_dir = schema_path.parent.parent
    resources = {}
    for path in sorted(contracts_dir.rglob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        schema_id = contents.get("$id")
        if isinstance(schema_id, str) and schema_id:
            resources[schema_id] = referencing.Resource.from_contents(
                contents, default_specification=referencing.jsonschema.DRAFT202012)
    return referencing.Registry().with_resources(resources.items())


if not TARBALL.exists():
    report("tiny-test-image.tar exists (run slice 1 Task 1 first)", False, f"{TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

fs_schema = json.loads(FS_SCHEMA_PATH.read_text(encoding="utf-8"))
fs_registry = build_registry(FS_SCHEMA_PATH)
fs_validator = jsonschema.Draft202012Validator(fs_schema, registry=fs_registry)

fs_document = collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny", str(RULESET))

fs_errors = sorted(fs_validator.iter_errors(fs_document), key=str)
report("filesystemSecretScan document validates exactly",
       not fs_errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in fs_errors[:5]))

report("filesystemSecretScan findings is empty for this clean fixture (alpine:3.18 base has no secrets)",
       fs_document.get("findings") == [] and fs_document.get("truncated") is False,
       f"findings={fs_document.get('findings')!r}, truncated={fs_document.get('truncated')!r}")

report("filesystemSecretScan ruleset names the tracked file's real version and a real digest",
       fs_document.get("ruleset", {}).get("version") == "1"
       and isinstance(fs_document.get("ruleset", {}).get("digest"), str)
       and fs_document["ruleset"]["digest"].startswith("sha256:"),
       f"ruleset={fs_document.get('ruleset')!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
