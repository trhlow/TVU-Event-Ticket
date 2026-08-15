# .github/scripts/call-publish-decision.py
"""Calls the already CI-verified publish-decision.sh with a real observation dict, over stdin
(publish-decision.sh's own usage: "OBSERVATION_JSON_FILE (or observation on stdin)" -- its own test
suite uses the stdin form: `printf '%s' "$obs" | bash "$subject"`). This module owns none of the
decision logic; it is only the call boundary between assemble_observation's Python and the bash/Python
decision script, exactly as thin as the WSL-relay pattern already used for the collector shell-outs.
"""
import importlib.util
import json
import pathlib
import subprocess

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_canonical = _load("canonical")

__all__ = ["call_publish_decision", "PublishDecisionError"]


class PublishDecisionError(Exception):
    pass


def call_publish_decision(observation: dict, bash: str = "bash") -> dict:
    observation_bytes = _canonical.canonical_bytes(observation)
    script_path = str(_HERE / "publish-decision.sh")
    try:
        proc = subprocess.run(
            [bash, script_path],
            input=observation_bytes,
            capture_output=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise PublishDecisionError(f"{bash!r} is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise PublishDecisionError(f"publish-decision.sh timed out: {exc}") from exc

    if proc.returncode != 0:
        raise PublishDecisionError(
            f"publish-decision.sh exited {proc.returncode}: {proc.stderr.decode('utf-8', 'replace')[:2000]}"
        )

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise PublishDecisionError(
            f"publish-decision.sh printed non-JSON on stdout: {exc}; "
            f"stdout={proc.stdout[:1000]!r} stderr={proc.stderr[:1000]!r}"
        ) from exc
