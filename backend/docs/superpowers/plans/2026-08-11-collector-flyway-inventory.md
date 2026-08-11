# Collector: Flyway inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a real `flywayInventory` document (per `observation.schema.json`'s `flywayInventory`/
`migration` `$defs`) by actually running the candidate monolith image's migrations against a throwaway
Postgres and reading `flyway_schema_history` back — not from the image's migration script files, not
from the source tree (design doc §3.4).

**Architecture:** One helper module (`postgres-runner.py`) that starts a throwaway Postgres matching the
project's real pinned image, runs the monolith image against it with the minimal env vars needed, waits
for Flyway to actually finish (by polling `flyway_schema_history`'s row count for stability, not by
trusting the app's own unrelated crash as a signal — see the "why not just wait for the container to
exit" note in Task 1), and queries the table back via `docker exec ... psql`. One collector module
(`collect-flyway-inventory.py`) that orchestrates the helper, computes the canonical-list checksum via
the existing `canonical.py`, and assembles the final document.

**Tech Stack:** Python 3.10+, Docker (`postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`
— the exact digest-pinned image `backend/infra/docker-compose.monolith.yml` already uses, not a
different tag), `psql` (available inside the postgres container itself — invoked via `docker exec`, no
extra local dependency), `crane` (for the image digest, reusing the local-registry helper from slice
2), `.github/scripts/canonical.py`'s `canonical_bytes` (already used elsewhere in this pipeline for
every other digest).

## Global Constraints

- Same floor/directory constraints as slices 1-2: Python 3.10+, self-contained under
  `.github/scripts/`, `PYTHON_BIN` may need to be `python` not `python3` on this Windows machine.
- **Verified real fact (2026-08-11, agentId ad29b2466dc171879, do not re-derive by guessing):** the
  monolith image's Flyway migrations complete fully against Postgres ALONE — no Redis, no RabbitMQ, no
  mail server needed. `FlywayMigrationInitializer` runs during datasource/JPA bean init, well before any
  bean depending on Redis/RabbitMQ/mail is constructed. The app crashes shortly after migrations
  complete (missing `SPRING_MAIL_HOST` → no `JavaMailSender` bean), but that crash is a coincidental
  side effect of an unrelated missing env var, not something to design the collector around as a
  reliable signal (see Task 1's completion-detection note).
- Minimal env vars confirmed sufficient to reach migration completion: `SPRING_DATASOURCE_URL`,
  `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, `JWT_ISSUER_URI` (some value is required
  to pass an unrelated startup check even though it's never actually reached over the network before
  the crash — `http://localhost:8080` works, matching what `docker-compose.monolith.yml` uses).
- Real `flyway_schema_history` columns (confirmed by direct query): `installed_rank`, `version`,
  `description`, `type`, `script`, `checksum` (signed 32-bit integer, may be negative), `installed_by`,
  `installed_on`, `execution_time`, `success`. `observation.schema.json`'s `migration` `$def` requires
  exactly `installedRank`, `version`, `type`, `script`, `checksum`, `success` — the other three real
  columns (`description`, `installed_by`, `installed_on`, `execution_time`) are read but not included in
  the output document (the schema's `additionalProperties: false` forbids extra keys).
- `checksum` in the output must be `sha256` of the **canonical migration list** (schema's own
  description), computed with `.github/scripts/canonical.py`'s `canonical_bytes` over the `migrations`
  array in `installedRank` order — never `json.dumps` directly, matching every other digest in this
  pipeline.
- `boundTo` must be the monolith image's real digest, obtained the same way slice 2 obtains a trustable
  reference: push the tarball into a throwaway local registry (`local-registry.py`'s
  `local_registry_ref`, already merged) and read `crane digest <ref>`, not a digest computed by hand
  from the tarball's own bytes (those are docker-save format, not the OCI manifest digest a registry
  would assign).
- No network calls other than Docker itself (pulling `postgres:18.4-alpine` by its pinned digest if not
  already cached, which is not "network" in the sense the earlier plans forbade — every collector so far
  has needed to pull its own throwaway infra image; the constraint is about not calling GHCR, external
  APIs, or anything outside Docker Hub's already-established local-registry-and-throwaway-container
  pattern).
- Every throwaway container (Postgres, monolith) must be stopped/removed in a `finally` block even if
  the caller raises — same discipline as `local-registry.py`.

---

## File Structure

- Create: `.github/scripts/postgres-runner.py` — throwaway Postgres + monolith-migration-runner helper.
- Create: `.github/scripts/postgres-runner.test.py` — exercises the helper against the real monolith
  image (built once, real Maven-in-Docker build, confirmed to take under a minute on this machine
  during the design investigation).
- Create: `.github/scripts/collect-flyway-inventory.py` — `collect_flyway_inventory`.
- Create: `.github/scripts/collect-flyway-inventory.test.py` — exercises it end to end.

## Interfaces

- `postgres-runner.py` exposes `run_migrations_and_read_history(monolith_tarball_path: str) ->
  list[dict]` — starts a throwaway Postgres, runs the monolith image against it with the minimal env
  vars above, waits for migration completion, queries `flyway_schema_history` ordered by
  `installed_rank`, tears everything down, and returns the raw rows as a list of dicts with the real
  Postgres column names (`installed_rank`, `version`, `description`, `type`, `script`, `checksum`,
  `installed_by`, `installed_on`, `execution_time`, `success`) — this module does NOT reshape the keys
  into the schema's camelCase names; that reshaping is `collect-flyway-inventory.py`'s job, keeping this
  helper a thin, honest wrapper around "what Postgres actually says," not a second copy of the schema.
  Raises this module's own `CollectorError` on any docker/psql failure or a timeout waiting for
  migrations.
- `collect-flyway-inventory.py` exposes `collect_flyway_inventory(monolith_tarball_path: str) -> dict`
  — returns a document matching `observation.schema.json`'s `flywayInventory` `$def` exactly (`boundTo`,
  `checksum`, `migrations`). Imports `run_migrations_and_read_history` from `postgres-runner.py` and
  `local_registry_ref` from `local-registry.py` (both via the established `importlib.util` hyphen-load
  pattern), and `canonical_bytes` from `canonical.py` (a normal `import canonical` — that module has no
  hyphen in its filename, so it doesn't need the workaround). Defines its own `CollectorError`, letting
  the two imported modules' own `CollectorError`s propagate unchanged (same no-re-wrap convention as
  slice 2).

---

### Task 1: `postgres-runner.py` — throwaway Postgres + monolith migration runner

**Files:**
- Create: `.github/scripts/postgres-runner.py`
- Test: `.github/scripts/postgres-runner.test.py`

**Interfaces:**
- Consumes: a monolith image tarball (built fresh by this task's test, since no monolith tarball fixture
  exists yet in `.github/scripts/collector-fixtures/` — unlike the tiny alpine fixture slices 1-2 share,
  this needs the REAL monolith image, which is what the collector will actually scan in production).
  `docker`, `crane` on PATH.
- Produces: `run_migrations_and_read_history(monolith_tarball_path)`, `CollectorError`.

- [ ] **Step 1: Build the real monolith image tarball once, for this task's test to use**

This is not part of the collector's own code — it's the test fixture setup, mirroring how slice 1/2's
tests use a pre-built tarball. Run from the repo root:

```
docker build -t tvu-monolith-flyway-test:local -f backend/Dockerfile backend
docker save tvu-monolith-flyway-test:local -o .github/scripts/collector-fixtures/monolith-test-image.tar
```

Add this new tarball name to `.gitignore` alongside the existing collector-fixtures pattern (it already
covers `.github/scripts/collector-fixtures/*.tar`, so no new gitignore line is needed — confirm this by
checking the existing entry from slice 1 Task 1 before adding a duplicate).

This build takes real Maven-in-Docker time (confirmed ~1 minute on this machine during the design
investigation, but budget more on a cold cache) — this is expected, not a sign anything is wrong.

- [ ] **Step 2: Write the failing test**

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .github/scripts && python postgres-runner.test.py`
Expected: fails in the `importlib` load (`postgres-runner.py` does not exist yet).

- [ ] **Step 4: Write the implementation**

```python
# .github/scripts/postgres-runner.py
"""Runs the monolith image's Flyway migrations against a throwaway Postgres and reads back what
actually happened.

Verified for real (2026-08-11): the monolith image's migrations complete fully against Postgres alone
-- no Redis, RabbitMQ, or mail server needed, because FlywayMigrationInitializer runs during
datasource/JPA bean init, well before any bean depending on those services is constructed. The app
crashes shortly after (missing SPRING_MAIL_HOST), which is why this module does NOT wait for the
container to become "healthy" or for the app to reach a ready state -- it waits for
flyway_schema_history's row count to stop changing instead. Deliberately not "wait for the container to
exit": that crash is a coincidental side effect of an unrelated missing env var, and coupling migration
completion detection to it would silently break the day someone fixes SPRING_MAIL_HOST, with no schema
or test signal pointing at why.
"""
import subprocess
import time

__all__ = ["run_migrations_and_read_history", "CollectorError"]

POSTGRES_IMAGE = ("postgres:18.4-alpine@sha256:"
                   "9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15")
POSTGRES_USER = "tvu"
POSTGRES_PASSWORD = "tvu"
POSTGRES_DB = "tvu_app"

STABILITY_POLL_INTERVAL_SECONDS = 1.0
STABILITY_REQUIRED_CONSECUTIVE_POLLS = 3
MIGRATION_TIMEOUT_SECONDS = 300

COLUMNS = ("installed_rank", "version", "description", "type", "script", "checksum",
           "installed_by", "installed_on", "execution_time", "success")


class CollectorError(Exception):
    pass


def run_migrations_and_read_history(monolith_tarball_path: str) -> list:
    pg_container = None
    monolith_container = None
    try:
        pg_run = subprocess.run(
            ["docker", "run", "-d", "--rm",
             "-e", f"POSTGRES_USER={POSTGRES_USER}",
             "-e", f"POSTGRES_PASSWORD={POSTGRES_PASSWORD}",
             "-e", f"POSTGRES_DB={POSTGRES_DB}",
             POSTGRES_IMAGE],
            capture_output=True, text=True, timeout=120, check=False,
        )
        if pg_run.returncode != 0:
            raise CollectorError(f"docker run postgres exited {pg_run.returncode}: "
                                  f"{pg_run.stderr.strip()[:2000]}")
        pg_container = pg_run.stdout.strip()

        _wait_for_postgres_ready(pg_container)

        load_proc = subprocess.run(
            ["docker", "load", "-i", monolith_tarball_path],
            capture_output=True, text=True, timeout=300, check=False,
        )
        if load_proc.returncode != 0:
            raise CollectorError(f"docker load exited {load_proc.returncode} for "
                                  f"{monolith_tarball_path}: {load_proc.stderr.strip()[:2000]}")
        loaded_image = _parse_loaded_image_ref(load_proc.stdout)

        pg_inspect = subprocess.run(
            ["docker", "inspect", "-f", "{{.NetworkSettings.IPAddress}}", pg_container],
            capture_output=True, text=True, timeout=30, check=False,
        )
        pg_ip = pg_inspect.stdout.strip()
        if pg_inspect.returncode != 0 or not pg_ip:
            raise CollectorError(f"could not read Postgres container {pg_container}'s IP address: "
                                  f"{pg_inspect.stderr.strip()[:500]}")

        run_proc = subprocess.run(
            ["docker", "run", "-d", "--rm",
             "-e", f"SPRING_DATASOURCE_URL=jdbc:postgresql://{pg_ip}:5432/{POSTGRES_DB}",
             "-e", f"SPRING_DATASOURCE_USERNAME={POSTGRES_USER}",
             "-e", f"SPRING_DATASOURCE_PASSWORD={POSTGRES_PASSWORD}",
             "-e", "JWT_ISSUER_URI=http://localhost:8080",
             loaded_image],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if run_proc.returncode != 0:
            raise CollectorError(f"docker run monolith exited {run_proc.returncode}: "
                                  f"{run_proc.stderr.strip()[:2000]}")
        monolith_container = run_proc.stdout.strip()

        _wait_for_migration_stability(pg_container)

        return _read_flyway_schema_history(pg_container)
    finally:
        if monolith_container:
            subprocess.run(["docker", "stop", monolith_container], capture_output=True, text=True,
                            timeout=30, check=False)
        if pg_container:
            subprocess.run(["docker", "stop", pg_container], capture_output=True, text=True,
                            timeout=30, check=False)


def _parse_loaded_image_ref(docker_load_stdout: str) -> str:
    # "Loaded image: repo:tag" is docker load's real output line for a docker-save tarball built with
    # a single tag (which is how Task 1 of slice 1's collector-fixtures and this task's monolith
    # fixture are both built -- one docker build -t, then docker save).
    for line in docker_load_stdout.splitlines():
        line = line.strip()
        if line.startswith("Loaded image:"):
            return line.split(":", 1)[1].strip()
    raise CollectorError(f"docker load did not print a 'Loaded image:' line: {docker_load_stdout!r}")


def _run_psql(pg_container: str, sql: str) -> str:
    proc = subprocess.run(
        ["docker", "exec", pg_container, "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
         "-t", "-A", "-F", "\x01", "-c", sql],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if proc.returncode != 0:
        raise CollectorError(f"psql exited {proc.returncode} running {sql!r}: "
                              f"{proc.stderr.strip()[:1000]}")
    return proc.stdout


def _wait_for_postgres_ready(pg_container: str, timeout_seconds: float = 60.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        proc = subprocess.run(
            ["docker", "exec", pg_container, "pg_isready", "-U", POSTGRES_USER, "-d", POSTGRES_DB],
            capture_output=True, text=True, timeout=10, check=False,
        )
        if proc.returncode == 0:
            return
        last_error = proc.stdout.strip() + proc.stderr.strip()
        time.sleep(1.0)
    raise CollectorError(f"Postgres container {pg_container} never became ready: {last_error}")


def _table_exists(pg_container: str) -> bool:
    try:
        out = _run_psql(pg_container, "select to_regclass('public.flyway_schema_history');")
    except CollectorError:
        return False
    return out.strip() not in ("", "\n")


def _row_count(pg_container: str) -> int:
    out = _run_psql(pg_container, "select count(*) from flyway_schema_history;")
    return int(out.strip())


def _wait_for_migration_stability(pg_container: str) -> None:
    deadline = time.monotonic() + MIGRATION_TIMEOUT_SECONDS
    stable_polls = 0
    last_count = None
    while time.monotonic() < deadline:
        if not _table_exists(pg_container):
            time.sleep(STABILITY_POLL_INTERVAL_SECONDS)
            continue
        count = _row_count(pg_container)
        if count == last_count and count > 0:
            stable_polls += 1
            if stable_polls >= STABILITY_REQUIRED_CONSECUTIVE_POLLS:
                return
        else:
            stable_polls = 0
        last_count = count
        time.sleep(STABILITY_POLL_INTERVAL_SECONDS)
    raise CollectorError(
        f"flyway_schema_history row count never stabilized within {MIGRATION_TIMEOUT_SECONDS}s "
        f"(last seen count: {last_count})"
    )


def _read_flyway_schema_history(pg_container: str) -> list:
    out = _run_psql(
        pg_container,
        "select installed_rank, version, description, type, script, checksum, installed_by, "
        "installed_on, execution_time, success from flyway_schema_history order by installed_rank;",
    )
    rows = []
    for line in out.splitlines():
        line = line.rstrip("\n")
        if not line:
            continue
        fields = line.split("\x01")
        if len(fields) != len(COLUMNS):
            raise CollectorError(f"flyway_schema_history row had {len(fields)} fields, "
                                  f"expected {len(COLUMNS)}: {line!r}")
        row = dict(zip(COLUMNS, fields))
        row["installed_rank"] = int(row["installed_rank"])
        row["checksum"] = int(row["checksum"]) if row["checksum"] not in ("", None) else None
        row["execution_time"] = int(row["execution_time"])
        row["success"] = row["success"] == "t"
        row["version"] = row["version"] if row["version"] != "" else None
        rows.append(row)
    return rows
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .github/scripts && python postgres-runner.test.py`
Expected: `passed=6 failed=0`. If `_wait_for_postgres_ready` never returns, check `docker logs
<pg_container_id>` by hand — a Postgres container without `--network host` gets its own bridge-network
IP, which `docker inspect -f {{.NetworkSettings.IPAddress}}` reads; if this returns empty, the container
may be on Docker Desktop's default network in a mode where that field is empty and the port needs
publishing instead (`-p 0:5432` + `docker port`, the same pattern `local-registry.py` already uses) —
adapt if the real output differs, matching what you actually observe over what this step assumes.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/postgres-runner.py .github/scripts/postgres-runner.test.py
git commit -m "feat(ci): run the monolith image's Flyway migrations against a throwaway Postgres"
```

---

### Task 2: `collect_flyway_inventory` — assemble the final document

**Files:**
- Create: `.github/scripts/collect-flyway-inventory.py`
- Test: `.github/scripts/collect-flyway-inventory.test.py`

**Interfaces:**
- Consumes: `run_migrations_and_read_history` from Task 1's `postgres-runner.py`, `local_registry_ref`
  from slice 2's `local-registry.py`, `canonical_bytes` from `canonical.py`, the same monolith tarball
  fixture Task 1's test built.
- Produces: `collect_flyway_inventory(monolith_tarball_path) -> dict`, matching `observation.schema.json`'s
  `flywayInventory` `$def`.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/scripts && python collect-flyway-inventory.test.py`
Expected: fails in the `importlib` load (`collect-flyway-inventory.py` does not exist).

- [ ] **Step 3: Write the implementation**

```python
# .github/scripts/collect-flyway-inventory.py
"""Assembles a flywayInventory document (observation.schema.json's flywayInventory $def) from a real
Postgres run of the monolith image's Flyway migrations (postgres-runner.py) and the image's real OCI
digest (local-registry.py + crane, the same pattern slice 2 uses to get a trustable reference)."""
import hashlib
import importlib.util
import pathlib
import subprocess

import canonical

_HERE = pathlib.Path(__file__).resolve().parent

_pg_spec = importlib.util.spec_from_file_location("postgres_runner", _HERE / "postgres-runner.py")
_pg_module = importlib.util.module_from_spec(_pg_spec)
_pg_spec.loader.exec_module(_pg_module)
run_migrations_and_read_history = _pg_module.run_migrations_and_read_history

_registry_spec = importlib.util.spec_from_file_location("local_registry", _HERE / "local-registry.py")
_registry_module = importlib.util.module_from_spec(_registry_spec)
_registry_spec.loader.exec_module(_registry_module)
local_registry_ref = _registry_module.local_registry_ref

__all__ = ["collect_flyway_inventory", "CollectorError"]


class CollectorError(Exception):
    pass


def _image_digest(tarball_path: str, image_name: str) -> str:
    with local_registry_ref(tarball_path, image_name) as ref:
        proc = subprocess.run(["crane", "digest", ref], capture_output=True, text=True, timeout=30,
                               check=False)
        if proc.returncode != 0:
            raise CollectorError(f"crane digest exited {proc.returncode} for {ref}: "
                                  f"{proc.stderr.strip()[:1000]}")
        digest = proc.stdout.strip()
        if not digest.startswith("sha256:"):
            raise CollectorError(f"crane digest printed an unexpected value: {digest!r}")
        return digest


def collect_flyway_inventory(monolith_tarball_path: str) -> dict:
    bound_to = _image_digest(monolith_tarball_path, "monolith")
    rows = run_migrations_and_read_history(monolith_tarball_path)

    migrations = []
    for row in rows:
        migrations.append({
            "installedRank": row["installed_rank"],
            "version": row["version"],
            "type": row["type"],
            "script": row["script"],
            "checksum": row["checksum"],
            "success": row["success"],
        })

    checksum = hashlib.sha256(canonical.canonical_bytes(migrations)).hexdigest()

    return {
        "boundTo": bound_to,
        "checksum": checksum,
        "migrations": migrations,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/scripts && python collect-flyway-inventory.test.py`
Expected: `passed=5 failed=0`. This test runs the full Postgres+monolith cycle TWICE (the last assertion
compares two independent runs), so expect it to take roughly twice as long as Task 1's test — that is
the cost of proving determinism for real rather than asserting it from reading the code.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/collect-flyway-inventory.py .github/scripts/collect-flyway-inventory.test.py
git commit -m "feat(ci): assemble a flywayInventory document from a real Postgres migration run"
```

---

## Explicitly out of scope for this plan

- Observation assembly (slice 4) combining this with the other 4 evidence documents.
- Anything pushing to GHCR (slice 5).
- Handling a genuinely FAILED migration (a script that errors mid-run) end-to-end — the schema already
  supports `success: false` per-row (this plan's implementation reads whatever Postgres actually
  recorded, including a false success value verbatim, so a real failure would already flow through
  correctly), but no task here deliberately constructs a broken migration to prove it, since doing so
  safely would require a second, throwaway migration file that must never be committed to
  `backend/monolith/src/main/resources/db/migration/` (the real schema history) — worth a follow-up
  task if the team wants an explicit negative-path test, using a scratch copy of the monolith image with
  an injected bad migration rather than touching the real migration set.

## Self-Review Notes

- Spec coverage: design doc §3.4 (read from a throwaway Postgres after real migrations run, not from
  the image's scripts or source tree) is implemented by Task 1; `observation.schema.json`'s
  `flywayInventory`/`migration` shape is implemented and schema-validated by Task 2.
- Placeholder scan: no TBD/TODO. Task 1 Step 5's port-binding fallback note gives a concrete alternative
  (the same `-p 0:PORT` + `docker port` pattern `local-registry.py` already uses) rather than leaving
  "handle this somehow."
- Type consistency: `run_migrations_and_read_history` returns real-Postgres-column-named dicts;
  `collect_flyway_inventory` is the only place that reshapes them into the schema's camelCase names —
  checked against both Task 1's and Task 2's actual code above, not just described in prose.
