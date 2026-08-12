# .github/scripts/assemble-observation.py
"""Assembles a real, full observation (observation.schema.json's own top-level shape: schemaVersion,
commit, environment, expected, lookups{10 keys}) by calling every reader built in Phase 1, against
whatever registry the caller points it at (a throwaway local one for testing, eventually GHCR).

Tag naming matches this project's own real fixtures (.github/contracts/fixtures/invalid-semantics/
a-migration-failed.json, read this session): monolith-<commit>/frontend-<commit> (Tag),
candidate-monolith-<commit>/candidate-frontend-<commit> (Candidate), release-<commit> (finalMarker),
prepared-<commit> (preparedMarker), evidence-monolith-sha-<commit>/evidence-frontend-sha-<commit>
(EvidenceSet). DigestObject lookups are NOT by a separate tag -- they re-resolve the same digest the
Tag lookup already found, at that exact digest, proving the digest object independently exists (the
manifest spec's own two-step read discipline). A DigestObject lookup is `skipped`, not `absent` or
`error`, when its own Tag lookup never resolved to a digest to check in the first place -- the
question was never asked, matching skippableObjectLookup's own real distinction (spec: "the question
was never asked, which is different from asking and being told no").
"""
import importlib.util
import pathlib

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_oci_read = _load("oci-read")
read_object_lookup = _oci_read.read_object_lookup

_marker_lookup = _load("marker-lookup")
read_marker_lookup = _marker_lookup.read_marker_lookup

_evidence_set_lookup = _load("evidence-set-lookup")
read_evidence_set_lookup = _evidence_set_lookup.read_evidence_set_lookup

_build_expected = _load("build-expected")
build_expected = _build_expected.build_expected

__all__ = ["assemble_observation"]


def _digest_object_lookup(registry_ref: str, tag_lookup_result: dict,
                           username: str = None, password: str = None) -> dict:
    if tag_lookup_result.get("status") != "present":
        return {"status": "skipped", "reason": "no_claimed_digest", "queriedRef": None}
    digest = tag_lookup_result["digest"]
    return read_object_lookup(registry_ref, digest, username=username, password=password)


def assemble_observation(monolith_registry_ref: str, frontend_registry_ref: str,
                          release_registry_ref: str, commit: str, environment: str,
                          repo_root: str, bash: str = "bash",
                          username: str = None, password: str = None,
                          expected_override: dict = None) -> dict:
    # expected_override exists only for testing against a throwaway registry: build_expected's
    # registry/repositories are real, hardcoded GHCR constants (build-expected.test.py proves them),
    # and publish-decision.sh real-binds every queriedRef against them -- a local registry cannot
    # satisfy that binding without substituting matching values. Production callers never pass this.
    expected = expected_override if expected_override is not None else build_expected(repo_root, bash=bash)

    monolith_tag = read_object_lookup(monolith_registry_ref, f"monolith-{commit}",
                                       username=username, password=password)
    frontend_tag = read_object_lookup(frontend_registry_ref, f"frontend-{commit}",
                                       username=username, password=password)

    monolith_digest_object = _digest_object_lookup(monolith_registry_ref, monolith_tag,
                                                     username=username, password=password)
    frontend_digest_object = _digest_object_lookup(frontend_registry_ref, frontend_tag,
                                                     username=username, password=password)

    monolith_candidate = read_object_lookup(monolith_registry_ref, f"candidate-monolith-{commit}",
                                             username=username, password=password)
    frontend_candidate = read_object_lookup(frontend_registry_ref, f"candidate-frontend-{commit}",
                                             username=username, password=password)

    final_marker = read_marker_lookup(release_registry_ref, f"release-{commit}",
                                       expected["sourceRepository"], expected["signerWorkflow"],
                                       source_revision=commit,
                                       username=username, password=password)
    prepared_marker = read_marker_lookup(release_registry_ref, f"prepared-{commit}",
                                          expected["sourceRepository"], expected["signerWorkflow"],
                                          source_revision=commit,
                                          username=username, password=password)

    # Evidence sets are pushed with subject_digest set to the CANDIDATE digest (design doc section 4
    # step 3 precedes step 4): the candidate tag is what exists at push time, pre-promotion, and stays
    # pointing at the same digest afterward. Binding this comparison to *Tag instead (as an earlier
    # version of this function did) made subjectMatches structurally unable to be true on the very
    # first decision call of a run -- the one that decides whether promotion is safe -- since *Tag is
    # legitimately absent until promotion happens. Found via run-publish.test.py's real end-to-end
    # exercise (roadmap 2.4): the first test ever to combine a present evidence-set with a
    # pre-promotion decision call.
    monolith_subject_digest = (monolith_candidate.get("digest")
                                if monolith_candidate.get("status") == "present" else "sha256:" + "0" * 64)
    frontend_subject_digest = (frontend_candidate.get("digest")
                                if frontend_candidate.get("status") == "present" else "sha256:" + "0" * 64)

    monolith_evidence_set = read_evidence_set_lookup(
        monolith_registry_ref, f"evidence-monolith-sha-{commit}", monolith_subject_digest,
        source_revision=commit, expected_source_repo=expected["sourceRepository"],
        expected_signer_workflow=expected["signerWorkflow"], username=username, password=password,
    )
    frontend_evidence_set = read_evidence_set_lookup(
        frontend_registry_ref, f"evidence-frontend-sha-{commit}", frontend_subject_digest,
        source_revision=commit, expected_source_repo=expected["sourceRepository"],
        expected_signer_workflow=expected["signerWorkflow"], username=username, password=password,
    )

    return {
        "schemaVersion": 1,  # the observation format's own version, exactly the integer 1 -- unrelated
                              # to any OCI manifest's own schemaVersion (2), a different field entirely.
        "commit": commit,
        "environment": environment,
        "expected": expected,
        "lookups": {
            "finalMarker": final_marker,
            "preparedMarker": prepared_marker,
            "monolithTag": monolith_tag,
            "frontendTag": frontend_tag,
            "monolithDigestObject": monolith_digest_object,
            "frontendDigestObject": frontend_digest_object,
            "monolithCandidate": monolith_candidate,
            "frontendCandidate": frontend_candidate,
            "monolithEvidenceSet": monolith_evidence_set,
            "frontendEvidenceSet": frontend_evidence_set,
        },
    }
