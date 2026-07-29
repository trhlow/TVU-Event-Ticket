#!/usr/bin/env bash
# Decides what a publish run may do to the registry, from what it observed there.
#
# A pure function on purpose: it reads an observation document and writes a decision. Nothing here
# talks to a registry, which makes the whole state table testable without one and lets the caller
# express "I could not find out" as an input rather than as a crash.
#
# Two invariants:
#
#   1. No trustworthy prepared marker means no self-recoverable PARTIAL. A candidate tag, or an
#      official tag alone, cannot establish that a release exists. Only an attested marker binding
#      the commit, environment, fingerprint, both digests, the Flyway inventory and per-image
#      evidence can say which digests belong to this release. Objects with nothing to explain them
#      are unexplained, and unexplained is CONFLICT.
#
#   2. Absence must be observed, never inferred. Every fact this decision rests on has to be
#      present in the observation and well formed. An earlier version defaulted missing lookups to
#      empty objects, so `{}` classified as ABSENT and authorised build_new -- a decision to publish
#      taken from no information at all. Missing, mistyped or duplicated keys are UNKNOWN.
#
# Usage: publish-decision.sh OBSERVATION_JSON_FILE   (or observation on stdin)
set -euo pipefail

# Read here rather than inside Python: the program itself arrives on Python's stdin through the
# heredoc, so a read there comes back empty. That bug made every observation classify as UNKNOWN,
# which is the safest possible wrong answer and therefore the easiest to miss.
if [[ "${1:--}" == "-" ]]; then
  observation="$(cat)"
else
  observation="$(cat -- "$1")"
fi

python3 - "$observation" <<'PYTHON'
import json
import re
import sys

SCHEMA_VERSION = 1
SHA1 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
IMAGES = ("monolith", "frontend")

# Every lookup the decision reads. Exactly these: a missing one is a fact nobody established, and an
# unexpected one usually means a typo in a key the collector thought it was setting.
REQUIRED_LOOKUPS = (
    "finalMarker", "preparedMarker",
    "monolithTag", "frontendTag",
    "monolithDigestObject", "frontendDigestObject",
    "monolithCandidate", "frontendCandidate",
)

RETRYABLE_CODES = {408, 429, 500, 502, 503, 504}


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


def as_dict(value, where):
    require(isinstance(value, dict), f"{where} must be an object")
    return value


def as_str(value, where, pattern=None):
    require(isinstance(value, str), f"{where} must be a string")
    require(pattern is None or pattern.match(value), f"{where} is malformed: {value!r}")
    return value


def validate(obs):
    obs = as_dict(obs, "observation")
    require(obs.get("schemaVersion") == SCHEMA_VERSION,
            f"schemaVersion must be {SCHEMA_VERSION}, got {obs.get('schemaVersion')!r}")
    as_str(obs.get("commit"), "commit", SHA1)
    require(isinstance(obs.get("environment"), str) and obs["environment"],
            "environment must be a non-empty string")

    expected = as_dict(obs.get("expected"), "expected")
    require(isinstance(expected.get("repository"), str) and expected["repository"],
            "expected.repository must be a non-empty string")
    as_str(expected.get("frontendConfigFingerprint"), "expected.frontendConfigFingerprint", HEX64)

    lookups = as_dict(obs.get("lookups"), "lookups")
    missing = [name for name in REQUIRED_LOOKUPS if name not in lookups]
    require(not missing, f"lookups missing: {', '.join(missing)}")
    unexpected = [name for name in lookups if name not in REQUIRED_LOOKUPS]
    require(not unexpected, f"lookups has unexpected keys: {', '.join(sorted(unexpected))}")

    for name, lookup in lookups.items():
        lookup = as_dict(lookup, f"lookups.{name}")
        status = lookup.get("status")
        require(status in ("present", "absent", "error"),
                f"lookups.{name}.status must be present, absent or error, got {status!r}")
        if status == "error":
            code = lookup.get("code")
            require(code is None or isinstance(code, int), f"lookups.{name}.code must be an integer")
        elif status == "present" and name.endswith(("Tag", "Candidate", "DigestObject")):
            as_str(lookup.get("digest"), f"lookups.{name}.digest", DIGEST)
    return obs


def marker_problems(marker, obs, where):
    """Everything wrong with a marker. Empty means it may be trusted."""
    problems = []
    expected = obs["expected"]

    # `is True`, not truthiness: the string "false" is truthy, and an attestation flag that arrives
    # as a string is a collector bug, not a pass.
    if marker.get("attested") is not True:
        problems.append(f"{where}.attested is {marker.get('attested')!r}, must be boolean true")
    if marker.get("attestedRepository") != expected["repository"]:
        problems.append(f"{where} attested to {marker.get('attestedRepository')!r}, "
                        f"expected {expected['repository']!r}")
    if not isinstance(marker.get("markerDigest"), str) or not DIGEST.match(marker.get("markerDigest", "")):
        problems.append(f"{where}.markerDigest is not a sha256 reference")

    content = marker.get("content")
    if not isinstance(content, dict):
        problems.append(f"{where}.content must be an object")
        return problems

    # Compared against required values that validate() has already proven present, so a marker that
    # simply omits a field cannot match by both sides being None.
    for field, want in (("commit", obs["commit"]),
                        ("environment", obs["environment"]),
                        ("frontendConfigFingerprint", expected["frontendConfigFingerprint"])):
        if content.get(field) != want:
            problems.append(f"{where}.content.{field} is {content.get(field)!r}, expected {want!r}")

    images = content.get("images")
    if not isinstance(images, dict):
        problems.append(f"{where}.content.images must be an object")
        return problems
    for image in IMAGES:
        digest = images.get(image)
        if not isinstance(digest, str) or not DIGEST.match(digest):
            problems.append(f"{where}.content.images.{image} is not a sha256 digest: {digest!r}")

    # Provenance binds each image to this commit. Without it the marker says which digests it
    # chose, not that they were built from the source being released.
    provenance = content.get("provenance")
    if not isinstance(provenance, dict):
        problems.append(f"{where}.content.provenance must be an object")
    else:
        for image in IMAGES:
            entry = provenance.get(image)
            if not isinstance(entry, dict) or entry.get("revision") != obs["commit"]:
                problems.append(f"{where}.content.provenance.{image} does not record revision "
                                f"{obs['commit']}")

    # Evidence per image, each a digest. A boolean or a free-text string proves nothing and was
    # accepted by the first version.
    evidence = content.get("evidence")
    if not isinstance(evidence, dict):
        problems.append(f"{where}.content.evidence must be an object")
    else:
        for kind in ("sbom", "vulnerabilityScan"):
            per_image = evidence.get(kind)
            if not isinstance(per_image, dict):
                problems.append(f"{where}.content.evidence.{kind} must be an object keyed by image")
                continue
            for image in IMAGES:
                value = per_image.get(image)
                if not isinstance(value, str) or not DIGEST.match(value):
                    problems.append(f"{where}.content.evidence.{kind}.{image} is not a digest: "
                                    f"{value!r}")

    inventory = content.get("flywayInventory")
    if not isinstance(inventory, dict):
        problems.append(f"{where}.content.flywayInventory must be an object")
    else:
        if isinstance(images, dict) and inventory.get("boundTo") != images.get("monolith"):
            problems.append(f"{where}.content.flywayInventory.boundTo is "
                            f"{inventory.get('boundTo')!r}, not the monolith digest it describes")
        checksum = inventory.get("checksum")
        if not isinstance(checksum, str) or not HEX64.match(checksum):
            problems.append(f"{where}.content.flywayInventory.checksum is not a sha256 hex digest")
        migrations = inventory.get("migrations")
        if not isinstance(migrations, list) or not migrations:
            problems.append(f"{where}.content.flywayInventory.migrations must be a non-empty list")
    return problems


def decide(obs):
    lookups = obs["lookups"]

    # Anything undetermined outranks everything else. Deciding around a missing fact is how a
    # publish overwrites something it never saw.
    for name in sorted(lookups):
        lookup = lookups[name]
        if lookup["status"] == "error":
            code = lookup.get("code")
            retryable = code in RETRYABLE_CODES or (code is None and lookup.get("timeout") is True)
            return unknown(f"{name}: lookup failed with code={code}", retryable)

    final = lookups["finalMarker"]
    prepared = lookups["preparedMarker"]
    tags = {image: lookups[f"{image}Tag"] for image in IMAGES}
    objects = {image: lookups[f"{image}DigestObject"] for image in IMAGES}
    cleanup_debt = any(lookups[f"{image}Candidate"]["status"] == "present" for image in IMAGES)

    final_present = final["status"] == "present"
    prepared_present = prepared["status"] == "present"
    final_problems = marker_problems(final, obs, "finalMarker") if final_present else None
    prepared_problems = marker_problems(prepared, obs, "preparedMarker") if prepared_present else None

    # Two attested markers for one release must describe the same release. An earlier version
    # ignored the prepared marker whenever a final one existed, so a fork -- two markers binding
    # different digest pairs -- read as COMPLETE.
    if final_present and prepared_present and not final_problems and not prepared_problems:
        if final["content"]["images"] != prepared["content"]["images"]:
            return conflict("final and prepared markers bind different digests: "
                            f"{final['content']['images']} vs {prepared['content']['images']}",
                            cleanup_debt)

    if final_present:
        if final_problems:
            return conflict(f"final marker present but not trustworthy: {'; '.join(final_problems)}",
                            cleanup_debt)
        if prepared_present and prepared_problems:
            return conflict("final marker is trustworthy but the prepared marker beside it is not: "
                            + "; ".join(prepared_problems), cleanup_debt)
        for image in IMAGES:
            claimed = final["content"]["images"][image]
            if tags[image]["status"] != "present":
                return conflict(f"final marker claims a complete release but the {image} tag is "
                                f"absent", cleanup_debt)
            if tags[image]["digest"] != claimed:
                return conflict(f"{image} tag is {tags[image]['digest']} but the final marker "
                                f"records {claimed}", cleanup_debt)
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

    # A trustworthy marker says which digests were chosen. It does not say the bytes are still in
    # the registry, so resuming requires having seen them.
    claimed_images = prepared["content"]["images"]
    for image in IMAGES:
        obj = objects[image]
        if obj["status"] != "present":
            return conflict(f"prepared marker records {image} {claimed_images[image]} but that "
                            f"digest is not in the registry", cleanup_debt)
        if obj["digest"] != claimed_images[image]:
            return conflict(f"{image} digest object is {obj['digest']} but the prepared marker "
                            f"records {claimed_images[image]}", cleanup_debt)

    actions = []
    for image in IMAGES:
        if tags[image]["status"] == "absent":
            actions.append(f"promote_{image}_tag")
        elif tags[image]["digest"] != claimed_images[image]:
            return conflict(f"{image} tag is {tags[image]['digest']} but the prepared marker "
                            f"records {claimed_images[image]}", cleanup_debt)
    actions.append("publish_final_marker")
    return decision("PARTIAL", actions, "prepared marker anchors this commit; completing what is "
                    "missing", cleanup_debt)


def decision(state, actions, reason, cleanup_debt=False, retryable=False):
    return {"state": state, "actions": actions, "reason": reason,
            "cleanupDebt": cleanup_debt, "retryable": retryable}


def conflict(reason, cleanup_debt=False):
    # Conflicts never carry actions: the point is that nothing automatic is safe here.
    return decision("CONFLICT", [], reason, cleanup_debt)


def unknown(reason, retryable):
    return decision("UNKNOWN", [], reason, False, retryable)


try:
    observation = json.loads(sys.argv[1], object_pairs_hook=no_duplicates)
    result = decide(validate(observation))
except Invalid as error:
    result = unknown(f"observation is unusable: {error}", False)
except json.JSONDecodeError as error:
    result = unknown(f"observation is not JSON: {error}", False)

print(json.dumps(result, sort_keys=True))
PYTHON
