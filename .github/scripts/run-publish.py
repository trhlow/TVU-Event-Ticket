# .github/scripts/run-publish.py
"""The real orchestration loop (design doc section 4's 8 steps, roadmap 2.4), split into two callable
phases because attestation creation cannot live inside either one:

`actions/attest-build-provenance`/`actions/attest` are GitHub Actions, not CLIs -- each exchanges the
JOB's own OIDC token (`id-token: write`) for a Sigstore-signed attestation, which is only reachable from
a discrete workflow step, never from a script the workflow merely invokes. So the real CI shape is three
jobs: this module's `push_publish_artifacts` (push everything, emit the list of {name, digest,
predicateType, predicate} subjects still needing attestation), a matrix job that runs one real
`actions/attest`/`actions/attest-build-provenance` step per subject, then this module's
`finalize_publish` (re-read the registry -- now with real attestations on it -- decide, and promote only
if safe). `run_publish` composes both phases in one call for local testing, where no real attestation is
obtainable either way (roadmap 2.4's own test already established this).

Design doc section 4 describes the finalize step as "if COMPLETE, promote and write the final marker" --
but publish-decision.sh's own state machine (read directly, not re-derived) returns PARTIAL at this exact
point, not COMPLETE: COMPLETE requires finalMarker to already be present, which is only true after
finalize writes it. The real, correct signal is whether the decision's own actions include
"publish_final_marker" -- publish-decision.sh's own comment calls this a self-recoverable PARTIAL,
deliberately distinct from the unrecoverable kind (no trustworthy prepared marker). finalize_publish acts
on the real actions list, not the state name design doc section 4 assumed.

Which attestation action a subject needs is not uniform, and using attest-build-provenance for
everything (as an earlier version of ci.yml's own template comment assumed) would be wrong: it always
creates a fixed SLSA provenance predicate (predicateType https://slsa.dev/provenance/v1), which only
matches PREDICATE_TYPES["markerProvenance"]. The other 10 subjects (2 evidence-set carriers, 8 per-kind
reports) carry this project's own custom predicate types (SPDX, or the evts.id.vn scan/evidence-set
types) and need the generic `actions/attest` action instead, with an explicit predicate-type and a
predicate file holding the real document -- the SAME document already pushed as that subject's OCI blob,
since the decision cross-checks the pushed blob's digest against what the attestation itself declares.
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

__all__ = ["push_publish_artifacts", "finalize_publish", "run_publish", "PublishRunError"]

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


def push_publish_artifacts(monolith_tarball_path: str, frontend_tarball_path: str,
                            monolith_registry_ref: str, frontend_registry_ref: str,
                            release_registry_ref: str, commit: str, environment: str, repo_root: str,
                            ruleset_path: str, ignore_file_path: str, bash: str = "bash",
                            username: str = None, password: str = None,
                            expected_override: dict = None) -> dict:
    """Design doc section 4 steps 3-5: push candidate images, run the 4 collectors per image and push
    each image's evidence set, collect the real Flyway inventory, write the prepared marker. Returns
    the 11 real attestation subjects this run now needs signed (predicateType/predicate for the 10
    that need `actions/attest`'s generic path; the marker is flagged `kind: "provenance"` for
    `actions/attest-build-provenance` instead, which needs no predicate content -- see module
    docstring) before anything can be verified.
    """
    tarballs = {"monolith": monolith_tarball_path, "frontend": frontend_tarball_path}
    registry_refs = {"monolith": monolith_registry_ref, "frontend": frontend_registry_ref}

    # Step 3: push candidate tags, read back the real digest/size from the registry -- never computed
    # locally (section 3.5: no guessing what got pushed).
    digests, sizes = {}, {}
    for image in _IMAGES:
        digests[image], sizes[image] = _push_candidate(tarballs[image], registry_refs[image], commit, image)

    # Step 2/4: the 4 collectors per image, then each image's evidence set.
    evidence_documents = {}
    per_kind_digest = {image: {} for image in _IMAGES}
    evidence_set_digest = {}
    subjects = []
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

        # Every report attestation's SUBJECT is the evidence-set CARRIER, not the report's own blob
        # digest -- and this is not a workaround, it is what the reader already requires:
        # evidence-set-attestation.py verifies each kind against `oci://{registry_ref}:{evidence_set_tag}`
        # and distinguishes the four kinds purely by predicateType. It also has to be this way
        # mechanically: a report is a LAYER BLOB inside the carrier manifest, not a manifest of its own,
        # so push-to-registry cannot attach anything to it -- confirmed for real 2026-08-12, when the 8
        # report jobs failed with "Error fetching .../manifests/<report-digest> - expected 200, received
        # 404" while the 2 carriers and the marker (all real manifests) succeeded in the same run.
        # The report's own canonical digest still travels as reportDigest inside the predicate content
        # and the marker's evidence claims, which is what the decision cross-checks against the layer
        # descriptor -- that binding is unaffected.
        for kind, document in docs_for_envelope.items():
            # The signed predicate's reportDigest must name the report layer AS STORED. The document's
            # own reportDigest cannot: the collector computes it over the document WITHOUT that field
            # (it has to -- a document containing its own digest is circular), so it equals
            # digest(doc-without-reportDigest) while the layer descriptor equals digest(doc-as-stored).
            # Those two are unequal by construction, which made publish-decision.sh's binding check
            # ("the signed predicate does not name the report actually fetched") fail every single
            # time -- confirmed against real data, not inferred.
            #
            # Spec section 8/10 is explicit that this value is "read only from the attestation side
            # and compared against the report's own descriptor digest", so the attestation carries the
            # stored-blob digest and the layer keeps its self-excluding one. per_kind_digest is
            # already exactly digest(canonical_bytes(document)) -- the same bytes publish_evidence_set
            # pushed -- so this is the descriptor digest, not a second, separately-derived hash.
            predicate = document
            if kind != "sbom":
                predicate = {**document, "reportDigest": per_kind_digest[image][kind]}
            subjects.append({
                "name": f"{image}-{kind}-report", "subjectName": registry_refs[image],
                "digest": evidence_set_digest[image],
                "predicateType": _envelope.PREDICATE_TYPES[kind], "predicate": predicate,
                "kind": "generic",
            })

        # The evidence-set carrier's own attestation predicate is not schema-validated by content (only
        # its predicateType is checked, matching evidence-set-lookup.py's `verification` block) -- this
        # is a real, minimal, honest statement about what the carrier binds together, not a placeholder.
        subjects.append({
            "name": f"{image}-evidence-set", "subjectName": registry_refs[image],
            "digest": evidence_set_digest[image],
            "predicateType": _envelope.PREDICATE_TYPES["evidenceSet"],
            "predicate": {"subjectDigest": digests[image], "kinds": list(docs_for_envelope.keys())},
            "kind": "generic",
        })

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

    # Step 5: the prepared marker. Uses actions/attest-build-provenance (real GH-native build metadata),
    # not the generic path -- its predicateType (slsa.dev/provenance/v1) is the one PREDICATE_TYPES
    # entry that actually matches what that action produces; the marker needs no predicate content here.
    marker_digest = _marker_envelope.publish_marker(release_registry_ref, f"prepared-{commit}",
                                                      marker_content, username=username, password=password)
    subjects.append({"name": "release-marker", "subjectName": release_registry_ref,
                      "digest": marker_digest, "predicateType": None,
                      "predicate": None, "kind": "provenance"})

    return {"expected": effective_expected, "markerContent": marker_content, "subjects": subjects}


def finalize_publish(monolith_registry_ref: str, frontend_registry_ref: str, release_registry_ref: str,
                      commit: str, environment: str, repo_root: str, bash: str = "bash",
                      username: str = None, password: str = None, expected_override: dict = None,
                      call_publish_decision_fn=None) -> dict:
    """Design doc section 4 steps 6-8: decide from what is now really on the registry -- by this point,
    with real attestations already created by the workflow's matrix job -- and only promote/finalize
    when the decision says it is safe to. Independent of push_publish_artifacts: everything it needs is
    re-read fresh from the registry, never carried over from that phase's own in-memory state (design
    doc section 4's own rule -- the decision must never trust a job's memory of what it pushed).
    """
    # call_publish_decision_fn exists only for testing: a real, non-trivial observation can exceed a
    # Windows dev machine's ~32KB CreateProcess command-line limit (publish-decision.sh always argv-
    # passes the observation to its embedded python, regardless of caller -- not something this module
    # can change without touching that frozen, CI-verified script). Production always uses the real
    # subprocess call_publish_decision; real GitHub Actions Linux runners have a ~2MB ARG_MAX and never
    # hit this.
    decide = call_publish_decision_fn or call_publish_decision
    registry_refs = {"monolith": monolith_registry_ref, "frontend": frontend_registry_ref}

    expected = build_expected(repo_root, bash=bash)
    effective_expected = dict(expected)
    if expected_override is not None:
        effective_expected.update(expected_override)

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
        # publish-decision.sh's own retry-queue semantics on the next run, not this function's job.
        return {"published": False, "decision": decision, "observation": observation}

    # Step 7: promote each image tag the decision actually asked for, then re-tag the SAME prepared
    # marker manifest under its final name -- never repushing new bytes, so
    # finalMarker.markerDigest == preparedMarker.markerDigest by construction (publish-decision.sh's
    # own "promotion re-tags one artifact" invariant, checked at decide()'s self-contradiction gate).
    # Because it is the SAME digest, gh attestation verify's own digest-keyed lookup finds the prepared
    # marker's already-created attestation under the final tag too -- no separate attestation needed.
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


def run_publish(monolith_tarball_path: str, frontend_tarball_path: str,
                 monolith_registry_ref: str, frontend_registry_ref: str, release_registry_ref: str,
                 commit: str, environment: str, repo_root: str,
                 ruleset_path: str, ignore_file_path: str, bash: str = "bash",
                 username: str = None, password: str = None,
                 expected_override: dict = None, call_publish_decision_fn=None) -> dict:
    """Composes both phases in one call, for local testing only -- no real attestation is obtainable
    locally either way (roadmap 2.4's own test already established this), so there is nothing to gain
    locally from the two-phase split real CI needs. Production CI calls push_publish_artifacts and
    finalize_publish as separate jobs, with a real matrix of attestation steps in between.
    """
    push_result = push_publish_artifacts(
        monolith_tarball_path, frontend_tarball_path, monolith_registry_ref, frontend_registry_ref,
        release_registry_ref, commit, environment, repo_root, ruleset_path, ignore_file_path, bash=bash,
        username=username, password=password, expected_override=expected_override,
    )
    result = finalize_publish(
        monolith_registry_ref, frontend_registry_ref, release_registry_ref, commit, environment,
        repo_root, bash=bash, username=username, password=password,
        expected_override=push_result["expected"], call_publish_decision_fn=call_publish_decision_fn,
    )
    return {**result, "subjects": push_result["subjects"]}
