#!/usr/bin/env bash
# Decides what a publish run may do to the registry, from what it observed there.
#
# A pure function on purpose: it reads an observation document and writes a decision. Nothing here
# talks to a registry, which is what makes the whole state table testable without one, and what lets
# the caller express "I could not find out" as an input rather than as a crash.
#
# The invariant everything else hangs off:
#
#     No trustworthy prepared marker means no self-recoverable PARTIAL.
#
# A candidate tag, or an official tag on its own, cannot establish that a release exists. Only a
# prepared marker -- attested, and binding the commit, environment, fingerprint and both digests --
# can say which digests belong to this release. Without one, objects found in the registry are
# unexplained rather than partial, and unexplained is CONFLICT.
#
# Usage: publish-decision.sh OBSERVATION_JSON_FILE   (or observation on stdin)
# Output: decision JSON on stdout.
#
#   {"state":"PARTIAL","cleanupDebt":false,"retryable":false,
#    "actions":["promote_frontend_tag","publish_final_marker"],"reason":"..."}
set -euo pipefail

# Read the observation here rather than inside Python. The program itself arrives on Python's
# stdin via the heredoc below, so anything the program tried to read from stdin would come back
# empty -- which the first version did, turning every observation into "not JSON" and every state
# into UNKNOWN. Passing the content as an argument keeps one stdin for one purpose.
if [[ "${1:--}" == "-" ]]; then
  observation="$(cat)"
else
  observation="$(cat -- "$1")"
fi

python3 - "$observation" <<'PYTHON'
import json
import sys

raw = sys.argv[1]

try:
    obs = json.loads(raw)
except json.JSONDecodeError as error:
    # Not a state: the caller handed us something we cannot reason about at all.
    print(json.dumps({"state": "UNKNOWN", "retryable": False, "cleanupDebt": False, "actions": [],
                      "reason": f"observation is not JSON: {error}"}))
    sys.exit(0)

IMAGES = ("monolith", "frontend")

# Retryable: the answer may differ if asked again. Not retryable: asking again gives the same
# non-answer, so a finite retry loop would only delay the failure.
RETRYABLE_CODES = {408, 429, 500, 502, 503, 504}


def decide(obs):
    commit = obs.get("commit", "")
    lookups = obs.get("lookups", {})

    # 1. Anything we could not determine outranks everything else. Deciding around a missing fact is
    #    how a publish overwrites something it never saw.
    for name, lookup in sorted(lookups.items()):
        status = lookup.get("status")
        if status == "error":
            code = lookup.get("code")
            retryable = code in RETRYABLE_CODES or code is None and lookup.get("timeout") is True
            return unknown(f"{name}: lookup failed with code={code}", retryable)
        if status not in ("present", "absent"):
            return unknown(f"{name}: unrecognised lookup status {status!r}", False)
        if status == "present" and name.endswith("Tag"):
            digest = lookup.get("digest", "")
            if not isinstance(digest, str) or not digest.startswith("sha256:") or len(digest) != 71:
                return unknown(f"{name}: digest is not a sha256 reference: {digest!r}", False)

    final = lookups.get("finalMarker", {})
    prepared = lookups.get("preparedMarker", {})
    tags = {image: lookups.get(f"{image}Tag", {}) for image in IMAGES}
    candidates_present = [
        image for image in IMAGES
        if lookups.get(f"{image}Candidate", {}).get("status") == "present"
    ]
    # Cleanup failing never invalidates a release; it is debt to work off, not a defect in what was
    # published. Reported alongside the state rather than instead of it.
    cleanup_debt = bool(candidates_present)

    prepared_ok, prepared_why = marker_is_trustworthy(prepared, obs)

    # 2. A final marker claims the release is complete. Verify that claim rather than accept it: a
    #    final marker whose evidence disagrees is worse than none, because everything downstream
    #    trusts it.
    if final.get("status") == "present":
        ok, why = marker_is_trustworthy(final, obs)
        if not ok:
            return conflict(f"final marker present but not trustworthy: {why}", cleanup_debt)
        for image in IMAGES:
            tag = tags[image]
            if tag.get("status") != "present":
                return conflict(f"final marker claims a complete release but {image} tag is absent",
                                cleanup_debt)
            claimed = final.get("content", {}).get("images", {}).get(image)
            if tag.get("digest") != claimed:
                return conflict(
                    f"{image} tag is {tag.get('digest')} but the final marker records {claimed}",
                    cleanup_debt)
        return decision("COMPLETE", ["verify_only"], "release is published and evidence agrees",
                        cleanup_debt)

    # 3. No final marker. Everything now depends on whether a prepared marker can vouch for what is
    #    in the registry.
    if prepared.get("status") != "present":
        stray = [image for image in IMAGES if tags[image].get("status") == "present"]
        if stray:
            # Tags with nothing to explain them. Adopting them would mean trusting a digest no
            # attested document binds to this commit.
            return conflict(
                f"official tag(s) present with no prepared marker to anchor them: {', '.join(stray)}",
                cleanup_debt)
        # An orphan candidate does not make a release exist; it is debt.
        return decision("ABSENT", ["build_new"], "nothing published for this commit", cleanup_debt)

    if not prepared_ok:
        return conflict(f"prepared marker is not trustworthy: {prepared_why}", cleanup_debt)

    # 4. A trustworthy prepared marker exists. Missing pieces may be added; wrong pieces may not be
    #    corrected. Only additive work is ever proposed here -- never a rebuild, never an overwrite.
    actions = []
    for image in IMAGES:
        tag = tags[image]
        claimed = prepared.get("content", {}).get("images", {}).get(image)
        if not claimed:
            return conflict(f"prepared marker does not record a digest for {image}", cleanup_debt)
        if tag.get("status") == "absent":
            actions.append(f"promote_{image}_tag")
        elif tag.get("digest") != claimed:
            return conflict(
                f"{image} tag is {tag.get('digest')} but the prepared marker records {claimed}",
                cleanup_debt)
    actions.append("publish_final_marker")
    return decision("PARTIAL", actions,
                    f"prepared marker anchors {commit}; completing what is missing", cleanup_debt)


def marker_is_trustworthy(marker, obs):
    """A marker counts only if it is attested to this repository and binds this exact release."""
    if not marker.get("attested"):
        return False, "not attested"
    expected = obs.get("expected", {})
    content = marker.get("content", {})
    if marker.get("attestedRepository") != expected.get("repository"):
        return False, (f"attested to {marker.get('attestedRepository')!r}, "
                       f"expected {expected.get('repository')!r}")
    for field, want in (("commit", obs.get("commit")),
                        ("environment", obs.get("environment")),
                        ("frontendConfigFingerprint", expected.get("frontendConfigFingerprint"))):
        if content.get(field) != want:
            return False, f"{field} is {content.get(field)!r}, expected {want!r}"
    if content.get("flywayInventoryFor") != content.get("images", {}).get("monolith"):
        return False, "Flyway inventory is not bound to the monolith digest it describes"
    for evidence in ("sbom", "vulnerabilityScan"):
        if not content.get("evidence", {}).get(evidence):
            return False, f"missing {evidence} evidence"
    return True, ""


def decision(state, actions, reason, cleanup_debt=False, retryable=False):
    return {"state": state, "actions": actions, "reason": reason,
            "cleanupDebt": cleanup_debt, "retryable": retryable}


def conflict(reason, cleanup_debt=False):
    # Conflicts never carry actions: the point is that nothing automatic is safe here.
    return decision("CONFLICT", [], reason, cleanup_debt)


def unknown(reason, retryable):
    return decision("UNKNOWN", [], reason, False, retryable)


print(json.dumps(decide(obs), sort_keys=True))
PYTHON
