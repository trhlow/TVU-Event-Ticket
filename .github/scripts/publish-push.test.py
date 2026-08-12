# .github/scripts/publish-push.test.py
"""Exercises publish-push.py's own glue -- writing each generic subject's predicate to a file and
subjects.json's shape -- with push_publish_artifacts stubbed out. The real push_publish_artifacts is
already exhaustively covered by run-publish.test.py (a 10+ minute real end-to-end run); this file's
only untested logic is what it does with that function's return value, so this test targets exactly
that, real file I/O and all, without paying for the real pipeline again."""
import importlib.util
import json
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


publish_push_mod = _load("publish-push")
canonical_mod = _load("canonical")

passed = failed = 0


def report(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"ok    {name}")
    else:
        failed += 1
        print(f"FAIL  {name}: {detail}")


FAKE_SUBJECTS = [
    {"name": "monolith-sbom-report", "digest": "sha256:" + "1" * 64,
     "predicateType": "https://spdx.dev/Document/v2.3", "predicate": {"a": 1, "b": [2, 3]},
     "kind": "generic"},
    {"name": "release-marker", "digest": "sha256:" + "2" * 64, "predicateType": None,
     "predicate": None, "kind": "provenance"},
]
publish_push_mod._run_publish.push_publish_artifacts = \
    lambda *a, **kw: {"subjects": FAKE_SUBJECTS, "expected": {}, "markerContent": {}}

with tempfile.TemporaryDirectory() as tmp:
    output_dir = pathlib.Path(tmp) / "out"
    sys.argv = [
        "publish-push.py",
        "--monolith-tarball", "unused", "--frontend-tarball", "unused",
        "--monolith-ref", "r1", "--frontend-ref", "r2", "--release-ref", "r3",
        "--commit", "a" * 40, "--environment", "production",
        "--repo-root", str(HERE.parent.parent),
        "--ruleset", "unused", "--ignore-file", "unused",
        "--output-dir", str(output_dir),
    ]
    publish_push_mod.main()

    subjects_file = output_dir / "subjects.json"
    report("subjects.json was written", subjects_file.exists(), f"{subjects_file} missing")

    written = json.loads(subjects_file.read_text(encoding="utf-8"))
    report("both subjects are present in the written order",
           len(written) == 2 and written[0]["name"] == "monolith-sbom-report"
           and written[1]["name"] == "release-marker",
           f"written={written!r}")

    report("the generic subject carries a predicateFile pointer; the provenance subject does not",
           written[0].get("predicateFile") == "predicates/monolith-sbom-report.json"
           and "predicateFile" not in written[1],
           f"written={written!r}")

    report("no raw predicate content leaks into subjects.json -- only the file pointer",
           "predicate" not in written[0] and "predicate" not in written[1],
           f"written={written!r}")

    predicate_path = output_dir / "predicates" / "monolith-sbom-report.json"
    report("the predicate file holds the real canonical bytes of the predicate content",
           predicate_path.exists()
           and predicate_path.read_bytes() == canonical_mod.canonical_bytes({"a": 1, "b": [2, 3]}),
           f"predicate_path exists={predicate_path.exists()}")

    report("no predicate file is written for the provenance subject "
           "(actions/attest-build-provenance supplies its own)",
           not (output_dir / "predicates" / "release-marker.json").exists(),
           "a predicates/release-marker.json file was unexpectedly written")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
