# .github/scripts/collect-frontend-config-fingerprint.py
"""Wraps backend/infra/production/scripts/frontend-config.sh to produce markerContent's
frontendConfigFingerprint field.

Does not reimplement the canonicalization -- that script is the single source of truth the deploy
scripts also read (its own header explains why two implementations of one hash would disagree
eventually, and disagree at deploy time rather than at review time). This module only shells out to it
and validates the shape of what comes back.
"""
import re
import subprocess

__all__ = ["collect_frontend_config_fingerprint", "CollectorError"]

_HEX64 = re.compile(r"^[0-9a-f]{64}$")


class CollectorError(Exception):
    pass


def collect_frontend_config_fingerprint(repo_root: str, bash: str = "bash") -> str:
    script = f"{repo_root}/backend/infra/production/scripts/frontend-config.sh"
    try:
        proc = subprocess.run(
            [bash, "-c", f'source "{script}" && frontend_config_fingerprint "$1"',
             "--", repo_root],
            capture_output=True, text=True, timeout=60, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"{bash} is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"frontend_config_fingerprint timed out for {repo_root}") from exc

    if proc.returncode != 0:
        raise CollectorError(
            f"frontend_config_fingerprint exited {proc.returncode} for {repo_root}: "
            f"{proc.stderr.strip()[:2000]}"
        )

    fingerprint = proc.stdout.strip()
    if not _HEX64.match(fingerprint):
        raise CollectorError(
            f"frontend_config_fingerprint printed {fingerprint!r}, not a 64-char hex digest"
        )
    return fingerprint


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("usage: collect-frontend-config-fingerprint.py <repo-root>", file=sys.stderr)
        sys.exit(2)
    print(collect_frontend_config_fingerprint(sys.argv[1]))
