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
