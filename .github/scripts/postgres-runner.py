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
             "-p", "0:5432",
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

        pg_host, pg_port = _resolve_postgres_host(pg_container)

        run_proc = subprocess.run(
            ["docker", "run", "-d", "--rm",
             "-e", f"SPRING_DATASOURCE_URL=jdbc:postgresql://{pg_host}:{pg_port}/{POSTGRES_DB}",
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


def _resolve_postgres_host(pg_container: str) -> tuple:
    # Confirmed for real on this machine (Docker Desktop for Windows): `docker inspect -f
    # {{.NetworkSettings.IPAddress}}` returns an empty IPAddress map (containers get their address
    # from Docker Desktop's internal network plumbing, not the classic bridge-network field this
    # template reads), so a container-to-container reference by IP never resolves. This falls back to
    # the same -p 0:PORT + `docker port` pattern local-registry.py already uses -- but unlike that
    # module (host reaching a container), here it's container-to-container (the monolith container
    # reaching Postgres), so the published host port is addressed via host.docker.internal, which
    # Docker Desktop resolves to the host from inside any container.
    pg_inspect = subprocess.run(
        ["docker", "inspect", "-f", "{{.NetworkSettings.IPAddress}}", pg_container],
        capture_output=True, text=True, timeout=30, check=False,
    )
    pg_ip = pg_inspect.stdout.strip()
    if pg_inspect.returncode == 0 and pg_ip:
        return pg_ip, "5432"

    port_proc = subprocess.run(
        ["docker", "port", pg_container, "5432/tcp"],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if port_proc.returncode != 0 or not port_proc.stdout.strip():
        raise CollectorError(f"could not read Postgres container {pg_container}'s IP address "
                              f"({pg_inspect.stderr.strip()[:300]}) and could not read its published "
                              f"port either: {port_proc.stderr.strip()[:500]}")
    # docker port may print one line per address family; the host port number is the same on both.
    host_port = port_proc.stdout.strip().splitlines()[0].rsplit(":", 1)[1]
    return "host.docker.internal", host_port


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
