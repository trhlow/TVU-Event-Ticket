#!/usr/bin/env python3
# .github/scripts/publish-push.py
"""CLI entrypoint for the publish-prepare CI job (roadmap 3.1/3.2): calls push_publish_artifacts,
writes each generic subject's predicate to its own file (actions/attest's predicate-file input needs a
real file, not inline JSON), and writes subjects.json -- the shape ci.yml's publish-attest job consumes
as its matrix source via fromJson(). Prints the same subjects list (without predicate bodies, which can
be large) to stdout so the calling step can also capture it into a job output directly.
"""
import argparse
import importlib.util
import json
import os
import pathlib
import sys

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_run_publish = _load("run-publish")
_canonical = _load("canonical")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--monolith-tarball", required=True)
    parser.add_argument("--frontend-tarball", required=True)
    parser.add_argument("--monolith-ref", required=True)
    parser.add_argument("--frontend-ref", required=True)
    parser.add_argument("--release-ref", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--environment", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--ruleset", required=True)
    parser.add_argument("--ignore-file", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    # Read from the environment, not a flag: a secret does not belong in argv, which is visible to
    # anything on the runner that can read /proc or the job's own step log if it ever echoes its
    # command line. GHCR accepts the workflow's own GITHUB_TOKEN as the password for a push, scoped by
    # this job's packages: write permission.
    username = os.environ.get("GHCR_USERNAME")
    password = os.environ.get("GHCR_TOKEN")

    result = _run_publish.push_publish_artifacts(
        args.monolith_tarball, args.frontend_tarball, args.monolith_ref, args.frontend_ref,
        args.release_ref, args.commit, args.environment, args.repo_root, args.ruleset,
        args.ignore_file, username=username, password=password,
    )

    output_dir = pathlib.Path(args.output_dir)
    predicates_dir = output_dir / "predicates"
    predicates_dir.mkdir(parents=True, exist_ok=True)

    subjects_for_matrix = []
    for subject in result["subjects"]:
        entry = {"name": subject["name"], "subjectName": subject["subjectName"],
                  "digest": subject["digest"], "kind": subject["kind"],
                  "predicateType": subject["predicateType"]}
        if subject["kind"] == "generic":
            predicate_path = predicates_dir / f"{subject['name']}.json"
            predicate_path.write_bytes(_canonical.canonical_bytes(subject["predicate"]))
            # Relative to output_dir, not predicates_dir: publish-attest downloads the whole
            # output_dir artifact and needs a path it can join against its own checkout root.
            entry["predicateFile"] = f"predicates/{subject['name']}.json"
        subjects_for_matrix.append(entry)

    (output_dir / "subjects.json").write_text(json.dumps(subjects_for_matrix), encoding="utf-8")
    print(json.dumps(subjects_for_matrix))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 -- a CLI entrypoint's job is to report, not to traceback
        print(f"publish-push.py failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
