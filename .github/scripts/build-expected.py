# .github/scripts/build-expected.py
"""Builds observation.schema.json's `expected` block: sourceRepository, repositories{release,monolith,
frontend}, frontendConfigFingerprint, signerWorkflow, registry -- mostly project constants, plus one
real collector call for the fingerprint (never hand-typed, since it must match
frontend-config.sh's own computation exactly or a real config drift goes undetected).
"""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent

_fingerprint_spec = importlib.util.spec_from_file_location(
    "collect_frontend_config_fingerprint", _HERE / "collect-frontend-config-fingerprint.py"
)
_fingerprint_module = importlib.util.module_from_spec(_fingerprint_spec)
_fingerprint_spec.loader.exec_module(_fingerprint_module)
collect_frontend_config_fingerprint = _fingerprint_module.collect_frontend_config_fingerprint

__all__ = ["build_expected", "SOURCE_REPOSITORY", "REGISTRY", "SIGNER_WORKFLOW", "REPOSITORIES"]

# Real values for this project, not placeholders -- ghcr.io/owner/name/{release,monolith,frontend} is
# the layout design doc section 2 already committed to (release carries markers, monolith/frontend
# carry the two images and their own evidence-set tags).
SOURCE_REPOSITORY = "trhlow/TVU-Event-Ticket"
REGISTRY = "ghcr.io"
SIGNER_WORKFLOW = ".github/workflows/ci.yml"
REPOSITORIES = {
    "release": "trhlow/tvu-event-ticket/release",
    "monolith": "trhlow/tvu-event-ticket/monolith",
    "frontend": "trhlow/tvu-event-ticket/frontend",
}


def build_expected(repo_root: str, bash: str = "bash") -> dict:
    fingerprint = collect_frontend_config_fingerprint(repo_root, bash=bash)
    return {
        "sourceRepository": SOURCE_REPOSITORY,
        "repositories": dict(REPOSITORIES),
        "frontendConfigFingerprint": fingerprint,
        "signerWorkflow": SIGNER_WORKFLOW,
        "registry": REGISTRY,
    }


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) != 2:
        print("usage: build-expected.py <repo-root>", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(build_expected(sys.argv[1])))
