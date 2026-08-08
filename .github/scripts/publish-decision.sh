#!/usr/bin/env bash
# Decides what a publish run may do to the registry, from what it observed there.
#
# A pure function on purpose: it reads an observation document and writes a decision. Nothing here
# talks to a registry, which makes the whole state table testable without one and lets the caller
# express "I could not find out" as an input rather than as a crash.
#
# Three invariants:
#
#   1. No trustworthy prepared marker means no self-recoverable PARTIAL. Objects with nothing to
#      explain them are unexplained, and unexplained is CONFLICT.
#
#   2. Absence must be observed, never inferred. Every fact rests on an explicit, well-formed
#      observation. Missing, mistyped or duplicated keys are UNKNOWN. Unknown keys are UNKNOWN at
#      the four levels this script closes -- the root, `expected`, `expected.repositories` and
#      `lookups`, plus each lookup's own field set -- and are tolerated inside marker content,
#      where the schema forbids them but nothing enforces it at runtime. §8.6 keeps the schema out
#      of the decision path, so what the schema alone says is documentation, not a gate.
#
#   3. A marker asserts nothing about itself. `attested: true` inside a document is that document
#      claiming to be trustworthy. What counts is the collector's verification result: which
#      subject digest was verified, which workflow and repository signed it, which source revision
#      it was built from, and whether the policy passed. Those live in `verification`, and the
#      marker's own content is only believed once they check out.
#
# Usage: publish-decision.sh OBSERVATION_JSON_FILE   (or observation on stdin)
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

# Read here rather than inside Python: the program arrives on Python's stdin through the heredoc,
# so a read there comes back empty -- which once made every observation classify as UNKNOWN, the
# safest possible wrong answer and therefore the easiest to miss.
if [[ "${1:--}" == "-" ]]; then
  observation="$(cat)"
else
  observation="$(cat -- "$1")"
fi

# The script directory goes first so the program can import the canonical form rather than restate
# it. Two statements of one canonical form are two forms, and the second one drifts silently: it
# produces different bytes, and different bytes are a different checksum for the same migrations.
"$PYTHON" - "$script_dir" "$observation" <<'PYTHON'
import hashlib
import json
import re
import sys

sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads
from envelope import (ARTIFACT_TYPE, EMPTY_CONFIG_DATA, EMPTY_CONFIG_DIGEST,
                      EMPTY_CONFIG_MEDIA_TYPE, EMPTY_CONFIG_SIZE, MANIFEST_MEDIA_TYPE)

# One rule per line, so deleting one is one mutation with one witness. Folding the four config
# constants behind a single comparison would let one witness redden the deletion of all four, and
# three of them would then have no evidence that anything depends on them -- the same defect this
# suite has already been repaired for seven times, one level finer.
ENVELOPE_CONSTANTS = (
    (("schemaVersion",), 2),
    (("mediaType",), MANIFEST_MEDIA_TYPE),
    (("artifactType",), ARTIFACT_TYPE),
    (("config", "mediaType"), EMPTY_CONFIG_MEDIA_TYPE),
    (("config", "digest"), EMPTY_CONFIG_DIGEST),
    (("config", "size"), EMPTY_CONFIG_SIZE),
    (("config", "data"), EMPTY_CONFIG_DATA),
    (("layers", 0, "mediaType"), ARTIFACT_TYPE),
)
# Exactly what an observed envelope may carry. `raw` is conditional -- present when all three
# checks passed, forbidden otherwise -- and that half is a separate rule below; this one only says
# which names exist at all.
ENVELOPE_FIELDS = frozenset({"digestVerified", "sizeVerified", "parsed", "raw"})
CONFIG_FIELDS = frozenset({"mediaType", "digest", "size", "data"})
LAYER_FIELDS = frozenset({"mediaType", "digest", "size"})
# A sentinel rather than None: a manifest may legitimately hold a null somewhere, and "absent" and
# "present and null" are different findings.
MISSING = object()


def at_path(node, path):
    """The value at a path in a raw manifest, or MISSING if any step of it is not there."""
    for step in path:
        if type(step) is int:
            if type(node) is not list or len(node) <= step:
                return MISSING
        elif type(node) is not dict or step not in node:
            return MISSING
        node = node[step]
    return node


SCHEMA_VERSION = 1
# fullmatch everywhere: `$` also matches before a trailing newline, so a digest with \n appended
# satisfied `match` and was accepted as well formed.
SHA1 = re.compile(r"[0-9a-f]{40}")
HEX64 = re.compile(r"[0-9a-f]{64}")
SOURCE_REPOSITORY = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+")
OCI_REPOSITORY = re.compile(r"[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)+")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
IMAGES = ("monolith", "frontend")

REQUIRED_LOOKUPS = (
    "finalMarker", "preparedMarker",
    "monolithTag", "frontendTag",
    "monolithDigestObject", "frontendDigestObject",
    "monolithCandidate", "frontendCandidate",
    "monolithEvidenceSet", "frontendEvidenceSet",
)

MARKER_LOOKUPS = ("finalMarker", "preparedMarker")
EVIDENCE_SET_LOOKUPS = ("monolithEvidenceSet", "frontendEvidenceSet")

TOP_LEVEL_KEYS = ("schemaVersion", "commit", "environment", "expected", "lookups")
EXPECTED_KEYS = ("sourceRepository", "repositories", "frontendConfigFingerprint",
                 "signerWorkflow", "registry")

REPOSITORY_ROLES = ("release", "monolith", "frontend")

# Which repository each lookup must have been queried in. Written out rather than inferred from the
# name, because inference needs an `else` branch and 3b adds exactly two *EvidenceSet lookups that
# belong to an image's repository -- they would be pinned to release silently and correctly-looking.
LOOKUP_REPOSITORY = {
    "finalMarker": "release",
    "preparedMarker": "release",
    "monolithTag": "monolith",
    "monolithDigestObject": "monolith",
    "monolithCandidate": "monolith",
    "monolithEvidenceSet": "monolith",
    "frontendTag": "frontend",
    "frontendDigestObject": "frontend",
    "frontendCandidate": "frontend",
    "frontendEvidenceSet": "frontend",
}

# A set, not a tuple, and the difference is load-bearing. Membership in a tuple compares with `==`
# and accepts an unhashable status quietly; membership in a set hashes, so an unhashable one raises
# out of this test unless the type check above it has already refused it. That check was written
# because exactly that TypeError once escaped as a traceback instead of a decision -- with a tuple
# here it would still be written, still be needed one day, and no longer be provable.
VALID_STATUSES = frozenset({"present", "absent", "error", "skipped"})

# Exactly the fields each observed state may carry. A lookup that says "absent" while carrying an
# error code is two answers at once, and picking either is guessing.
#
# One shared set for every "present" lookup left two divergences alive after the reconciliation: a
# tag carrying `verification` and `markerDigest`, and a marker carrying `digest`, are both rejected
# by the schema and were both accepted here. The single guard further down (`"content" not in
# lookup`) closed one of three doors, and no fixture touched the other two -- which is why the
# agreement suite reported agreement anyway.
LOOKUP_FIELDS = {
    # Every lookup records what it asked about. Without queriedRef an "absent" is an assertion with
    # no subject, and two lookups that queried different references look identical.
    "absent": ({"status", "observedCode", "queriedRef"}, {"status", "observedCode", "queriedRef"}),
    "error": ({"status", "queriedRef"}, {"status", "queriedRef", "code", "timeout", "detail"}),
    # A digest object cannot be queried before a marker names a digest. "skipped" says the question
    # was never asked, which is different from asking and being told no.
    # queriedRef is carried even here, and must be null: the key's presence records that the
    # collector considered the lookup and decided against asking, while omitting it entirely is
    # indistinguishable from a collector that forgot the field existed.
    "skipped": ({"status", "reason", "queriedRef"}, {"status", "reason", "queriedRef"}),
}

# Present is the one status whose fields depend on what was looked up, so it gets its own table.
# Required equals allowed on purpose: there is no optional field on a present lookup, and an
# optional one would be a fact nobody stated dressed up as a fact omitted.
#
# content is the one exception, and it is not an optional field: whether it must be there is decided
# by the envelope, in marker_problems, where the layer count can be read. Required here it would be
# demanded of a marker whose envelope identifies no payload -- a well-formed observation refused as
# malformed, and refused before anything looked at the envelope that explains it.
PRESENT_FIELDS = {
    "marker": ({"status", "queriedRef", "markerDigest", "verification", "ociEnvelope"},
               {"status", "queriedRef", "markerDigest", "verification", "ociEnvelope", "content"}),
    "object": ({"status", "queriedRef", "digest"},
               {"status", "queriedRef", "digest"}),
    "evidenceSet": ({"status", "queriedRef", "carrierDigest", "verification", "subjectMatches",
                     "layersValid", "reports"},
                    {"status", "queriedRef", "carrierDigest", "verification", "subjectMatches",
                     "layersValid", "reports"}),
}

SKIP_REASONS = {"no_claimed_digest"}


class Invalid(Exception):
    """The observation cannot be reasoned about. Never a state -- always UNKNOWN, never retryable."""


def require(condition, message):
    if not condition:
        raise Invalid(message)


def exact_int(value, where):
    # `type(...) is int` rather than isinstance: bool is a subclass of int, so True == 1 and an
    # observation with schemaVersion true was accepted as version 1.
    require(type(value) is int, f"{where} must be an integer, got {value!r}")
    return value


def exact_str(value, where, pattern=None):
    require(type(value) is str, f"{where} must be a string, got {value!r}")
    require(pattern is None or pattern.fullmatch(value), f"{where} is malformed: {value!r}")
    return value


def as_dict(value, where):
    require(type(value) is dict, f"{where} must be an object")
    return value


def validate(obs):
    obs = as_dict(obs, "observation")
    require(exact_int(obs.get("schemaVersion"), "schemaVersion") == SCHEMA_VERSION,
            f"schemaVersion must be {SCHEMA_VERSION}")
    exact_str(obs.get("commit"), "commit", SHA1)
    require(type(obs.get("environment")) is str and obs["environment"],
            "environment must be a non-empty string")

    # The schema says additionalProperties:false at both levels, but §8.6 forbids a schema gate in
    # front of the decision, so a rule the decision does not restate is a rule nothing enforces.
    # The key that used to live here is the reason this is not cosmetic: an observation still
    # carrying `expected.repository` comes from a collector that was migrated halfway, and it would
    # otherwise be answered as though it were current.
    unexpected_top = [key for key in obs if key not in TOP_LEVEL_KEYS]
    require(not unexpected_top,
            f"observation has unexpected keys: {', '.join(sorted(unexpected_top))}")

    expected = as_dict(obs.get("expected"), "expected")
    unexpected_expected = [key for key in expected if key not in EXPECTED_KEYS]
    require(not unexpected_expected,
            f"expected has unexpected keys: {', '.join(sorted(unexpected_expected))}")
    exact_str(expected.get("sourceRepository"), "expected.sourceRepository", SOURCE_REPOSITORY)
    repositories = as_dict(expected.get("repositories"), "expected.repositories")
    missing_roles = [role for role in REPOSITORY_ROLES if role not in repositories]
    require(not missing_roles, f"expected.repositories missing: {', '.join(missing_roles)}")
    extra_roles = [role for role in repositories if role not in REPOSITORY_ROLES]
    require(not extra_roles,
            f"expected.repositories has unexpected keys: {', '.join(sorted(extra_roles))}")
    for role in REPOSITORY_ROLES:
        exact_str(repositories[role], f"expected.repositories.{role}", OCI_REPOSITORY)
    # Three packages, or the pinning below excludes nothing: with two roles sharing a repository a
    # reference into the wrong package satisfies the scope of both, and the only thing left telling
    # them apart is the tag, whose shape this contract deliberately does not fix yet. The guard
    # would be green and empty.
    reused = sorted({name for name in repositories.values()
                     if list(repositories.values()).count(name) > 1})
    require(not reused,
            f"expected.repositories must name three different repositories; "
            f"{', '.join(repr(name) for name in reused)} is used more than once")
    exact_str(expected.get("frontendConfigFingerprint"), "expected.frontendConfigFingerprint", HEX64)
    require(type(expected.get("signerWorkflow")) is str and expected["signerWorkflow"],
            "expected.signerWorkflow must be a non-empty string")
    require(type(expected.get("registry")) is str and expected["registry"],
            "expected.registry must be a non-empty string")

    lookups = as_dict(obs.get("lookups"), "lookups")
    missing = [name for name in REQUIRED_LOOKUPS if name not in lookups]
    require(not missing, f"lookups missing: {', '.join(missing)}")
    unexpected = [name for name in lookups if name not in REQUIRED_LOOKUPS]
    require(not unexpected, f"lookups has unexpected keys: {', '.join(sorted(unexpected))}")

    for name, lookup in lookups.items():
        lookup = as_dict(lookup, f"lookups.{name}")
        status = lookup.get("status")
        # Checked as a string first: an unhashable value such as [] raised TypeError out of the
        # membership test, so the script died with a traceback and no decision at all -- a caller
        # reading stdout got nothing rather than UNKNOWN.
        require(type(status) is str, f"lookups.{name}.status must be a string, got {status!r}")
        require(status in VALID_STATUSES,
                f"lookups.{name}.status must be one of {sorted(VALID_STATUSES)}, got {status!r}")
        if status == "present":
            kind = ("marker" if name in MARKER_LOOKUPS
                    else "evidenceSet" if name in EVIDENCE_SET_LOOKUPS
                    else "object")
            required_fields, allowed_fields = PRESENT_FIELDS[kind]
        else:
            kind = status
            required_fields, allowed_fields = LOOKUP_FIELDS[status]
        present_fields = set(lookup)
        require(required_fields <= present_fields,
                f"lookups.{name} is missing {', '.join(sorted(required_fields - present_fields))}")
        require(present_fields <= allowed_fields,
                f"lookups.{name} is a {kind} lookup and carries fields that do not belong to it: "
                f"{', '.join(sorted(present_fields - allowed_fields))}")

        # Every lookup has to have been made in the repository that lookup belongs to. A well-formed
        # observation of another package answers a question nobody asked, and its absences would
        # authorise a build here.
        #
        # The require below has no witness and cannot be given one. The key set of `lookups` was
        # pinned to exactly REQUIRED_LOOKUPS a few lines up, and LOOKUP_REPOSITORY has exactly those
        # ten keys, so there is no observation -- collected or written by hand -- for which
        # `.get(name)` returns None. Deleting it leaves the suite green, and any case that seemed to
        # witness it would be passing for another reason. It stays as a developer-error guard: the
        # day an eleventh lookup joins REQUIRED_LOOKUPS and not this table, the decision says UNKNOWN
        # instead of dying with a KeyError, which is also why this is `.get` plus a require rather
        # than a bare index. Same standing as the `"content" not in marker` early return further
        # down -- unwitnessable, kept deliberately, and declared rather than papered over with a
        # case that would go green either way.
        role = LOOKUP_REPOSITORY.get(name)
        require(role is not None,
                f"lookups.{name} has no repository assigned; the decision cannot say where it "
                f"should have been queried")
        scope = f"{expected['registry']}/{repositories[role]}"

        ref = lookup.get("queriedRef")
        if status == "skipped":
            require(ref is None,
                    f"lookups.{name}.queriedRef must be null; nothing was queried, and a reference "
                    f"here claims otherwise")
        else:
            require(type(ref) is str and ref, f"lookups.{name}.queriedRef must be a non-empty string")
            require(ref.startswith(scope + ":") or ref.startswith(scope + "@"),
                    f"lookups.{name}.queriedRef {ref!r} is outside the {role} repository {scope}")

        if status == "skipped":
            require(lookup.get("reason") in SKIP_REASONS,
                    f"lookups.{name}.reason must be one of {sorted(SKIP_REASONS)}")
            require(name.endswith("DigestObject"),
                    f"lookups.{name} may not be skipped; only a digest object can go unqueried")
        elif status == "absent":
            # Absence is a fact the collector observed, not the absence of a fact. Only a 404 says
            # "this is not there"; anything else says "I did not get an answer".
            require(exact_int(lookup.get("observedCode"), f"lookups.{name}.observedCode") == 404,
                    f"lookups.{name} claims absence without an observed 404")
        elif status == "error":
            code = lookup.get("code")
            require(code is None or type(code) is int, f"lookups.{name}.code must be an integer")
        elif name.endswith(("Tag", "Candidate", "DigestObject")):
            exact_str(lookup.get("digest"), f"lookups.{name}.digest", DIGEST)
    return obs


def marker_problems(marker, obs, where):
    """Everything wrong with a marker. Empty means it may be trusted."""
    problems = []
    expected = obs["expected"]

    # What the collector verified, not what the document says about itself.
    verification = marker.get("verification")
    if type(verification) is not dict:
        problems.append(f"{where}.verification is missing; the collector must record what it "
                        f"actually verified, not repeat the marker's own claim")
        return problems

    marker_digest = marker.get("markerDigest")
    if type(marker_digest) is not str or not DIGEST.fullmatch(marker_digest):
        problems.append(f"{where}.markerDigest is not a sha256 reference")
    if verification.get("subjectDigest") != marker_digest:
        problems.append(f"{where}.verification.subjectDigest is "
                        f"{verification.get('subjectDigest')!r}, not the marker it describes")
    if verification.get("attestationVerified") is not True:
        problems.append(f"{where}.verification.attestationVerified is "
                        f"{verification.get('attestationVerified')!r}, must be boolean true")
    # The source repository, not any of the three the images live in. These were one string until
    # commit 4, which is why a marker signed by the release package could not be distinguished from
    # one signed by the pipeline.
    if verification.get("signerRepository") != expected["sourceRepository"]:
        problems.append(f"{where} signed by {verification.get('signerRepository')!r}, expected "
                        f"{expected['sourceRepository']!r}")
    if verification.get("signerWorkflow") != expected["signerWorkflow"]:
        problems.append(f"{where} signed by workflow {verification.get('signerWorkflow')!r}, "
                        f"expected {expected['signerWorkflow']!r}")
    if verification.get("sourceRevision") != obs["commit"]:
        problems.append(f"{where}.verification.sourceRevision is "
                        f"{verification.get('sourceRevision')!r}, expected {obs['commit']!r}")
    predicate = verification.get("predicateType")
    if type(predicate) is not str or not predicate:
        # Which statement was verified, not merely that something was. An attestation of one
        # predicate type says nothing about the claim another predicate type would have made.
        problems.append(f"{where}.verification.predicateType is {predicate!r}, must be a non-empty "
                        f"string naming what was attested")
    if verification.get("policyPassed") is not True:
        problems.append(f"{where}.verification.policyPassed is "
                        f"{verification.get('policyPassed')!r}, must be boolean true")

    envelope = marker.get("ociEnvelope")
    require(type(envelope) is dict, f"{where}.ociEnvelope must be an object")
    # The envelope's field set is closed here and not only in the schema. Section 8.6 keeps schema
    # validation off this path deliberately, so a rule stated only there is a rule nothing enforces
    # where it matters: a fixture carrying a derived `layerCount` was rejected by the schema and
    # reached COMPLETE with a publish action anyway. observedEnvelope dropped the three derived
    # fields because each restated something raw already says, and two statements of one fact are
    # one fact plus a disagreement waiting to happen -- so an envelope that brings one back is a
    # collector this decision does not know how to read. UNKNOWN, like every other unknown key.
    unexpected_envelope = [key for key in envelope if key not in ENVELOPE_FIELDS]
    require(not unexpected_envelope,
            f"{where}.ociEnvelope has unexpected keys: {', '.join(sorted(unexpected_envelope))}")
    for flag in ("digestVerified", "sizeVerified", "parsed"):
        require(type(envelope.get(flag)) is bool,
                f"{where}.ociEnvelope.{flag} must be boolean")
    all_verified = all(envelope[flag] for flag in ("digestVerified", "sizeVerified", "parsed"))
    # raw is a document of bytes the collector was allowed to read. Present when it was not
    # allowed, or absent when it was, and the observation contradicts itself -- neither half can be
    # trusted, so this is UNKNOWN rather than a verdict about the producer.
    require(("raw" in envelope) == all_verified,
            f"{where}.ociEnvelope.raw is "
            f"{'present' if 'raw' in envelope else 'absent'} while the three checks say "
            f"{all_verified}")

    # A payload can be read only when the bytes were verified AND exactly one layer says which
    # bytes are the payload. Two layers is no answer to "which one", so nothing may be parsed --
    # section 2's rule, one level down. raw absent makes the count unanswerable, which is itself a
    # reason content cannot be here.
    #
    # Outside the verdict branches, at the same level as the raw rule above. Inside the `else` it
    # would only run once both verifications had passed, so a marker whose digest check failed and
    # which carries content anyway -- a self-contradictory observation, and self-contradiction is
    # UNKNOWN -- would reach CONFLICT through the failure branch instead, right verdict, wrong rule.
    #
    # The condition is read off raw's presence, not off digestVerified and sizeVerified again. The
    # require above has just settled that raw is present exactly when all three checks passed, so
    # restating those flags here would make this a second statement of that rule -- and it would
    # then answer in its place: with the raw rule deleted, every witness of it that carries content
    # would still reach UNKNOWN through this one, and the rule could be removed with the suite
    # green. A type check rather than a bare index, because a raw that is not an object has no layer
    # count either, and reading one off it is a traceback instead of a decision.
    raw = envelope.get("raw")
    layers = raw.get("layers") if type(raw) is dict else None
    one_layer = type(layers) is list and len(layers) == 1
    require(("content" in marker) == one_layer,
            f"{where}.content is {'present' if 'content' in marker else 'absent'} while the "
            f"envelope {'permits' if one_layer else 'forbids'} it")

    if not envelope["digestVerified"] or not envelope["sizeVerified"]:
        problems.append(f"{where} envelope failed verification: digestVerified="
                        f"{envelope['digestVerified']}, sizeVerified={envelope['sizeVerified']}")
    elif not envelope["parsed"]:
        problems.append(f"{where} envelope bytes matched the descriptor but are not JSON")
    else:
        # Without this, raw is only a retyping of the manifest and a non-canonical envelope passes
        # unread -- which is the thing section 2 exists to stop. It also makes the "build once,
        # re-tag, never rebuild" invariant self-enforcing: two markers with one content have one
        # raw and therefore one digest.
        recomputed = "sha256:" + hashlib.sha256(canonical_bytes(envelope["raw"])).hexdigest()
        if recomputed != marker.get("markerDigest"):
            problems.append(f"{where}.ociEnvelope.raw hashes to {recomputed}, but the marker is "
                            f"named {marker.get('markerDigest')!r}")
        # A verdict about the producer, not a defect in the observation: the bytes are exactly the
        # ones the digest names, and they carry two payloads or none. Which of them the marker means
        # is not a question this decision may answer by picking one.
        if not one_layer:
            problems.append(f"{where} envelope carries "
                            f"{len(layers) if type(layers) is list else 'no'} layers, "
                            f"expected exactly one")
        # Shape is judged whether or not the digest matched, and the two findings accumulate. A raw
        # that hashes to something else is already untrustworthy, so nothing here changes a verdict
        # -- but the operator reading the problem list gets both the retyping and what was wrong
        # with it, rather than being sent to look at bytes the list never describes.
        raw_manifest = envelope["raw"]
        for path, expected_value in ENVELOPE_CONSTANTS:
            found = at_path(raw_manifest, path)
            if found is MISSING or type(found) is not type(expected_value) or found != expected_value:
                shown = "absent" if found is MISSING else repr(found)
                problems.append(f"{where} envelope {'.'.join(str(s) for s in path)} is {shown}, "
                                f"not {expected_value!r}")
        # Read through at_path, not raw_manifest.get: a raw that is not an object at all reaches
        # here (its digest mismatch and its missing layer count are both already recorded), and
        # `.get` on an int is a traceback instead of a decision. Measured, not anticipated.
        config = at_path(raw_manifest, ("config",))
        if type(config) is dict and set(config) != CONFIG_FIELDS:
            problems.append(f"{where} envelope config declares {sorted(config)}, not "
                            f"{sorted(CONFIG_FIELDS)}")
        if one_layer and type(layers[0]) is dict and set(layers[0]) != LAYER_FIELDS:
            problems.append(f"{where} envelope layer declares {sorted(layers[0])}, not "
                            f"{sorted(LAYER_FIELDS)}")
        # A marker is the root of a release, so it hangs under nothing. 3b's evidence set carries a
        # subject on purpose; do not generalise this rule to it.
        if at_path(raw_manifest, ("subject",)) is not MISSING:
            problems.append(f"{where} envelope carries a subject; a marker hangs under nothing")
        # Forbidden by the key being absent, not by it being empty: {} and no key at all are
        # different bytes and therefore different digests, so "empty or absent" is two artifacts.
        #
        # The manifest level only. Section 2 forbids annotations at all three, but config and layer
        # already have closed field sets, so `annotations` there is a field-set violation and the
        # two guards above refuse it first. A branch for those levels could be deleted with the
        # suite green no matter how its witness were written -- an unwitnessable guard, which is
        # what this commit exists to stop shipping. The two witnesses stay: they pin the contract's
        # answer at those levels, and which guard supplies it is an implementation detail.
        if at_path(raw_manifest, ("annotations",)) is not MISSING:
            problems.append(f"{where} envelope carries annotations at the manifest level")
        # Payload binding, which invariant 4 has claimed since the first draft and nothing ever
        # implemented. Section 2 closes the layer's field set, so digest and size are the only two
        # fields left free -- and they are exactly the ones tying this envelope to the document the
        # decision goes on to read. Without them a manifest can be perfectly canonical, hash to the
        # digest that names it, and describe bytes that have nothing to do with `content`.
        #
        # Two rules, not one, for the same reason digestVerified and sizeVerified are two booleans:
        # a size is checked to bound a download and a digest is checked to identify what arrived.
        #
        # `one_layer` is the whole condition on the marker side: the require above settled that
        # content is present exactly when the envelope permits it, so re-testing `"content" in
        # marker` here would be a second statement of that rule that no witness could ever kill.
        # The type check is not a rule but a crash guard -- a layer of `[5]` has no `.get`.
        if one_layer and type(layers[0]) is dict:
            payload = canonical_bytes(marker["content"])
            payload_digest = "sha256:" + hashlib.sha256(payload).hexdigest()
            if layers[0].get("digest") != payload_digest:
                problems.append(f"{where} envelope layer names {layers[0].get('digest')!r} but the "
                                f"content hashes to {payload_digest}")
            if layers[0].get("size") != len(payload):
                problems.append(f"{where} envelope layer declares size {layers[0].get('size')!r} "
                                f"but the content is {len(payload)} bytes")

    # Everything below reads the payload, and there is only a payload when the envelope identified
    # one. The require above has already refused a marker that disagrees with its envelope about
    # that, so reaching here without content means the envelope forbade it and the layer-count
    # verdict has already been recorded. Not a KeyError guard -- everything below reads through
    # .get, so without this the decision would merely add "content must be an object" about a marker
    # the contract has just declared correct to have none. The verdict is identical either way,
    # which is why no case in the suite can witness this line and why deleting it leaves the suite
    # green; what changes is the reason an operator is handed at three in the morning.
    if "content" not in marker:
        return problems

    content = marker.get("content")
    if type(content) is not dict:
        problems.append(f"{where}.content must be an object")
        return problems

    for field, want in (("commit", obs["commit"]),
                        ("environment", obs["environment"]),
                        ("frontendConfigFingerprint", expected["frontendConfigFingerprint"])):
        if content.get(field) != want:
            problems.append(f"{where}.content.{field} is {content.get(field)!r}, expected {want!r}")

    images = content.get("images")
    if type(images) is not dict or set(images) != set(IMAGES):
        problems.append(f"{where}.content.images must name exactly {', '.join(IMAGES)}")
        return problems
    for image in IMAGES:
        digest = images.get(image)
        if type(digest) is not str or not DIGEST.fullmatch(digest):
            problems.append(f"{where}.content.images.{image} is not a sha256 digest: {digest!r}")

    provenance = content.get("provenance")
    if type(provenance) is not dict:
        problems.append(f"{where}.content.provenance must be an object")
    else:
        for image in IMAGES:
            entry = provenance.get(image)
            if type(entry) is not dict or entry.get("revision") != obs["commit"]:
                problems.append(f"{where}.content.provenance.{image} does not record revision "
                                f"{obs['commit']}")
            elif entry.get("subjectDigest") != images.get(image):
                problems.append(f"{where}.content.provenance.{image} describes "
                                f"{entry.get('subjectDigest')!r}, not the image it is filed under")

    evidence = content.get("evidence")
    if type(evidence) is not dict:
        problems.append(f"{where}.content.evidence must be an object")
    else:
        # Four separate results, because they answer different questions and a single overall pass
        # hides which of them was never run. The two secret scans are not one check: a filesystem
        # scan sees the final tree, so a credential added in one layer and deleted in a later one is
        # invisible to it and present in the image anyone can pull apart.
        for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):
            per_image = evidence.get(kind)
            if type(per_image) is not dict:
                problems.append(f"{where}.content.evidence.{kind} must be an object keyed by image")
                continue
            for image in IMAGES:
                entry = per_image.get(image)
                if type(entry) is not dict:
                    problems.append(f"{where}.content.evidence.{kind}.{image} must be an object")
                    continue
                if type(entry.get("digest")) is not str or not DIGEST.fullmatch(entry["digest"]):
                    problems.append(f"{where}.content.evidence.{kind}.{image}.digest is not a "
                                    f"digest")
                if entry.get("subjectDigest") != images.get(image):
                    problems.append(f"{where}.content.evidence.{kind}.{image} describes "
                                    f"{entry.get('subjectDigest')!r}, not the image it covers")
                predicate = entry.get("predicateType")
                if type(predicate) is not str or not predicate:
                    problems.append(f"{where}.content.evidence.{kind}.{image}.predicateType is "
                                    f"{predicate!r}, must name what the document states")
                if entry.get("passed") is not True:
                    # A digest proves a file was produced. It does not say the scan behind it found
                    # nothing, and a failing scan filed as evidence is evidence against release.
                    problems.append(f"{where}.content.evidence.{kind}.{image}.passed is "
                                    f"{entry.get('passed')!r}, must be boolean true")

        # 3b commit 2 (spec section 3): the marker no longer verifies evidence itself, it only
        # claims a digest and the decision resolves that claim against the lookup that already did
        # the verifying. A marker asserting evidenceSetDigest with nothing to back it, or a digest
        # that disagrees with what monolithEvidenceSet/frontendEvidenceSet actually observed, is
        # exactly the self-assertion section 1 exists to close -- CONFLICT, not trusted on its word.
        evidence_set_digest = evidence.get("evidenceSetDigest")
        if type(evidence_set_digest) is not dict:
            problems.append(f"{where}.content.evidence.evidenceSetDigest must be an object")
        else:
            for image in IMAGES:
                claimed_digest = evidence_set_digest.get(image)
                if type(claimed_digest) is not str or not DIGEST.fullmatch(claimed_digest):
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} is not a "
                                    f"digest")
                    continue
                lookup = obs["lookups"][f"{image}EvidenceSet"]
                if lookup["status"] != "present":
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} claims "
                                    f"{claimed_digest}, but the {image} evidence-set lookup is "
                                    f"{lookup['status']}, not present -- the claim does not resolve")
                    continue
                set_problems = evidence_set_problems(lookup, obs, f"lookups.{image}EvidenceSet")
                if set_problems:
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} claims "
                                    f"{claimed_digest}, but the {image} evidence-set is not "
                                    f"trustworthy: {'; '.join(set_problems)}")
                elif lookup["carrierDigest"] != claimed_digest:
                    problems.append(f"{where}.content.evidence.evidenceSetDigest.{image} is "
                                    f"{claimed_digest}, but the {image} evidence-set lookup resolved "
                                    f"{lookup['carrierDigest']}")

    problems.extend(inventory_problems(content.get("flywayInventory"), images.get("monolith"),
                                       f"{where}.content.flywayInventory"))
    return problems


def evidence_set_problems(lookup, obs, where):
    """Everything wrong with a present evidence-set lookup. Empty means it may be adopted, or a
    marker's evidenceSetDigest claim against it may be trusted."""
    problems = []
    expected = obs["expected"]

    verification = lookup.get("verification")
    if type(verification) is not dict:
        problems.append(f"{where}.verification is missing; the collector must record what it "
                        f"actually verified, not repeat the carrier's own claim")
        return problems

    carrier_digest = lookup.get("carrierDigest")
    if type(carrier_digest) is not str or not DIGEST.fullmatch(carrier_digest):
        problems.append(f"{where}.carrierDigest is not a sha256 reference")
    if verification.get("subjectDigest") != carrier_digest:
        problems.append(f"{where}.verification.subjectDigest is "
                        f"{verification.get('subjectDigest')!r}, not the carrier it describes")
    if verification.get("attestationVerified") is not True:
        problems.append(f"{where}.verification.attestationVerified is "
                        f"{verification.get('attestationVerified')!r}, must be boolean true")
    if verification.get("signerRepository") != expected["sourceRepository"]:
        problems.append(f"{where} signed by {verification.get('signerRepository')!r}, expected "
                        f"{expected['sourceRepository']!r}")
    if verification.get("signerWorkflow") != expected["signerWorkflow"]:
        problems.append(f"{where} signed by workflow {verification.get('signerWorkflow')!r}, "
                        f"expected {expected['signerWorkflow']!r}")
    if verification.get("sourceRevision") != obs["commit"]:
        problems.append(f"{where}.verification.sourceRevision is "
                        f"{verification.get('sourceRevision')!r}, expected {obs['commit']!r}")
    predicate = verification.get("predicateType")
    if type(predicate) is not str or not predicate:
        # Which statement was verified, not merely that something was. Mirrors marker_problems'
        # identical guard: an attestation of one predicate type says nothing about the claim
        # another predicate type would have made.
        problems.append(f"{where}.verification.predicateType is {predicate!r}, must be a non-empty "
                        f"string naming what was attested")
    if verification.get("policyPassed") is not True:
        problems.append(f"{where}.verification.policyPassed is "
                        f"{verification.get('policyPassed')!r}, must be boolean true")

    if lookup.get("subjectMatches") is not True:
        problems.append(f"{where}.subjectMatches is {lookup.get('subjectMatches')!r}, the "
                        f"carrier's subject does not name this image")
    if lookup.get("layersValid") is not True:
        problems.append(f"{where}.layersValid is {lookup.get('layersValid')!r}, the carrier does "
                        f"not have the required four report layers")

    reports = lookup.get("reports")
    if type(reports) is not dict:
        problems.append(f"{where}.reports is missing")
        return problems
    for kind in ("sbom", "vulnerabilityScan", "layerSecretScan", "filesystemSecretScan"):
        pair = reports.get(kind)
        if type(pair) is not dict:
            problems.append(f"{where}.reports.{kind} is missing")
            continue
        report_lookup = pair.get("reportLookup")
        if type(report_lookup) is not dict or report_lookup.get("status") != "present":
            problems.append(f"{where}.reports.{kind}.reportLookup is not present; adopt requires "
                            f"every report to already exist, not a partial set")
        attestation_lookup = pair.get("attestationLookup")
        if type(attestation_lookup) is not dict or attestation_lookup.get("status") != "present":
            # Section 3: a tag that exists but is missing a kind's attestation is CONFLICT, and the
            # pipeline does not sign supplementally afterward to launder an artifact already there.
            problems.append(f"{where}.reports.{kind}.attestationLookup is not present; adopting "
                            f"without every kind's attestation would sign on trust rather than "
                            f"verify it")
    return problems


def inventory_problems(inventory, monolith_digest, where):
    """A Flyway inventory that is only shaped like one proves nothing about the schema."""
    if type(inventory) is not dict:
        return [f"{where} must be an object"]
    problems = []
    if inventory.get("boundTo") != monolith_digest:
        problems.append(f"{where}.boundTo is {inventory.get('boundTo')!r}, not the monolith digest "
                        f"it describes")

    migrations = inventory.get("migrations")
    if type(migrations) is not list or not migrations:
        return problems + [f"{where}.migrations must be a non-empty list"]

    seen_versions = set()
    seen_repeatables = set()
    seen_ranks = set()
    for index, record in enumerate(migrations):
        at = f"{where}.migrations[{index}]"
        if type(record) is not dict:
            problems.append(f"{at} must be an object")
            continue
        # installed_rank is Flyway's own application order, and it is the only thing that says which
        # migration ran before which. List position is an artifact of however the collector happened
        # to read the table, so two inventories describing the same schema must not hash differently
        # because a query came back in another order.
        rank = record.get("installedRank")
        if type(rank) is not int or rank < 1:
            problems.append(f"{at}.installedRank must be a positive integer, got {rank!r}")
        elif rank in seen_ranks:
            problems.append(f"{at}.installedRank {rank} appears twice; Flyway assigns it once")
        else:
            seen_ranks.add(rank)
        # Repeatable migrations (R__) have no version in Flyway's history table, and several of
        # them share that absence. Requiring a unique string would have blocked the first release
        # that added one -- and the schema, not the release, would have been wrong.
        version = record.get("version")
        if version is not None and (type(version) is not str or not version):
            problems.append(f"{at}.version must be a non-empty string or null for a repeatable")
        for field in ("type", "script"):
            if type(record.get(field)) is not str or not record[field]:
                problems.append(f"{at}.{field} must be a non-empty string")
        checksum = record.get("checksum")
        if checksum is not None and type(checksum) is not int:
            # Flyway's own checksum is a CRC32 integer, and null where it records none. A string
            # here means someone reformatted the history table on the way through and the
            # comparison against the database would never match.
            problems.append(f"{at}.checksum must be an integer or null")
        if record.get("success") is not True:
            problems.append(f"{at}.success is {record.get('success')!r}; a failed migration must "
                            f"not be released")
        if type(version) is str:
            if version in seen_versions:
                problems.append(f"{at}.version {version!r} appears twice")
            seen_versions.add(version)
        elif version is None and type(record.get("script")) is str:
            # A repeatable has no version, and every repeatable shares that absence, so uniqueness
            # for them is the script name. Without this a history could list the same repeatable
            # twice and nothing above would notice.
            script = record["script"]
            if script in seen_repeatables:
                problems.append(f"{at}.script {script!r} appears twice among repeatables")
            seen_repeatables.add(script)

    if problems:
        return problems

    # Recomputed, not merely present. A checksum nobody derives from the content is a field, and a
    # field can be copied from a different release.
    ordered = sorted(migrations, key=lambda record: record["installedRank"])
    computed = hashlib.sha256(canonical_bytes(ordered)).hexdigest()
    if inventory.get("checksum") != computed:
        problems.append(f"{where}.checksum is {inventory.get('checksum')!r} but the migrations "
                        f"hash to {computed}")
    return problems


def decide(obs):
    lookups = obs["lookups"]
    cleanup_debt = any(lookups[f"{image}Candidate"]["status"] == "present" for image in IMAGES)

    # Every error, not the first one alphabetically. This returned inside the loop, so an
    # observation carrying both a 503 and a 403 answered according to whichever lookup name sorted
    # first -- `finalMarker` before `frontendTag`, a fact about spelling, not about the registry.
    # Retrying while a 403 stands meets the same 403, so `retryable` holds only when every error is
    # worth another attempt. One error behaves exactly as before, which is why no case caught this.
    failures = [(name, lookups[name]) for name in sorted(lookups)
                if lookups[name]["status"] == "error"]
    if failures:
        retryable = all(retryable_failure(lookup) for _, lookup in failures)
        reason = "; ".join(f"{name}: lookup failed with code={lookup.get('code')}"
                           for name, lookup in failures)
        return unknown(reason, retryable, cleanup_debt)

    final = lookups["finalMarker"]
    prepared = lookups["preparedMarker"]
    tags = {image: lookups[f"{image}Tag"] for image in IMAGES}
    objects = {image: lookups[f"{image}DigestObject"] for image in IMAGES}

    final_present = final["status"] == "present"
    prepared_present = prepared["status"] == "present"
    final_problems = marker_problems(final, obs, "finalMarker") if final_present else None
    prepared_problems = marker_problems(prepared, obs, "preparedMarker") if prepared_present else None

    # Checked before the problem gate below, not inside it. An observation naming one digest for two
    # different payloads is unusable whatever else is wrong with it, and once payload binding is in
    # force no problem-free pair can reach a comparison placed behind that gate -- the rule would be
    # unreachable rather than merely unwitnessed. UNKNOWN, not CONFLICT: nothing here can choose
    # which half of a self-contradicting observation to believe, and that is the collector's problem
    # to re-run, not an operator's to adjudicate.
    #
    # Raising drops cleanupDebt, where the CONFLICT this replaces carried it. That is deliberate and
    # not the "cleanup debt survives an unknown" case: that invariant is about a question nobody
    # answered, where the rest of the observation still stands. Here the document contradicts itself,
    # so its candidate lookup is no more believable than its markers, and authorising a delete on the
    # word of a document that is provably wrong about something else is not a safer answer than
    # leaving the orphan for the next run to see.
    if final_present and prepared_present and "content" in final and "content" in prepared:
        require(final["markerDigest"] != prepared["markerDigest"]
                or canonical_bytes(final["content"]) == canonical_bytes(prepared["content"]),
                f"final and prepared markers share digest {final['markerDigest']} but their "
                f"content differs; the observation contradicts itself")

    if final_present and prepared_present and not final_problems and not prepared_problems:
        # Promotion re-tags one artifact, so the final and prepared markers are the same object
        # under two names. Comparing only content.images accepted two genuinely different artifacts
        # that happen to agree about the images -- with different evidence, or a different
        # inventory, or signed at different times.
        if final["markerDigest"] != prepared["markerDigest"]:
            return conflict(f"final marker {final['markerDigest']} and prepared marker "
                            f"{prepared['markerDigest']} are different artifacts", cleanup_debt)

    if final_present:
        if final_problems:
            return conflict(f"final marker present but not trustworthy: {'; '.join(final_problems)}",
                            cleanup_debt)
        if prepared_present and prepared_problems:
            return conflict("final marker is trustworthy but the prepared marker beside it is not: "
                            + "; ".join(prepared_problems), cleanup_debt)
        claimed = final["content"]["images"]
        # The same existence check the resume path makes. A release whose bytes are gone is not
        # complete just because a document says so.
        problem = missing_or_mismatched(objects, claimed, "digest object")
        if problem:
            return conflict(problem, cleanup_debt)
        problem = missing_or_mismatched(tags, claimed, "tag")
        if problem:
            return conflict(problem, cleanup_debt)
        return decision("COMPLETE", ["verify_only"], "release is published and evidence agrees",
                        cleanup_debt)

    if not prepared_present:
        stray = [image for image in IMAGES if tags[image]["status"] == "present"]
        stray += [f"{image} digest object" for image in IMAGES
                  if objects[image]["status"] == "present"]
        if stray:
            # Anything found without a marker to explain it is unexplained, not absent. A genuinely
            # clean slate has no digest to have queried, which is what "skipped" records.
            return conflict("object(s) present with no prepared marker to anchor them: "
                            + ", ".join(stray), cleanup_debt)

        # 3b commit 2 (spec section 3): evidence-set creation precedes the prepared marker that
        # references it, so a workflow that dies in between must be resumable -- the decision has to
        # see an already-verified evidence-set and say adopt, not silently re-derive ABSENT and send
        # the next run to re-derive evidence that already exists and was already attested.
        evidence_sets = {image: lookups[f"{image}EvidenceSet"] for image in IMAGES}
        actions = []
        adoptable = []
        for image in IMAGES:
            lookup = evidence_sets[image]
            if lookup["status"] == "absent":
                actions.append(f"build_new_{image}_evidence_set")
                adoptable.append(False)
                continue
            # status is "present": "error" already returned via the failures[] gate at the top of
            # decide(), before any lookup here is inspected, so present is the only status left.
            set_problems = evidence_set_problems(lookup, obs, f"lookups.{image}EvidenceSet")
            if set_problems:
                # Section 3's table: provenance/subject/structure mismatch, or a tag missing any
                # kind's attestation, is CONFLICT -- never a partial adopt, never a supplemental
                # sign to launder an artifact that is already there.
                return conflict(f"{image} evidence-set is not adoptable: "
                                + "; ".join(set_problems), cleanup_debt)
            actions.append(f"adopt_{image}_evidence_set")
            adoptable.append(True)

        if not any(adoptable):
            # Byte-for-byte the pre-3b behavior when neither image has anything to adopt: every
            # existing ABSENT fixture keeps passing unmodified, and a caller that only recognises
            # "build_new" is not silently handed a verb it was never told to expect.
            return decision("ABSENT", ["build_new"], "nothing published for this commit", cleanup_debt)
        return decision("ABSENT", actions,
                        "nothing published for this commit; existing evidence-set(s) may be reused",
                        cleanup_debt)

    if prepared_problems:
        return conflict("prepared marker is not trustworthy: " + "; ".join(prepared_problems),
                        cleanup_debt)

    claimed = prepared["content"]["images"]
    problem = missing_or_mismatched(objects, claimed, "digest object")
    if problem:
        return conflict(problem, cleanup_debt)

    actions = []
    for image in IMAGES:
        if tags[image]["status"] == "absent":
            actions.append(f"promote_{image}_tag")
        elif tags[image]["digest"] != claimed[image]:
            return conflict(f"{image} tag is {tags[image]['digest']} but the prepared marker "
                            f"records {claimed[image]}", cleanup_debt)
    actions.append("publish_final_marker")
    return decision("PARTIAL", actions,
                    "prepared marker anchors this commit; completing what is missing", cleanup_debt)


def missing_or_mismatched(observed, claimed, what):
    for image in IMAGES:
        entry = observed[image]
        # `skipped` says the question was never asked, and no_claimed_digest is the only reason it
        # may say that. Beside a marker that DOES claim this digest the observation contradicts
        # itself, and treating it like an absence answers a question nobody put: the message would
        # be "its digest object is not in the registry", a claim about the registry this observation
        # never makes. Self-contradiction is UNKNOWN here as everywhere else -- nothing can choose
        # which half to believe, and CONFLICT would send an operator to adjudicate a registry state
        # that was never observed.
        require(entry["status"] != "skipped",
                f"the marker records {image} {claimed[image]} but its {what} lookup was skipped as "
                f"having no claimed digest; the observation contradicts itself")
        if entry["status"] != "present":
            return f"the marker records {image} {claimed[image]} but its {what} is not in the registry"
        if entry["digest"] != claimed[image]:
            return f"{image} {what} is {entry['digest']} but the marker records {claimed[image]}"
    return None


def retryable_failure(lookup):
    """Whether one failed lookup is worth another attempt.

    The spec is 408, 429 and any 5xx. Enumerating four of the 5xx codes left 501 and 507 failing
    immediately when they are exactly as worth one more attempt. 401/403/404 answer the same next
    time, so they are not.
    """
    code = lookup.get("code")
    return code in (408, 429) or (type(code) is int and 500 <= code <= 599) \
        or (code is None and lookup.get("timeout") is True)


def decision(state, actions, reason, cleanup_debt=False, retryable=False):
    return {"state": state, "actions": actions, "reason": reason,
            "cleanupDebt": cleanup_debt, "retryable": retryable}


def conflict(reason, cleanup_debt=False):
    # Conflicts never carry actions: the point is that nothing automatic is safe here.
    return decision("CONFLICT", [], reason, cleanup_debt)


def unknown(reason, retryable, cleanup_debt=False):
    # Cleanup debt survives an unknown: a candidate someone already saw does not stop existing
    # because a later lookup failed.
    return decision("UNKNOWN", [], reason, cleanup_debt, retryable)


try:
    observation = strict_loads(sys.argv[2])
    result = decide(validate(observation))
except Invalid as error:
    result = unknown(f"observation is unusable: {error}", False)
except ValueError as error:
    # Everything strict_loads refuses -- a duplicate key, a float, a BOM -- arrives as ValueError,
    # and JSONDecodeError is one too. They mean the same thing here: the text could not be read as
    # an observation, which is a fact about the collector rather than about the release. Last-value
    # -wins on a duplicate key is the one worth naming: it would let a later "absent" hide an
    # earlier "error", turning an unreadable registry into permission to build.
    result = unknown(f"observation could not be read: {error}", False)

print(json.dumps(result, sort_keys=True))
PYTHON
