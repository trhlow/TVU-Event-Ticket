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

fs_document = collect_filesystem_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                               str(RULESET))

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

report("filesystemSecretScan document has declaredOutcome False for a clean fixture "
       "(secret scan fails on ANY finding, and this fixture has none)",
       fs_document.get("declaredOutcome") is False,
       f"declaredOutcome={fs_document.get('declaredOutcome')!r}")

collect_layer_secret_scan = _module.collect_layer_secret_scan

layer_schema = json.loads(LAYER_SCHEMA_PATH.read_text(encoding="utf-8"))
layer_registry = build_registry(LAYER_SCHEMA_PATH)
layer_validator = jsonschema.Draft202012Validator(layer_schema, registry=layer_registry)

layer_document = collect_layer_secret_scan(str(TARBALL), "tvu-collector-test:tiny",
                                            str(RULESET))

layer_errors = sorted(layer_validator.iter_errors(layer_document), key=str)
report("layerSecretScan document validates exactly",
       not layer_errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in layer_errors[:5]))

report("layerSecretScan findings is empty for this clean fixture",
       layer_document.get("findings") == [] and layer_document.get("truncated") is False,
       f"findings={layer_document.get('findings')!r}, truncated={layer_document.get('truncated')!r}")

report("layerSecretScan document has declaredOutcome False for a clean fixture",
       layer_document.get("declaredOutcome") is False,
       f"declaredOutcome={layer_document.get('declaredOutcome')!r}")

# A tarball with a declared layer size the collector cannot possibly match must raise CollectorError,
# not silently under-report -- this is the "descriptor declares a value the collector cannot trust"
# case the byte-cap discipline exists to catch, exercised here via the simplest real trigger: a
# tarball that does not exist at all still has to fail through CollectorError, not a bare
# FileNotFoundError a caller wouldn't know to catch.
missing_tarball = str(HERE / "collector-fixtures" / "this-file-does-not-exist.tar")
# collect-secret-scan.py loads local-registry.py itself (via the same importlib.util hyphen-load
# pattern this test uses) and, per the Interfaces contract, lets local-registry.py's own CollectorError
# propagate unchanged rather than re-wrapping it -- so the class actually raised for this path is the
# one collect-secret-scan.py's own internal load produced, not this test's separately-loaded
# CollectorError (each importlib.util.spec_from_file_location + exec_module call mints a distinct class
# object even for the same file/name, so `isinstance` only matches the exact load that raised it).
local_registry_collector_error = _module._registry_module.CollectorError
try:
    collect_layer_secret_scan(missing_tarball, "does-not-matter", str(RULESET))
    report("a missing tarball raises CollectorError (layer scan)", False, "no exception was raised")
except (CollectorError, local_registry_collector_error):
    report("a missing tarball raises CollectorError (layer scan)", True)
except Exception as exc:  # noqa: BLE001
    report("a missing tarball raises CollectorError (layer scan)", False,
           f"raised {type(exc).__name__} instead")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
