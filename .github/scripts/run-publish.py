# .github/scripts/run-publish.py
"""The real orchestration loop (design doc section 4's 8 steps, roadmap 2.4): push candidate images,
push evidence sets, write a prepared marker, then decide from what is now really on the registry --
never from the drafts this function built along the way. Only when the decision says it is safe to
finish does anything get promoted; any other outcome stops here with nothing further published.

Design doc section 4 describes step 7 as "if COMPLETE, promote and write the final marker" -- but
publish-decision.sh's own state machine (read directly, not re-derived) returns PARTIAL at this exact
point, not COMPLETE: COMPLETE requires finalMarker to already be present, which is only true after this
very function writes it. The real, correct signal is whether the decision's own actions include
"publish_final_marker" -- publish-decision.sh's own comment calls this a self-recoverable PARTIAL,
deliberately distinct from the unrecoverable kind (no trustworthy prepared marker). This function acts
on the real actions list, not the state name design doc section 4 assumed.
"""
import hashlib
import importlib.util
import pathlib
import subprocess

_HERE = pathlib.Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_canonical = _load("canonical")
_collect_sbom = _load("collect-sbom")
_collect_vuln = _load("collect-vulnerability-scan")
_collect_secret = _load("collect-secret-scan")
_collect_flyway = _load("collect-flyway-inventory")
_evidence_set_envelope = _load("evidence-set-envelope")
_marker_envelope = _load("marker-envelope")
_assemble_observation = _load("assemble-observation")
_call_publish_decision = _load("call-publish-decision")
_envelope = _load("envelope")

build_expected = _assemble_observation.build_expected
assemble_observation = _assemble_observation.assemble_observation
call_publish_decision = _call_publish_decision.call_publish_decision

__all__ = ["run_publish", "PublishRunError"]

_IMAGES = ("monolith", "frontend")


class PublishRunError(Exception):
    pass


def _crane(*args):
    proc = subprocess.run(["crane", *args], capture_output=True, text=True, timeout=120, check=False)
    if proc.returncode != 0:
        raise PublishRunError(f"crane {' '.join(args)} exited {proc.returncode}: "
                               f"{proc.stderr.strip()[:1000]}")
    return proc.stdout.strip()


def _push_candidate(tarball_path, registry_ref, commit, image):
    candidate_ref = f"{registry_ref}:candidate-{image}-{commit}"
    _crane("push", tarball_path, candidate_ref)
    digest = _crane("digest", candidate_ref)
    manifest = _crane("manifest", candidate_ref)
    size = len(manifest.encode("utf-8"))
    return digest, size


def _digest_of(document):
    return "sha256:" + hashlib.sha256(_canonical.canonical_bytes(document)).hexdigest()


def run_publish(monolith_tarball_path: str, frontend_tarball_path: str,
                 monolith_registry_ref: str, frontend_registry_ref: str, release_registry_ref: str,
                 commit: str, environment: str, repo_root: str,
                 ruleset_path: str, ignore_file_path: str, bash: str = "bash",
                 username: str = None, password: str = None,
                 expected_override: dict = None, call_publish_decision_fn=None) -> dict:
    # call_publish_decision_fn exists only for testing: a real, non-trivial observation can exceed a
    # Windows dev machine's ~32KB CreateProcess command-line limit (publish-decision.sh always argv-
    # passes the observation to its embedded python, regardless of caller -- not something this module
    # can change without touching that frozen, CI-verified script). Production always uses the real
    # subprocess call_publish_decision; real GitHub Actions Linux runners have a ~2MB ARG_MAX and never
    # hit this.
    decide = call_publish_decision_fn or call_publish_decision
    tarballs = {"monolith": monolith_tarball_path, "frontend": frontend_tarball_path}
    registry_refs = {"monolith": monolith_registry_ref, "frontend": frontend_registry_ref}

    # Step 3 (design doc section 4): push candidate tags, read back the real digest/size from the
    # registry -- never computed locally (section 3.5: no guessing what got pushed).
    digests, sizes = {}, {}
    for image in _IMAGES:
        digests[image], sizes[image] = _push_candidate(tarballs[image], registry_refs[image], commit, image)

    # Step 2/4: the 4 collectors per image, then each image's evidence set.
    evidence_documents = {}
    per_kind_digest = {image: {} for image in _IMAGES}
    evidence_set_digest = {}
    for image in _IMAGES:
        sbom_result = _collect_sbom.collect_sbom(tarballs[image], image)
        vuln_document = _collect_vuln.collect_vulnerability_scan(tarballs[image], image, ignore_file_path)
        layer_document = _collect_secret.collect_layer_secret_scan(tarballs[image], image, ruleset_path)
        fs_document = _collect_secret.collect_filesystem_secret_scan(tarballs[image], image, ruleset_path)

        evidence_documents[image] = {
            "sbom": sbom_result, "vulnerabilityScan": vuln_document,
            "layerSecretScan": layer_document, "filesystemSecretScan": fs_document,
        }
        per_kind_digest[image] = {
            "sbom": sbom_result["canonicalDigest"],
            "vulnerabilityScan": _digest_of(vuln_document),
            "layerSecretScan": _digest_of(layer_document),
            "filesystemSecretScan": _digest_of(fs_document),
        }
        docs_for_envelope = {"sbom": sbom_result["document"], "vulnerabilityScan": vuln_document,
                              "layerSecretScan": layer_document, "filesystemSecretScan": fs_document}
        evidence_set_digest[image] = _evidence_set_envelope.publish_evidence_set(
            registry_refs[image], f"evidence-{image}-sha-{commit}", docs_for_envelope,
            digests[image], sizes[image], username=username, password=password,
        )

    # flywayInventory: monolith only (design doc section 3.4) -- a real Postgres run of the monolith
    # image's own migrations, not read from the image or the source tree.
    flyway_inventory = _collect_flyway.collect_flyway_inventory(tarballs["monolith"])

    expected = build_expected(repo_root, bash=bash)
    effective_expected = dict(expected)
    if expected_override is not None:
        effective_expected.update(expected_override)

    marker_content = {
        "commit": commit, "environment": environment,
        "frontendConfigFingerprint": expected["frontendConfigFingerprint"],
        "images": dict(digests),
        "provenance": {image: {"revision": commit, "subjectDigest": digests[image]} for image in _IMAGES},
        "evidence": {
            "sbom": {image: {"digest": per_kind_digest[image]["sbom"], "subjectDigest": digests[image],
                              "predicateType": _envelope.PREDICATE_TYPES["sbom"],
                              "documentValidated": True,
                              "packageCount": evidence_documents[image]["sbom"]["packageCount"]}
                     for image in _IMAGES},
            "vulnerabilityScan": {
                image: {"digest": per_kind_digest[image]["vulnerabilityScan"],
                        "subjectDigest": digests[image],
                        "predicateType": _envelope.PREDICATE_TYPES["vulnerabilityScan"],
                        "passed": evidence_documents[image]["vulnerabilityScan"]["declaredOutcome"]}
                for image in _IMAGES},
            "layerSecretScan": {
                image: {"digest": per_kind_digest[image]["layerSecretScan"],
                        "subjectDigest": digests[image],
                        "predicateType": _envelope.PREDICATE_TYPES["layerSecretScan"],
                        "passed": evidence_documents[image]["layerSecretScan"]["declaredOutcome"]}
                for image in _IMAGES},
            "filesystemSecretScan": {
                image: {"digest": per_kind_digest[image]["filesystemSecretScan"],
                        "subjectDigest": digests[image],
                        "predicateType": _envelope.PREDICATE_TYPES["filesystemSecretScan"],
                        "passed": evidence_documents[image]["filesystemSecretScan"]["declaredOutcome"]}
                for image in _IMAGES},
            "evidenceSetDigest": dict(evidence_set_digest),
        },
        "flywayInventory": flyway_inventory,
    }

    # Step 5: the prepared marker.
    _marker_envelope.publish_marker(release_registry_ref, f"prepared-{commit}", marker_content,
                                     username=username, password=password)

    # Step 6: decide from what is now really on the registry.
    observation = assemble_observation(
        monolith_registry_ref, frontend_registry_ref, release_registry_ref, commit, environment,
        repo_root, bash=bash, username=username, password=password,
        expected_override=effective_expected,
    )
    decision = decide(observation, bash=bash)

    if decision["state"] == "COMPLETE":
        # Re-running against a commit that is already fully published (e.g. a retried CI job): the
        # final marker was already there before this call, so there is nothing left to promote --
        # this is a real, successful outcome, not the "nothing safe to do" case below.
        return {"published": True, "decision": decision, "observation": observation}

    if "publish_final_marker" not in decision["actions"]:
        # Step 8: not safe to finish. Stop -- nothing further is promoted or finalized. The prepared
        # marker and evidence sets already pushed stay as-is; recovering from a stop here is
        # publish-decision.sh's own retry-queue semantics on the next run, not this loop's job.
        return {"published": False, "decision": decision, "observation": observation}

    # Step 7: promote each image tag the decision actually asked for, then re-tag the SAME prepared
    # marker manifest under its final name -- never repushing new bytes, so
    # finalMarker.markerDigest == preparedMarker.markerDigest by construction (publish-decision.sh's
    # own "promotion re-tags one artifact" invariant, checked at decide()'s self-contradiction gate).
    for image in _IMAGES:
        if f"promote_{image}_tag" in decision["actions"]:
            _crane("tag", f"{registry_refs[image]}:candidate-{image}-{commit}", f"{image}-{commit}")
    _crane("tag", f"{release_registry_ref}:prepared-{commit}", f"release-{commit}")

    final_observation = assemble_observation(
        monolith_registry_ref, frontend_registry_ref, release_registry_ref, commit, environment,
        repo_root, bash=bash, username=username, password=password,
        expected_override=effective_expected,
    )
    final_decision = decide(final_observation, bash=bash)
    if final_decision["state"] != "COMPLETE":
        raise PublishRunError(
            f"promoted tags and the final marker but the decision did not confirm COMPLETE "
            f"afterward: {final_decision!r}"
        )

    return {"published": True, "decision": final_decision, "observation": final_observation}
