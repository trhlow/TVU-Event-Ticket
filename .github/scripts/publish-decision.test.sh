#!/usr/bin/env bash
# Tests for publish-decision.sh.
#
# Two things this suite learned the hard way and now enforces on every case:
#
#   1. Assert the whole decision, not one field. An earlier version checked only `state`, and a
#      mutation that gave CONFLICT the action list ["build_new"] left all forty-one green -- a
#      classifier that says "conflict" while authorising a build is worse than one that says
#      nothing.
#
#   2. Absence must be observed. An empty observation used to classify as ABSENT and authorise
#      build_new, which is a decision to publish taken from no information.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
subject="$script_dir/publish-decision.sh"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"

passed=0
failed=0

SHA=0123456789abcdef0123456789abcdef01234567
OTHER_SHA=ffffffffffffffffffffffffffffffffffffffff
MONO=sha256:1111111111111111111111111111111111111111111111111111111111111111
FRONT=sha256:2222222222222222222222222222222222222222222222222222222222222222
OTHER=sha256:9999999999999999999999999999999999999999999999999999999999999999
MARKER_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333
FP=fea7afe794dacc6140c57ac4d8406f6ff97eb763c279c679f8fb89fcfa0f9477

# Three roles, three repositories, and now three different ones. Three packages are three OCI
# repositories; the source repository they were all conflated with is a fourth thing entirely and
# lives in expected.sourceRepository.
RELEASE_REPO=ghcr.io/owner/name/release
MONOLITH_REPO=ghcr.io/owner/name/monolith
FRONTEND_REPO=ghcr.io/owner/name/frontend

python_json() { "$PYTHON" -c "$1" "${@:2}"; }

# marker [json-overrides] [images-monolith] [images-frontend]
#
# There is no marker-digest parameter. There used to be, and it was read into a variable that lines
# below overwrote unconditionally once the digest became a function of the content -- a parameter a
# caller could pass and watch have no effect, which is worse than one that does not exist.
marker() {
  python_json '
import hashlib, json, sys
overrides = json.loads(sys.argv[1] or "{}")
mono, front, sha, fp = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
migrations = [{"installedRank": 1, "version": "16", "type": "SQL", "script": "V16__x.sql",
               "checksum": 123456789, "success": True}]
canonical = json.dumps(sorted(migrations, key=lambda r: r["installedRank"]),
                       sort_keys=True, separators=(",", ":"))
# markerDigest and verification.subjectDigest are written as None here and replaced below with the
# digest of the raw this marker actually carries. They appear in the literal only so a fixture reads
# in the same key order a real observation has.
base = {
  "status": "present",
  "queriedRef": sys.argv[6] + ":release-" + sha,
  "markerDigest": None,
  "verification": {
    "attestationVerified": True, "subjectDigest": None,
    "signerRepository": "owner/name", "signerWorkflow": ".github/workflows/publish.yml",
    "sourceRevision": sha, "predicateType": "https://slsa.dev/provenance/v1",
    "policyPassed": True,
  },
  "content": {
    "commit": sha, "environment": "production", "frontendConfigFingerprint": fp,
    "images": {"monolith": mono, "frontend": front},
    "provenance": {"monolith": {"revision": sha, "subjectDigest": mono},
                   "frontend": {"revision": sha, "subjectDigest": front}},
    "evidence": {
      kind: {"monolith": {"digest": "sha256:" + letter*64, "subjectDigest": mono,
                          "predicateType": "https://tvu.example/" + kind, "passed": True},
             "frontend": {"digest": "sha256:" + letter*63 + "e", "subjectDigest": front,
                          "predicateType": "https://tvu.example/" + kind, "passed": True}}
      for kind, letter in (("sbom", "a"), ("vulnerabilityScan", "b"),
                           ("layerSecretScan", "c"), ("filesystemSecretScan", "d"))
    },
    "flywayInventory": {"boundTo": mono,
                        "checksum": hashlib.sha256(canonical.encode()).hexdigest(),
                        "migrations": migrations},
  },
}
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v

# Replacing the migration list has to replace the checksum with it: a deep merge would leave the
# old hash in place, and every such case would then be caught by the checksum guard rather than by
# the one it was written for.
if "_migrations" in overrides:
    replacement = overrides.pop("_migrations")
    base["content"]["flywayInventory"]["migrations"] = replacement
    try:
        ordered = sorted(replacement, key=lambda r: r["installedRank"])
    except (TypeError, KeyError):
        ordered = replacement
    recomputed = json.dumps(ordered, sort_keys=True, separators=(",", ":"))
    base["content"]["flywayInventory"]["checksum"] = hashlib.sha256(
        recomputed.encode()).hexdigest()

# A content change made BEFORE the envelope is derived, so the marker stays internally consistent
# and its digest genuinely differs. `{"content": ...}` in the generic overrides is the opposite
# instruction -- it merges after derivation and so leaves the old digest beside new content, which
# is a contradiction rather than a fork. Both shapes are needed, and they are not interchangeable.
if "_content" in overrides:
    merge(base["content"], overrides.pop("_content"))

# The envelope is derived from the content, never typed alongside it: two statements of one fact
# drift, and this one is a hash. Overrides that change content therefore change the digest with it.
sys.path.insert(0, sys.argv[7])
import envelope as envelope_module

raw = envelope_module.envelope_for(base["content"])
base["ociEnvelope"] = {"digestVerified": True, "sizeVerified": True, "parsed": True, "raw": raw}
base["markerDigest"] = envelope_module.marker_digest(raw)
base["verification"]["subjectDigest"] = base["markerDigest"]

# Test-only escapes, each one shaping an observation the contract must refuse. They run before the
# generic merge so a case can both break the envelope and set an unrelated field.
if overrides.pop("_envelope_absent", False):
    del base["ociEnvelope"]
if "_envelope_del" in overrides:
    del base["ociEnvelope"][overrides.pop("_envelope_del")]
# Every escape that removes raw removes content with it, and for the same reason each removed raw in
# the first place: a collector that could not read the bytes has no payload to report either, so a
# marker keeping one is a SECOND contradiction, and the content rule would answer these cases in
# place of the rule each was written for. Three of them went green that way the moment content
# became conditional.
if overrides.pop("_envelope_del_raw", False):
    del base["ociEnvelope"]["raw"]
    del base["content"]
if overrides.pop("_envelope_unparsed", False):
    base["ociEnvelope"]["parsed"] = False
    del base["ociEnvelope"]["raw"]
    del base["content"]
if "_envelope_failed" in overrides:
    base["ociEnvelope"][overrides.pop("_envelope_failed")] = False
    del base["ociEnvelope"]["raw"]
    del base["content"]
if "_envelope_flag" in overrides:
    # An arbitrary value in one of the three flags, with raw removed to match. Removing raw is what
    # makes the case attributable: with raw still there, a falsy non-boolean is caught by the
    # raw-implies-all-verified require instead of by the type check the case is named for.
    flag, value = overrides.pop("_envelope_flag")
    base["ociEnvelope"][flag] = value
    del base["ociEnvelope"]["raw"]
    del base["content"]
if overrides.pop("_envelope_retag", False):
    # The digest names a different object: the classic re-tag, where a marker points at bytes it
    # was not built from. Digest deliberately NOT recomputed -- this is the one case whose whole
    # subject is the mismatch.
    base["markerDigest"] = "sha256:" + "5" * 64
    base["verification"]["subjectDigest"] = base["markerDigest"]
if overrides.pop("_envelope_reorder", False):
    # Same fields, different bytes: a raw that was retyped rather than kept. The digest stays the
    # digest of the original manifest, so the recomputation is what catches it.
    base["ociEnvelope"]["raw"] = dict(base["ociEnvelope"]["raw"])
    base["ociEnvelope"]["raw"]["extraKey"] = "typed by hand"
if overrides.pop("_envelope_two_layers", False):
    base["ociEnvelope"]["raw"]["layers"].append(dict(base["ociEnvelope"]["raw"]["layers"][0]))
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]
    del base["content"]
if overrides.pop("_envelope_two_layers_with_content", False):
    base["ociEnvelope"]["raw"]["layers"].append(dict(base["ociEnvelope"]["raw"]["layers"][0]))
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]
if "_envelope_failed_with_content" in overrides:
    base["ociEnvelope"][overrides.pop("_envelope_failed_with_content")] = False
    del base["ociEnvelope"]["raw"]
if overrides.pop("_envelope_subject", False):
    base["ociEnvelope"]["raw"]["subject"] = {
        "mediaType": envelope_module.MANIFEST_MEDIA_TYPE,
        "digest": "sha256:" + "7" * 64, "size": 3}
    base["markerDigest"] = envelope_module.marker_digest(base["ociEnvelope"]["raw"])
    base["verification"]["subjectDigest"] = base["markerDigest"]

merge(base, overrides)
print(json.dumps(base))
' "${1:-}" "${2:-$MONO}" "${3:-$FRONT}" "$SHA" "$FP" "$RELEASE_REPO" "$script_dir"
}

present_in() { printf '{"status":"present","queriedRef":"%s@%s","digest":"%s"}' "$1" "$2" "$2"; }
absent_in() { printf '{"status":"absent","observedCode":404,"queriedRef":"%s:sha-x"}' "$1"; }
absent_release="$(absent_in "$RELEASE_REPO")"
absent_mono="$(absent_in "$MONOLITH_REPO")"
absent_fe="$(absent_in "$FRONTEND_REPO")"
# A digest object cannot be queried before a marker names one, so a clean slate skips it. Claiming
# absence there would assert an observation nobody made.
skipped='{"status":"skipped","reason":"no_claimed_digest","queriedRef":null}'

# observation <final> <prepared> <monoTag> <frontTag> [monoObj] [frontObj] [monoCand] [frontCand]
observation() {
  cat <<EOF
{"schemaVersion":1,"commit":"$SHA","environment":"production",
 "expected":{"sourceRepository":"owner/name",
             "repositories":{"release":"owner/name/release","monolith":"owner/name/monolith","frontend":"owner/name/frontend"},
             "frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml","registry":"ghcr.io"},
 "lookups":{"finalMarker":$1,"preparedMarker":$2,"monolithTag":$3,"frontendTag":$4,
            "monolithDigestObject":${5:-$(present_in "$MONOLITH_REPO" "$MONO")},
            "frontendDigestObject":${6:-$(present_in "$FRONTEND_REPO" "$FRONT")},
            "monolithCandidate":${7:-$absent_mono},"frontendCandidate":${8:-$absent_fe}}}
EOF
}

# assert_decision <name> <observation> <state> <actions-json> <cleanupDebt> <retryable>
assert_decision() {
  local name="$1" obs="$2" want_state="$3" want_actions="$4" want_debt="$5" want_retry="$6"
  local got exit_code
  got="$(printf '%s' "$obs" | bash "$subject" 2>&1)"
  exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    # Valid JSON on stdout with a non-zero exit is a script that failed while looking like it
    # worked; the caller reading stdout would never notice.
    echo "FAIL  $name: subject exited $exit_code"
    echo "      output: $got"
    ((failed++))
    return
  fi
  local check
  # The comparison prints PASS or the reasons, and anything else -- including nothing, which is
  # what a crashed checker produces -- counts as a failure. An earlier version treated empty
  # output as success, so a checker with a syntax error passed every case, including a subject
  # rewired to answer COMPLETE unconditionally.
  check="$(python_json '
import json, sys

want_state, want_actions, want_debt, want_retry = sys.argv[2:6]
problems = []
try:
    d = json.loads(sys.argv[1])
except Exception as error:
    problems.append("decision is not JSON: %s" % error)
    d = {}

state = d.get("state")
actions = d.get("actions")
if state != want_state:
    problems.append("state=%r wanted %r" % (state, want_state))
if actions != json.loads(want_actions):
    problems.append("actions=%r wanted %s" % (actions, want_actions))
if d.get("cleanupDebt") != (want_debt == "true"):
    problems.append("cleanupDebt=%r wanted %s" % (d.get("cleanupDebt"), want_debt))
if d.get("retryable") != (want_retry == "true"):
    problems.append("retryable=%r wanted %s" % (d.get("retryable"), want_retry))

# Invariants checked on every case rather than in one place, so a mutation that keeps the label
# right and the consequences wrong cannot pass anywhere.
if state in ("UNKNOWN", "CONFLICT") and actions != []:
    problems.append("%s must carry no actions, has %r" % (state, actions))
if state == "ABSENT" and actions != ["build_new"]:
    problems.append("ABSENT must be exactly [build_new], has %r" % (actions,))
if state == "COMPLETE" and any(a != "verify_only" for a in actions or []):
    problems.append("COMPLETE must propose no mutation, has %r" % (actions,))
if state == "PARTIAL" and any(not (a.startswith("promote_") or a == "publish_final_marker")
                              for a in actions or []):
    problems.append("PARTIAL may only add, has %r" % (actions,))
if d.get("retryable") and state != "UNKNOWN":
    problems.append("retryable is only meaningful for UNKNOWN, state is %r" % (state,))

print("; ".join(problems) if problems else "PASS")
' "$got" "$want_state" "$want_actions" "$want_debt" "$want_retry" 2>&1)"
  if [[ "$check" == "PASS" ]]; then
    echo "ok    $name"
    ((passed++))
  else
    echo "FAIL  $name: $check"
    echo "      decision: $got"
    ((failed++))
  fi
}

echo "== absence must be observed, never inferred"
for bad in '{}' '[]' 'null' '{"schemaVersion":1}' \
  '{"schemaVersion":2,"commit":"'"$SHA"'","environment":"production","expected":{"repository":"owner/name","frontendConfigFingerprint":"'"$FP"'","signerWorkflow":"w"},"lookups":{}}' ; do
  assert_decision "unusable observation: $bad" "$bad" UNKNOWN '[]' false false
done
assert_decision "a missing lookup is not an absent one" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" | "$PYTHON" -c '
import json,sys
o=json.load(sys.stdin); del o["lookups"]["finalMarker"]; print(json.dumps(o))')" \
  UNKNOWN '[]' false false
assert_decision "an unexpected lookup key is a typo, not a fact" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" | "$PYTHON" -c '
import json,sys
o=json.load(sys.stdin); o["lookups"]["finlMarker"]={"status":"absent"}; print(json.dumps(o))')" \
  UNKNOWN '[]' false false
# Deliberately a complete, otherwise-valid observation: with the duplicate rejected this is
# UNKNOWN, and with it accepted the later "absent" wins and the whole thing classifies as ABSENT
# and authorises build_new. An earlier version of this case omitted the other lookups, so it
# reached UNKNOWN through the missing-key check either way and could not tell the two apart.
assert_decision "duplicate keys cannot hide an error behind an absence" \
  "{\"schemaVersion\":1,\"commit\":\"$SHA\",\"environment\":\"production\",
    \"expected\":{\"sourceRepository\":\"owner/name\",
                  \"repositories\":{\"release\":\"owner/name/release\",\"monolith\":\"owner/name/monolith\",\"frontend\":\"owner/name/frontend\"},
                  \"frontendConfigFingerprint\":\"$FP\",\"signerWorkflow\":\".github/workflows/publish.yml\",\"registry\":\"ghcr.io\"},
    \"lookups\":{\"finalMarker\":{\"status\":\"error\",\"code\":503},
                 \"finalMarker\":$absent_release,
                 \"preparedMarker\":$absent_release,\"monolithTag\":$absent_mono,\"frontendTag\":$absent_fe,
                 \"monolithDigestObject\":$absent_mono,\"frontendDigestObject\":$absent_fe,
                 \"monolithCandidate\":$absent_mono,\"frontendCandidate\":$absent_fe}}" \
  UNKNOWN '[]' false false

echo
echo "== ABSENT"
# A clean slate has no digest to have queried, so the digest objects are skipped rather than
# absent. Claiming absence there would be an observation nobody made.
assert_decision "nothing published at all" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")" \
  ABSENT '["build_new"]' false false
assert_decision "an orphan candidate is debt, not a release" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped" "$(present_in "$MONOLITH_REPO" "$MONO")")" \
  ABSENT '["build_new"]' true false
assert_decision "a digest object present with no marker is unexplained, not absent" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" "$(present_in "$MONOLITH_REPO" "$MONO")" "$skipped")" \
  CONFLICT '[]' false false

echo
echo "== PARTIAL, only with a trustworthy prepared marker and digests that still exist"
assert_decision "both tags missing" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
assert_decision "one tag missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$absent_fe")" \
  PARTIAL '["promote_frontend_tag","publish_final_marker"]' false false
assert_decision "both tags right, final marker missing" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  PARTIAL '["publish_final_marker"]' false false
assert_decision "a marker whose digest is no longer in the registry cannot be resumed" \
  "$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe" "$absent_mono")" \
  CONFLICT '[]' false false

echo
echo "== COMPLETE"
assert_decision "final marker and both tags agree" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  COMPLETE '["verify_only"]' false false
assert_decision "leftover candidate does not invalidate it" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "" "" "$(present_in "$MONOLITH_REPO" "$MONO")")" \
  COMPLETE '["verify_only"]' true false

echo
echo "== CONFLICT"
assert_decision "official tag with nothing to anchor it" \
  "$(observation "$absent_release" "$absent_release" "$(present_in "$MONOLITH_REPO" "$MONO")" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "tag disagrees with the prepared marker" \
  "$(observation "$absent_release" "$(marker)" "$(present_in "$MONOLITH_REPO" "$OTHER")" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "final marker present but a tag is absent" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "final trustworthy, prepared beside it is not" \
  "$(observation "$(marker)" "$(marker '{"verification":{"policyPassed":false}}')" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
  CONFLICT '[]' false false

echo
echo "== a marker that cannot be trusted is not a marker"
# These say `_content`, not `content`: the mutation happens before the envelope is derived, so each
# marker still names its own bytes and differs from the marker beside it only in being wrong about
# the release. Written the other way, the final-marker loop below pairs a mutated marker with a
# pristine one carrying the SAME digest, which is a self-contradicting observation -- unusable, and
# answered UNKNOWN by the rule above rather than CONFLICT by the trustworthiness rule each of these
# eleven cases is named for. The rules see identical content either way; only the digest moves.
untrustworthy=(
  '{"markerDigest":"nonsense"}|marker digest malformed'
  '{"_content":{"commit":"'"$OTHER_SHA"'"}}|records another commit'
  '{"_content":{"environment":"staging"}}|records another environment'
  '{"_content":{"frontendConfigFingerprint":"deadbeef"}}|fingerprint malformed'
  '{"_content":{"images":{"monolith":"sha256:zzzz"}}}|digest is not hex'
  '{"_content":{"provenance":{"monolith":{"revision":"'"$OTHER_SHA"'"}}}}|provenance points elsewhere'
  '{"_content":{"evidence":{"sbom":true}}}|sbom evidence is a boolean'
  '{"_content":{"evidence":{"vulnerabilityScan":{"monolith":"anything"}}}}|scan evidence is free text'
  '{"_content":{"flywayInventory":{"boundTo":"'"$OTHER"'"}}}|inventory bound to another image'
  '{"_content":{"flywayInventory":{"migrations":[]}}}|inventory has no migrations'
  '{"_content":{"flywayInventory":{"checksum":"short"}}}|inventory checksum malformed'
)
for entry in "${untrustworthy[@]}"; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label" \
    "$(observation "$absent_release" "$(marker "$override")" "$absent_mono" "$absent_fe")" \
    CONFLICT '[]' false false
done
for entry in "${untrustworthy[@]}"; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "final marker: $label" \
    "$(observation "$(marker "$override")" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")" \
    CONFLICT '[]' false false
done

echo
echo "== the schema rejects values that merely resemble the right ones"
base_obs() { observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe"; }
for tweak in   'o["schemaVersion"]=True|schemaVersion is boolean true'   'o["schemaVersion"]=1.0|schemaVersion is a float'   'o["commit"]=o["commit"]+chr(10)|commit has a trailing newline'   'o["expected"]["frontendConfigFingerprint"]+=chr(10)|fingerprint has a trailing newline'   'del o["expected"]["signerWorkflow"]|no expected signer workflow'   'o["lookups"]["finalMarker"]={"status":"absent"}|absence without an observed code'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":503,"queriedRef":"'"$RELEASE_REPO"':r"}|absence claimed from a 503'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":404,"code":503,"queriedRef":"'"$RELEASE_REPO"':r"}|absent carrying an error code'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":404}|absence without a queried reference'   ; do
  code="${tweak%%|*}"; label="${tweak##*|}"
  assert_decision "$label"     "$(base_obs | "$PYTHON" -c "
import json,sys
o=json.load(sys.stdin); $code; print(json.dumps(o))")"     UNKNOWN '[]' false false
done

echo
echo "== a marker is believed only after the collector verified it"
for entry in   '{"verification":null}|no verification block'   '{"verification":{"attestationVerified":false}}|attestation not verified'   '{"verification":{"attestationVerified":"true"}}|verification flag is a string'   '{"verification":{"subjectDigest":"'"$OTHER"'"}}|verified a different subject'   '{"verification":{"signerRepository":"someone/else"}}|signed by another repository'   '{"verification":{"signerWorkflow":".github/workflows/evil.yml"}}|signed by another workflow'   '{"verification":{"sourceRevision":"'"$OTHER_SHA"'"}}|built from another revision'   '{"verification":{"policyPassed":false}}|policy did not pass'   ; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label"     "$(observation "$absent_release" "$(marker "$override")" "$absent_mono" "$absent_fe")"     CONFLICT '[]' false false
done

echo
echo "== the Flyway inventory has to be an inventory"
for entry in   '{"content":{"flywayInventory":{"migrations":[true]}}}|migrations are booleans'   '{"content":{"flywayInventory":{"migrations":[null]}}}|migrations are nulls'   '{"content":{"flywayInventory":{"migrations":[{}]}}}|migration records are empty'   '{"content":{"flywayInventory":{"migrations":[{"version":"1","type":"SQL","script":"V1__a.sql","checksum":"1","success":true}]}}}|checksum is a string'   '{"content":{"flywayInventory":{"migrations":[{"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":false}]}}}|a migration failed'   '{"content":{"flywayInventory":{"checksum":"'"$(printf 'f%.0s' {1..64})"'"}}}|checksum does not match the migrations'   ; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label"     "$(observation "$absent_release" "$(marker "$override")" "$absent_mono" "$absent_fe")"     CONFLICT '[]' false false
done

echo
echo "== markers must be the same artifact, and the bytes must still be there"
# Two markers that are genuinely different artifacts. Each is internally consistent -- its own
# content, its own envelope derived from that content, its own digest recomputed from that envelope
# -- so neither carries a problem and the comparison gate above is open. The digests differ because
# the contents do, which after the shape guards is the only way two valid envelopes can differ at
# all, and the artefact-identity guard is the only rule left that can answer.
#
# The previous witness used `_envelope_subject` and stopped working the moment a subject became a
# problem: the marker turned untrustworthy, the gate closed, and CONFLICT arrived from a different
# rule while the suite stayed green.
#
# The difference is an extra key inside provenance, and it has to be a field no rule judges. Saying
# it with `environment` was measured to fail the same way `_envelope_subject` did: a marker naming
# another environment is untrustworthy, so the gate shuts and CONFLICT arrives from the
# prepared-marker-not-trustworthy rule instead. The reason string is the only thing that tells the
# two apart, which is why this witness was chosen by reading it rather than by reading the state.
assert_decision "final and prepared are different artifacts"   "$(observation "$(marker)" "$(marker '{"_content":{"provenance":{"monolith":{"extra":"different artifact"}}}}')" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")"   CONFLICT '[]' false false
assert_decision "COMPLETE requires the digest objects to exist"   "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "$absent_mono" "$absent_fe")"   CONFLICT '[]' false false
assert_decision "COMPLETE requires the digest objects to match"   "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")" "$(present_in "$MONOLITH_REPO" "$OTHER")")"   CONFLICT '[]' false false

echo
echo "== guards that the mutation runner found untested"
# Content-addressed storage cannot produce two different contents under one digest, so an
# observation showing it contradicts itself and nothing here can choose which half to believe.
# The verdict is UNKNOWN rather than CONFLICT because such an observation is unusable rather than
# adjudicable: there is nothing for an operator to decide between, only a collection to re-run.
assert_decision "same marker digest but different content"   "$(observation "$(marker)" "$(marker '{"content":{"environment":"production","provenance":{"monolith":{"revision":"'"$SHA"'","subjectDigest":"'"$MONO"'","extra":"different"}}}}')" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(present_in "$FRONTEND_REPO" "$FRONT")")"   UNKNOWN '[]' false false
# A status that is not a string used to raise TypeError out of the membership test: traceback,
# exit 1, and no decision for the caller to read at all.
assert_decision "a status that is not a string"   "$(observation '{"status":[]}' "$absent_release" "$absent_mono" "$absent_fe")"   UNKNOWN '[]' false false
assert_decision "a status that is a number"   "$(observation '{"status":404}' "$absent_release" "$absent_mono" "$absent_fe")"   UNKNOWN '[]' false false
# skipped is the one status that asserts a question was never asked, so its reason is the whole
# justification and an unrecognised one means nobody knows why the lookup is missing.
assert_decision "skipped for an unrecognised reason"   "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" '{"status":"skipped","reason":"felt_like_it","queriedRef":null}' "$skipped")"   UNKNOWN '[]' false false
assert_decision "only a digest object may be skipped"   "$(observation '{"status":"skipped","reason":"no_claimed_digest","queriedRef":null}' "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")"   UNKNOWN '[]' false false

echo
echo "== the observation and the schema agree on what a lookup is"
assert_decision "no expected registry" \
  "$(base_obs | "$PYTHON" -c '
import json,sys
o=json.load(sys.stdin); del o["expected"]["registry"]; print(json.dumps(o))')" \
  UNKNOWN '[]' false false
# A well-formed observation of somebody else'"'"'s repository answers a question nobody asked, and its
# absences would authorise a build here.
assert_decision "a lookup made outside the expected repository" \
  "$(observation '{"status":"absent","observedCode":404,"queriedRef":"ghcr.io/someone/else:sha-x"}' \
     "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")" \
  UNKNOWN '[]' false false
assert_decision "a lookup made in another registry" \
  "$(observation '{"status":"absent","observedCode":404,"queriedRef":"docker.io/owner/name:sha-x"}' \
     "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")" \
  UNKNOWN '[]' false false
# The prefix must end at a reference separator, or .../release-evil passes as .../release. The
# extension has to be built on the scope actually in force: this case named ghcr.io/owner/name-evil
# until the repositories were nested, at which point it stopped extending any scope at all and the
# guard it exists for lost its only witness. Both separators, because only ':' was ever exercised.
assert_decision "a repository whose name merely starts with the expected one" \
  "$(observation '{"status":"absent","observedCode":404,"queriedRef":"'"$RELEASE_REPO"'-evil:sha-x"}' \
     "$absent_release" "$absent_mono" "$absent_fe" "$skipped" "$skipped")" \
  UNKNOWN '[]' false false
assert_decision "a look-alike repository addressed by digest" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$(present_in "$MONOLITH_REPO-evil" "$MONO")" "$skipped")" \
  UNKNOWN '[]' false false
# Nothing was queried, so a reference here describes a lookup that never happened.
assert_decision "skipped carrying a queried reference" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     '{"status":"skipped","reason":"no_claimed_digest","queriedRef":"'"$MONOLITH_REPO"'@'"$MONO"'"}' \
     "$skipped")" \
  UNKNOWN '[]' false false
assert_decision "skipped without the queriedRef key at all" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     '{"status":"skipped","reason":"no_claimed_digest"}' "$skipped")" \
  UNKNOWN '[]' false false

echo
echo "== each lookup is pinned to its own repository, not to a shared scope"
# Eight cases rather than one assertion about the table's key set, because the table is inside the
# embedded Python and nothing outside the script can import it -- and because these pin what the
# table says, not merely how many entries it has. A ninth lookup added without an entry is refused
# by the require() below rather than crashing the decision with a KeyError.
for entry in \
  "finalMarker|1|$MONOLITH_REPO" \
  "preparedMarker|2|$FRONTEND_REPO" \
  "monolithTag|3|$RELEASE_REPO" \
  "frontendTag|4|$MONOLITH_REPO" \
  ; do
  which="${entry%%|*}"; rest="${entry#*|}"; position="${rest%%|*}"; wrong="${rest##*|}"
  args=("$absent_release" "$absent_release" "$absent_mono" "$absent_fe")
  args[$((position - 1))]="$(absent_in "$wrong")"
  assert_decision "$which queried in the wrong repository" \
    "$(observation "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}" "$skipped" "$skipped")" \
    UNKNOWN '[]' false false
done
assert_decision "monolithDigestObject queried in the release repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$(present_in "$RELEASE_REPO" "$MONO")" "$skipped")" \
  UNKNOWN '[]' false false
assert_decision "frontendDigestObject queried in the monolith repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$(present_in "$MONOLITH_REPO" "$FRONT")")" \
  UNKNOWN '[]' false false
assert_decision "monolithCandidate queried in the frontend repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$skipped" "$(absent_in "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false false
assert_decision "frontendCandidate queried in the release repository" \
  "$(observation "$absent_release" "$absent_release" "$absent_mono" "$absent_fe" \
     "$skipped" "$skipped" "$absent_mono" "$(absent_in "$RELEASE_REPO")")" \
  UNKNOWN '[]' false false

echo
echo "== the three repositories are three, and the signer is not one of them"
mangle() { base_obs | "$PYTHON" -c "
import json,sys
o=json.load(sys.stdin)
exec(sys.argv[1])
print(json.dumps(o))" "$1"; }

# Two roles sharing a repository makes the pinning above vacuous: a reference into the wrong
# package satisfies the scope of both, and the only thing left telling them apart is the tag,
# whose shape this contract does not fix yet. JSON Schema cannot state this, so the decision does.
#
# Collapsing a role onto release has to move that role's references with it, or the case never
# reaches the distinctness rule: the lookups would still name the repository the role used to
# have, and the scope check above refuses them first. Deleting the rule then changes nothing and
# the case passes for a reason it was not written to test. It survived exactly that way once.
collide() { base_obs | "$PYTHON" -c "
import json,sys
o=json.load(sys.stdin)
reg=o['expected']['registry']; reps=o['expected']['repositories']
target=reps['release']
for role in sys.argv[1:]:
    old=reps[role]
    reps[role]=target
    was=reg+'/'+old
    for lookup in o['lookups'].values():
        ref=lookup.get('queriedRef')
        if isinstance(ref,str) and (ref.startswith(was+':') or ref.startswith(was+'@')):
            lookup['queriedRef']=reg+'/'+target+ref[len(was):]
print(json.dumps(o))" "$@"; }

assert_decision "two roles naming one repository" \
  "$(collide monolith)" \
  UNKNOWN '[]' false false
assert_decision "all three naming one repository" \
  "$(collide monolith frontend)" \
  UNKNOWN '[]' false false
assert_decision "a source repository with three segments" \
  "$(mangle 'o["expected"]["sourceRepository"] = "owner/name/release"')" \
  UNKNOWN '[]' false false
# The references move with the role here for the same reason they do in collide(): leaving them in
# ghcr.io/owner/name/monolith puts them outside the new scope ghcr.io/monolith, the scope check
# refuses them first, and the pattern this case exists for could be deleted with the suite green.
assert_decision "an OCI repository with one segment" \
  "$(mangle 'reg=o["expected"]["registry"]; reps=o["expected"]["repositories"]
was=reg+"/"+reps["monolith"]; reps["monolith"]="monolith"
for lookup in o["lookups"].values():
    ref=lookup.get("queriedRef")
    if isinstance(ref,str) and (ref.startswith(was+":") or ref.startswith(was+"@")):
        lookup["queriedRef"]=reg+"/monolith"+ref[len(was):]')" \
  UNKNOWN '[]' false false
# A fourth role is inert -- nothing reads it -- which is exactly why it needs a witness: an inert
# key is the kind a half-migrated collector emits, and the contract should say so rather than
# shrug. Same reason the lookups key set is closed.
assert_decision "a fourth repository role" \
  "$(mangle 'o["expected"]["repositories"]["evidence"] = "owner/name/evidence"')" \
  UNKNOWN '[]' false false
# The schema forbids these, but nothing runs the schema in front of the decision, so until the
# decision restates the rule an unknown key is a rule on paper. The first of these is the one that
# matters: it is the key commit 4 removed, so an observation carrying it is a half-migrated
# collector, and answering it as though it were current is how a stale producer goes unnoticed.
assert_decision "the key commit 4 removed, still present" \
  "$(mangle 'o["expected"]["repository"] = "attacker/thing"')" \
  UNKNOWN '[]' false false
assert_decision "an unknown key at the top level" \
  "$(mangle 'o["surprise"] = 1')" \
  UNKNOWN '[]' false false
assert_decision "no repositories at all" \
  "$(mangle 'del o["expected"]["repositories"]')" \
  UNKNOWN '[]' false false
assert_decision "a repositories object missing a role" \
  "$(mangle 'del o["expected"]["repositories"]["frontend"]')" \
  UNKNOWN '[]' false false
# The whole reason for splitting the key: before it, these two were one string and this case could
# not be written at all.
assert_decision "a marker signed by the release repository rather than the source one" \
  "$(observation "$absent_release" \
     "$(marker '{"verification":{"signerRepository":"owner/name/release"}}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false

echo
echo "== evidence answers four questions, and each one has to have been answered"
for entry in \
  '{"verification":{"predicateType":null}}|verification does not say what was attested' \
  '{"verification":{"predicateType":""}}|attested predicate type is empty' \
  '{"content":{"evidence":{"layerSecretScan":null}}}|no layer secret scan' \
  '{"content":{"evidence":{"filesystemSecretScan":null}}}|no filesystem secret scan' \
  '{"content":{"evidence":{"sbom":{"monolith":{"predicateType":null}}}}}|sbom does not say what it states' \
  '{"content":{"evidence":{"vulnerabilityScan":{"monolith":{"passed":false}}}}}|vulnerability scan did not pass' \
  '{"content":{"evidence":{"layerSecretScan":{"frontend":{"passed":"true"}}}}}|layer scan result is a string' \
  '{"content":{"evidence":{"filesystemSecretScan":{"monolith":{"passed":null}}}}}|filesystem scan has no result' \
  ; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label" \
    "$(observation "$absent_release" "$(marker "$override")" "$absent_mono" "$absent_fe")" \
    CONFLICT '[]' false false
done

echo
echo "== the Flyway inventory records the order Flyway applied things in"
for entry in \
  '[{"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true}]|a migration with no installedRank' \
  '[{"installedRank":0,"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true}]|installedRank below one' \
  '[{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true},{"installedRank":1,"version":"2","type":"SQL","script":"V2__b.sql","checksum":2,"success":true}]|two migrations with the same installedRank' \
  '[{"installedRank":1,"version":null,"type":"SQL","script":"R__view.sql","checksum":1,"success":true},{"installedRank":2,"version":null,"type":"SQL","script":"R__view.sql","checksum":2,"success":true}]|the same repeatable listed twice' \
  ; do
  migrations="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label" \
    "$(observation "$absent_release" "$(marker "{\"_migrations\":$migrations}")" "$absent_mono" "$absent_fe")" \
    CONFLICT '[]' false false
done
# Two repeatables are not a duplicate merely because both lack a version -- requiring a unique
# version string would have rejected the first release that added one, and the schema, not the
# release, would have been wrong.
assert_decision "several repeatables share the absence of a version" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":null,"type":"SQL","script":"R__one.sql","checksum":1,"success":true},{"installedRank":2,"version":null,"type":"SQL","script":"R__two.sql","checksum":2,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# Flyway records no checksum for some entries, and a release must not be blocked by an absence
# Flyway itself produced.
assert_decision "a migration Flyway recorded no checksum for" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":null,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
# The canonical form is ordered by installedRank, so the order the collector happened to read the
# table in cannot change the checksum. Both of these hash to the same value by construction: the
# fixture sorts before hashing, and the subject has to do the same or one of them is rejected.
assert_decision "migrations listed out of order still hash the same" \
  "$(observation "$absent_release" "$(marker '{"_migrations":[{"installedRank":2,"version":"2","type":"SQL","script":"V2__b.sql","checksum":2,"success":true},{"installedRank":1,"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":true}]}')" "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false

echo
echo "== UNKNOWN outranks everything and proposes nothing"
error_lookup() { printf '{"status":"error","code":%s,"queriedRef":"%s:sha-x"}' "$1" "${2:-$RELEASE_REPO}"; }
for code in 408 429 500 502 503 504; do
  assert_decision "code $code is retryable" \
    "$(observation "$(error_lookup "$code")" "$absent_release" "$absent_mono" "$absent_fe")" \
    UNKNOWN '[]' false true
done
# Not only the four common ones. Enumerating 500/502/503/504 left 501 and 507 failing immediately
# when they are exactly as worth one more attempt.
for code in 501 507; do
  assert_decision "code $code is retryable as well" \
    "$(observation "$(error_lookup "$code")" "$absent_release" "$absent_mono" "$absent_fe")" \
    UNKNOWN '[]' false true
done
for code in 401 403 404; do
  assert_decision "code $code is not retryable" \
    "$(observation "$(error_lookup "$code")" "$absent_release" "$absent_mono" "$absent_fe")" \
    UNKNOWN '[]' false false
done
# Two errors at once, which no case above ever had. The scan returned at the first error in
# alphabetical key order, so with one retryable and one not the answer depended on which lookup
# happened to sort first -- `finalMarker` before `frontendTag` decides it, and nothing about either
# code does. Retrying cannot help while a 403 stands, so retryable is true only when every error is.
assert_decision "a retryable error sorting before a permanent one" \
  "$(observation "$(error_lookup 503)" "$absent_release" "$absent_mono" \
     "$(error_lookup 403 "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false false
assert_decision "a permanent error sorting before a retryable one" \
  "$(observation "$(error_lookup 403)" "$absent_release" "$absent_mono" \
     "$(error_lookup 503 "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false false
assert_decision "two errors that are both worth another attempt" \
  "$(observation "$(error_lookup 503)" "$absent_release" "$absent_mono" \
     "$(error_lookup 500 "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false true
assert_decision "cleanup debt survives an unknown" \
  "$(observation "$(error_lookup 503)" "$absent_release" "$absent_mono" "$absent_fe" "" "" "$(present_in "$MONOLITH_REPO" "$MONO")")" \
  UNKNOWN '[]' true true
assert_decision "an error outranks an otherwise complete release" \
  "$(observation "$(marker)" "$(marker)" "$(present_in "$MONOLITH_REPO" "$MONO")" "$(error_lookup 500 "$FRONTEND_REPO")")" \
  UNKNOWN '[]' false true
for bad_digest in '""' '"sha256:abc"' '"sha256:'"$(printf 'z%.0s' {1..64})"'"' '"1111"'; do
  assert_decision "a malformed tag digest is not a digest: $bad_digest" \
    "$(observation "$absent_release" "$(marker)" "{\"status\":\"present\",\"digest\":$bad_digest}" "$absent_fe")" \
    UNKNOWN '[]' false false
done
assert_decision "an unrecognised status is not a status" \
  "$(observation '{"status":"probably"}' "$absent_release" "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false

echo
echo "== a lookup may carry only the fields its own kind has"
# Both of these were rejected by the schema and accepted here. The tag keeps a valid digest and the
# marker keeps every field it needs, so the only thing wrong with each is a field belonging to the
# other kind -- otherwise the case would reach UNKNOWN through the missing-field check instead and
# prove nothing.
tag_with_marker_fields="$(base_obs | python_json '
import json, sys
o = json.loads(sys.stdin.read())
o["lookups"]["monolithTag"] = {"status": "present",
                               "queriedRef": sys.argv[4] + ":sha-" + sys.argv[1],
                               "digest": sys.argv[2],
                               "markerDigest": sys.argv[3],
                               "verification": {"attestationVerified": True}}
print(json.dumps(o))' "$SHA" "$MONO" "$MARKER_DIGEST" "$MONOLITH_REPO")"
assert_decision "a tag carrying marker fields" "$tag_with_marker_fields" UNKNOWN '[]' false false

marker_with_digest="$(observation "$absent_release" "$(marker)" "$absent_mono" "$absent_fe" | python_json '
import json, sys
o = json.loads(sys.stdin.read())
o["lookups"]["preparedMarker"]["digest"] = sys.argv[1]
print(json.dumps(o))' "$MONO")"
assert_decision "a marker carrying a digest" "$marker_with_digest" UNKNOWN '[]' false false

# A one-marker observation, so envelope cases read as one line each.
marker_obs() { observation "$(marker "$1")" "$absent_release" "$absent_mono" "$absent_fe"; }

echo
echo "== a present marker carries the envelope it travelled in"
for missing in digestVerified sizeVerified parsed; do
  assert_decision "an envelope missing $missing" \
    "$(observation "$(marker "{\"_envelope_del\": \"$missing\"}")" "$absent_release" \
       "$absent_mono" "$absent_fe")" \
    UNKNOWN '[]' false false
done
for wrong in '"yes"' '1'; do
  assert_decision "digestVerified is $wrong rather than a boolean" \
    "$(marker_obs "{\"ociEnvelope\": {\"digestVerified\": $wrong}}")" \
    UNKNOWN '[]' false false
done
# null gets its own case, with raw removed and the marker in the prepared slot, because the obvious
# spelling of it is not attributable. `{"ociEnvelope": {"digestVerified": null}}` beside a present
# raw reaches UNKNOWN with the boolean type check deleted too: None is falsy, so all_verified goes
# false while raw is still there and the raw-implies-all-verified require fires instead. Written
# this way the type check is the only thing that can answer UNKNOWN -- delete it and None merely
# reads as falsy, the envelope is judged failed, and a prepared marker that would otherwise reach
# PARTIAL becomes CONFLICT.
assert_decision "digestVerified is null rather than a boolean" \
  "$(observation "$absent_release" "$(marker '{"_envelope_flag": ["digestVerified", null]}')" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
# An envelope that is not an object at all. Not a missing flag and not a bad flag: the type check
# above the flag loop, which nothing else reaches, and without which the loop below it raises
# AttributeError and the caller gets a traceback instead of a decision.
assert_decision "an ociEnvelope that is not an object" \
  "$(marker_obs '{"ociEnvelope": 5}')" \
  UNKNOWN '[]' false false
assert_decision "no ociEnvelope at all" \
  "$(observation "$(marker '{"_envelope_absent": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
# raw exists only when all three checks passed. A raw sitting beside digestVerified:false is a
# document reporting bytes it was forbidden to read -- section 2 orders the size check, then the
# hash, then the parse, and nothing may be parsed before the descriptor matches.
for flag in digestVerified sizeVerified parsed; do
  assert_decision "raw present while $flag is false" \
    "$(marker_obs "{\"ociEnvelope\": {\"$flag\": false}}")" \
    UNKNOWN '[]' false false
done
assert_decision "raw absent while all three are true" \
  "$(observation "$(marker '{"_envelope_del_raw": true}')" "$absent_release" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
# parsed:false is a completed check that came back negative: the producer published bytes that are
# not JSON. A verdict, not a defect in the observation.
#
# In the PREPARED slot for the same reason the 5.2 cases below are: a marker in the final slot
# beside absent tags is CONFLICT whether or not anything reads its envelope, so these three would
# survive the deletion of the rule they exist for. In the prepared slot a trustworthy marker reaches
# PARTIAL, and only the envelope verdict can turn it.
assert_decision "bytes that matched the descriptor but are not JSON" \
  "$(observation "$absent_release" "$(marker '{"_envelope_unparsed": true}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
for flag in digestVerified sizeVerified; do
  assert_decision "$flag is false" \
    "$(observation "$absent_release" "$(marker "{\"_envelope_failed\": \"$flag\"}")" \
       "$absent_mono" "$absent_fe")" \
    CONFLICT '[]' false false
done
# Section 5.2. Each of these mutates raw AND carries the digest of the mutated raw, so the equality
# below holds and the only thing that can refuse the observation is the rule under test. Written the
# other way -- a mutated raw beside a stale digest -- every one of them would reach CONFLICT through
# the digest guard, and deleting the rule under test would leave them green.
#
# All three sit in the PREPARED slot, not the final one. A marker in the final slot beside absent
# tags is CONFLICT whatever its envelope says, so the equality guard could be deleted and these
# would stay green on the missing-tag rule instead -- reaching the right verdict for the wrong
# reason. In the prepared slot a trustworthy marker reaches PARTIAL, so CONFLICT here can only have
# come from the rule under test.
assert_decision "a raw the marker digest does not name" \
  "$(observation "$absent_release" "$(marker '{"_envelope_retag": true}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "a raw that is a retyped copy rather than the bytes themselves" \
  "$(observation "$absent_release" "$(marker '{"_envelope_reorder": true}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
# The counterweight: a raw carrying a subject is a bad artifact, but in 5a no rule judges the shape
# of a manifest, so with its own digest recomputed it must pass. 5b is what turns this to CONFLICT,
# and this case is how 5b proves its guard did the turning.
assert_decision "a raw carrying a subject is not yet judged" \
  "$(observation "$absent_release" "$(marker '{"_envelope_subject": true}')" \
     "$absent_mono" "$absent_fe")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false

echo
echo "== content exists only when there is exactly one payload to read"
# Two layers means no answer to "which one is the payload", so the collector must not parse either.
# Same rule as section 2's, one level down: nothing is read before it is identified.
#
# All three in the PREPARED slot, for the reason the sections above give: a present marker in the
# FINAL slot beside absent tags is CONFLICT whatever its envelope says, so the first case -- the one
# that wants CONFLICT -- would have been green before the layer-count rule existed and green after
# its deletion. In the prepared slot a trustworthy marker reaches PARTIAL, so only the rule under
# test can turn it.
assert_decision "two layers and no content" \
  "$(observation "$absent_release" "$(marker '{"_envelope_two_layers": true}')" \
     "$absent_mono" "$absent_fe")" \
  CONFLICT '[]' false false
assert_decision "two layers but content anyway" \
  "$(observation "$absent_release" "$(marker '{"_envelope_two_layers_with_content": true}')" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false
assert_decision "content present while the digest check failed" \
  "$(observation "$absent_release" \
     "$(marker '{"_envelope_failed_with_content": "digestVerified"}')" \
     "$absent_mono" "$absent_fe")" \
  UNKNOWN '[]' false false

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
