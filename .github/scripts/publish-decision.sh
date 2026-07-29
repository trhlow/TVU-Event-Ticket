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
#      observation. Missing, mistyped or duplicated keys are UNKNOWN.
#
#   3. A marker asserts nothing about itself. `attested: true` inside a document is that document
#      claiming to be trustworthy. What counts is the collector's verification result: which
#      subject digest was verified, which workflow and repository signed it, which source revision
#      it was built from, and whether the policy passed. Those live in `verification`, and the
#      marker's own content is only believed once they check out.
#
# Usage: publish-decision.sh OBSERVATION_JSON_FILE   (or observation on stdin)
set -euo pipefail

# Read here rather than inside Python: the program arrives on Python's stdin through the heredoc,
# so a read there comes back empty -- which once made every observation classify as UNKNOWN, the
# safest possible wrong answer and therefore the easiest to miss.
if [[ "${1:--}" == "-" ]]; then
  observation="$(cat)"
else
  observation="$(cat -- "$1")"
fi

python3 - "$observation" <<'PYTHON'
import hashlib
import json
import re
import sys

SCHEMA_VERSION = 1
# fullmatch everywhere: `$` also matches before a trailing newline, so a digest with \n appended
# satisfied `match` and was accepted as well formed.
SHA1 = re.compile(r"[0-9a-f]{40}")
HEX64 = re.compile(r"[0-9a-f]{64}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
IMAGES = ("monolith", "frontend")

REQUIRED_LOOKUPS = (
    "finalMarker", "preparedMarker",
    "monolithTag", "frontendTag",
    "monolithDigestObject", "frontendDigestObject",
    "monolithCandidate", "frontendCandidate",
)

# Exactly the fields each observed state may carry. A lookup that says "absent" while carrying an
# error code is two answers at once, and picking either is guessing.
LOOKUP_FIELDS = {
    "absent": ({"status", "observedCode"}, {"status", "observedCode"}),
    "error": ({"status"}, {"status", "code", "timeout", "detail"}),
    "present": ({"status"}, {"status", "digest", "attested", "attestedRepository", "markerDigest",
                             "verification", "content"}),
}


class Invalid(Exception):
    """The observation cannot be reasoned about. Never a state -- always UNKNOWN, never retryable."""


def no_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            # Last-value-wins would let a later "absent" hide an earlier "error", turning an
            # unreadable registry into permission to build.
            raise Invalid(f"duplicate key {key!r}")
        seen[key] = value
    return seen


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

    expected = as_dict(obs.get("expected"), "expected")
    require(type(expected.get("repository")) is str and expected["repository"],
            "expected.repository must be a non-empty string")
    exact_str(expected.get("frontendConfigFingerprint"), "expected.frontendConfigFingerprint", HEX64)
    require(type(expected.get("signerWorkflow")) is str and expected["signerWorkflow"],
            "expected.signerWorkflow must be a non-empty string")

    lookups = as_dict(obs.get("lookups"), "lookups")
    missing = [name for name in REQUIRED_LOOKUPS if name not in lookups]
    require(not missing, f"lookups missing: {', '.join(missing)}")
    unexpected = [name for name in lookups if name not in REQUIRED_LOOKUPS]
    require(not unexpected, f"lookups has unexpected keys: {', '.join(sorted(unexpected))}")

    for name, lookup in lookups.items():
        lookup = as_dict(lookup, f"lookups.{name}")
        status = lookup.get("status")
        require(status in LOOKUP_FIELDS,
                f"lookups.{name}.status must be present, absent or error, got {status!r}")
        required_fields, allowed_fields = LOOKUP_FIELDS[status]
        present_fields = set(lookup)
        require(required_fields <= present_fields,
                f"lookups.{name} is missing {', '.join(sorted(required_fields - present_fields))}")
        require(present_fields <= allowed_fields,
                f"lookups.{name} carries fields that do not belong to status {status!r}: "
                f"{', '.join(sorted(present_fields - allowed_fields))}")

        if status == "absent":
            # Absence is a fact the collector observed, not the absence of a fact. Only a 404 says
            # "this is not there"; anything else says "I did not get an answer".
            require(exact_int(lookup.get("observedCode"), f"lookups.{name}.observedCode") == 404,
                    f"lookups.{name} claims absence without an observed 404")
        elif status == "error":
            code = lookup.get("code")
            require(code is None or type(code) is int, f"lookups.{name}.code must be an integer")
        elif name.endswith(("Tag", "Candidate", "DigestObject")):
            exact_str(lookup.get("digest"), f"lookups.{name}.digest", DIGEST)
            require("content" not in lookup, f"lookups.{name} is a tag, not a marker")
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
    if verification.get("signerRepository") != expected["repository"]:
        problems.append(f"{where} signed by {verification.get('signerRepository')!r}, expected "
                        f"{expected['repository']!r}")
    if verification.get("signerWorkflow") != expected["signerWorkflow"]:
        problems.append(f"{where} signed by workflow {verification.get('signerWorkflow')!r}, "
                        f"expected {expected['signerWorkflow']!r}")
    if verification.get("sourceRevision") != obs["commit"]:
        problems.append(f"{where}.verification.sourceRevision is "
                        f"{verification.get('sourceRevision')!r}, expected {obs['commit']!r}")
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
        for kind in ("sbom", "vulnerabilityScan"):
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
    for index, record in enumerate(migrations):
        at = f"{where}.migrations[{index}]"
        if type(record) is not dict:
            problems.append(f"{at} must be an object")
            continue
        for field in ("version", "type", "script"):
            if type(record.get(field)) is not str or not record[field]:
                problems.append(f"{at}.{field} must be a non-empty string")
        if type(record.get("checksum")) is not int:
            # Flyway's own checksum is a CRC32 integer. A string here means someone reformatted the
            # history table on the way through and the comparison against the database would never
            # match.
            problems.append(f"{at}.checksum must be an integer")
        if record.get("success") is not True:
            problems.append(f"{at}.success is {record.get('success')!r}; a failed migration must "
                            f"not be released")
        version = record.get("version")
        if type(version) is str:
            if version in seen_versions:
                problems.append(f"{at}.version {version!r} appears twice")
            seen_versions.add(version)

    if problems:
        return problems

    # Recomputed, not merely present. A checksum nobody derives from the content is a field, and a
    # field can be copied from a different release.
    canonical = json.dumps(migrations, sort_keys=True, separators=(",", ":"))
    computed = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
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
        if stray:
            return conflict("official tag(s) present with no prepared marker to anchor them: "
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
    observation = json.loads(sys.argv[1], object_pairs_hook=no_duplicates)
    result = decide(validate(observation))
except Invalid as error:
    result = unknown(f"observation is unusable: {error}", False)
except json.JSONDecodeError as error:
    result = unknown(f"observation is not JSON: {error}", False)

print(json.dumps(result, sort_keys=True))
PYTHON
