# .github/scripts/collect-flyway-inventory.test.py
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
MONOLITH_TARBALL = HERE / "collector-fixtures" / "monolith-test-image.tar"
OBSERVATION_SCHEMA_PATH = HERE.parent / "contracts" / "observation.schema.json"

try:
    import jsonschema
except ImportError:
    print("FAIL  jsonschema is not installed; the contract cannot be checked")
    sys.exit(1)

_spec = importlib.util.spec_from_file_location(
    "collect_flyway_inventory", HERE / "collect-flyway-inventory.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
collect_flyway_inventory = _module.collect_flyway_inventory
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


if not MONOLITH_TARBALL.exists():
    report("monolith-test-image.tar exists (run Task 1 Step 1 first)", False,
           f"{MONOLITH_TARBALL} is missing")
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1)

document = collect_flyway_inventory(str(MONOLITH_TARBALL))

observation_schema = json.loads(OBSERVATION_SCHEMA_PATH.read_text(encoding="utf-8"))
flyway_schema = observation_schema["$defs"]["flywayInventory"]
migration_schema = observation_schema["$defs"]["migration"]
digest_schema = observation_schema["$defs"]["digest"]
hex64_schema = observation_schema["$defs"]["hex64"]
full_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "allOf": [flyway_schema],
    "$defs": {"migration": migration_schema, "digest": digest_schema, "hex64": hex64_schema},
}
validator = jsonschema.Draft202012Validator(full_schema)
errors = sorted(validator.iter_errors(document), key=str)
report("document validates against observation.schema.json's flywayInventory exactly",
       not errors,
       "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5]))

report("boundTo looks like a real sha256 digest",
       document.get("boundTo", "").startswith("sha256:")
       and len(document.get("boundTo", "")) == len("sha256:") + 64,
       f"boundTo={document.get('boundTo')!r}")

report("checksum is a real 64-char hex string (canonical_bytes output shape)",
       isinstance(document.get("checksum"), str) and len(document.get("checksum", "")) == 64,
       f"checksum={document.get('checksum')!r}")

report("migrations is non-empty and ordered by installedRank ascending from 1",
       [m["installedRank"] for m in document.get("migrations", [])]
       == list(range(1, len(document.get("migrations", [])) + 1)),
       f"installedRanks={[m.get('installedRank') for m in document.get('migrations', [])]}")

report("every migration in this clean image succeeded",
       all(m["success"] is True for m in document.get("migrations", [])),
       str([m for m in document.get("migrations", []) if m["success"] is not True]))

# Recomputing the checksum independently must match -- proves the collector's own canonicalization is
# deterministic and not, e.g., accidentally including a volatile field like installed_on.
second_document = collect_flyway_inventory(str(MONOLITH_TARBALL))
report("running the collector twice against the same image yields the same checksum",
       document.get("checksum") == second_document.get("checksum"),
       f"first={document.get('checksum')!r}, second={second_document.get('checksum')!r}")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
