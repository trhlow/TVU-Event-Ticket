#!/usr/bin/env python3
# .github/scripts/publish-finalize.py
"""CLI entrypoint for the publish-finalize CI job (roadmap 3.1): calls finalize_publish, which
re-reads the registry fresh (never trusting publish-prepare's own memory of what it pushed -- design
doc section 4's own rule) and only promotes/finalizes when the decision says it is safe. Exits non-zero
whenever the run did not actually publish, so the job -- and the workflow -- fails loudly rather than
reporting green on a release that never happened.
"""
import argparse
import importlib.util
import json
import pathlib
import sys

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_run_publish = _load("run-publish")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--monolith-ref", required=True)
    parser.add_argument("--frontend-ref", required=True)
    parser.add_argument("--release-ref", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--environment", required=True)
    parser.add_argument("--repo-root", required=True)
    args = parser.parse_args()

    result = _run_publish.finalize_publish(
        args.monolith_ref, args.frontend_ref, args.release_ref, args.commit, args.environment,
        args.repo_root,
    )

    print(json.dumps({"published": result["published"], "decision": result["decision"]}, sort_keys=True))

    if not result["published"]:
        print(f"::error::publish did not complete: {result['decision']['reason']}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 -- a CLI entrypoint's job is to report, not to traceback
        print(f"publish-finalize.py failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
