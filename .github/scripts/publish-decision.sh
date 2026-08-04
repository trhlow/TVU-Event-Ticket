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
)

MARKER_LOOKUPS = ("finalMarker", "preparedMarker")

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
    "frontendTag": "frontend",
    "frontendDigestObject": "frontend",
    "frontendCandidate": "frontend",
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
PRESENT_FIELDS = {
    "marker": ({"status", "queriedRef", "markerDigest", "verification", "content"},
               {"status", "queriedRef", "markerDigest", "verification", "content"}),
    "object": ({"status", "queriedRef", "digest"},
               {"status", "queriedRef", "digest"}),
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
            kind = "marker" if name in MARKER_LOOKUPS else "object"
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

    problems.extend(inventory_problems(content.get("flywayInventory"), images.get("monolith"),
                                       f"{where}.content.flywayInventory"))
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

    for name in sorted(lookups):
        lookup = lookups[name]
        if lookup["status"] == "error":
            code = lookup.get("code")
            # The spec is 408, 429 and any 5xx. Enumerating four of the 5xx codes left 501 and 507
            # failing immediately when they are worth one more attempt.
            retryable = code in (408, 429) or (type(code) is int and 500 <= code <= 599) \
                or (code is None and lookup.get("timeout") is True)
            return unknown(f"{name}: lookup failed with code={code}", retryable, cleanup_debt)

    final = lookups["finalMarker"]
    prepared = lookups["preparedMarker"]
    tags = {image: lookups[f"{image}Tag"] for image in IMAGES}
    objects = {image: lookups[f"{image}DigestObject"] for image in IMAGES}

    final_present = final["status"] == "present"
    prepared_present = prepared["status"] == "present"
    final_problems = marker_problems(final, obs, "finalMarker") if final_present else None
    prepared_problems = marker_problems(prepared, obs, "preparedMarker") if prepared_present else None

    if final_present and prepared_present and not final_problems and not prepared_problems:
        # Promotion re-tags one artifact, so the final and prepared markers are the same object
        # under two names. Comparing only content.images accepted two genuinely different artifacts
        # that happen to agree about the images -- with different evidence, or a different
        # inventory, or signed at different times.
        if final["markerDigest"] != prepared["markerDigest"]:
            return conflict(f"final marker {final['markerDigest']} and prepared marker "
                            f"{prepared['markerDigest']} are different artifacts", cleanup_debt)
        # Content-addressed storage makes "same digest, different content" impossible, so an
        # observation showing it is contradicting itself and nothing here can resolve which half to
        # believe.
        if canonical_bytes(final["content"]) != canonical_bytes(prepared["content"]):
            return conflict(f"final and prepared markers share digest {final['markerDigest']} but "
                            f"their content differs; the observation contradicts itself",
                            cleanup_debt)

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
        return decision("ABSENT", ["build_new"], "nothing published for this commit", cleanup_debt)

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
        if entry["status"] != "present":
            return f"the marker records {image} {claimed[image]} but its {what} is not in the registry"
        if entry["digest"] != claimed[image]:
            return f"{image} {what} is {entry['digest']} but the marker records {claimed[image]}"
    return None


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
