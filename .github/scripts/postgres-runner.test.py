# .github/scripts/postgres-runner.test.py
"""Exercises run_migrations_and_read_history against the real monolith image and a real throwaway
Postgres -- not mocked, because the entire point of this module is to prove what a real Postgres
actually recorded after a real Flyway run, which a mock cannot do."""
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
MONOLITH_TARBALL = HERE / "collector-fixtures" / "monolith-test-image.tar"

_spec = importlib.util.spec_from_file_location("postgres_runner", HERE / "postgres-runner.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
run_migrations_and_read_history = _module.run_migrations_and_read_history
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

rows = run_migrations_and_read_history(str(MONOLITH_TARBALL))

report("at least one migration row was read back",
       isinstance(rows, list) and len(rows) >= 1,
       f"rows={rows!r}" if not isinstance(rows, list) else f"len={len(rows)}")

report("every row has the real Postgres column names",
       all({"installed_rank", "version", "description", "type", "script", "checksum",
            "installed_by", "installed_on", "execution_time", "success"} <= set(r.keys())
           for r in rows),
       str([sorted(r.keys()) for r in rows[:1]]))

report("rows are ordered by installed_rank ascending starting at 1",
       [r["installed_rank"] for r in rows] == list(range(1, len(rows) + 1)),
       f"installed_ranks={[r['installed_rank'] for r in rows]}")

report("every migration succeeded (a clean image's own migrations must all pass)",
       all(r["success"] is True for r in rows),
       str([r for r in rows if r["success"] is not True]))

report("checksum values are real integers, not null, not strings",
       all(isinstance(r["checksum"], int) for r in rows),
       str([type(r["checksum"]).__name__ for r in rows[:3]]))

# Negative case: a nonexistent tarball must raise CollectorError, not hang or crash uncaught.
try:
    run_migrations_and_read_history(str(HERE / "collector-fixtures" / "does-not-exist.tar"))
    report("a missing tarball raises CollectorError", False, "no exception was raised")
except CollectorError:
    report("a missing tarball raises CollectorError", True)
except Exception as exc:  # noqa: BLE001
    report("a missing tarball raises CollectorError", False, f"raised {type(exc).__name__} instead")

print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
