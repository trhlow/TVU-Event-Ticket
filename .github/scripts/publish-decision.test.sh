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

passed=0
failed=0

SHA=0123456789abcdef0123456789abcdef01234567
OTHER_SHA=ffffffffffffffffffffffffffffffffffffffff
MONO=sha256:1111111111111111111111111111111111111111111111111111111111111111
FRONT=sha256:2222222222222222222222222222222222222222222222222222222222222222
OTHER=sha256:9999999999999999999999999999999999999999999999999999999999999999
MARKER_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333
FP=fea7afe794dacc6140c57ac4d8406f6ff97eb763c279c679f8fb89fcfa0f9477

python_json() { python3 -c "$1" "${@:2}"; }

# marker [json-overrides] [images-monolith] [images-frontend] [marker-digest]
marker() {
  python_json '
import hashlib, json, sys
overrides = json.loads(sys.argv[1] or "{}")
mono, front, mdigest, sha, fp = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
migrations = [{"version": "16", "type": "SQL", "script": "V16__x.sql",
               "checksum": 123456789, "success": True}]
canonical = json.dumps(migrations, sort_keys=True, separators=(",", ":"))
base = {
  "status": "present",
  "queriedRef": "ghcr.io/owner/name:release-" + sha,
  "markerDigest": mdigest,
  "verification": {
    "attestationVerified": True, "subjectDigest": mdigest,
    "signerRepository": "owner/name", "signerWorkflow": ".github/workflows/publish.yml",
    "sourceRevision": sha, "policyPassed": True,
  },
  "content": {
    "commit": sha, "environment": "production", "frontendConfigFingerprint": fp,
    "images": {"monolith": mono, "frontend": front},
    "provenance": {"monolith": {"revision": sha, "subjectDigest": mono},
                   "frontend": {"revision": sha, "subjectDigest": front}},
    "evidence": {
      "sbom": {"monolith": {"digest": "sha256:" + "a"*64, "subjectDigest": mono},
               "frontend": {"digest": "sha256:" + "b"*64, "subjectDigest": front}},
      "vulnerabilityScan": {"monolith": {"digest": "sha256:" + "c"*64, "subjectDigest": mono},
                            "frontend": {"digest": "sha256:" + "d"*64, "subjectDigest": front}},
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
merge(base, overrides)
print(json.dumps(base))
' "${1:-}" "${2:-$MONO}" "${3:-$FRONT}" "${4:-$MARKER_DIGEST}" "$SHA" "$FP"
}

present() { printf '{"status":"present","queriedRef":"ghcr.io/owner/name@%s","digest":"%s"}' "$1" "$1"; }
absent='{"status":"absent","observedCode":404,"queriedRef":"ghcr.io/owner/name:sha-x"}'
# A digest object cannot be queried before a marker names one, so a clean slate skips it. Claiming
# absence there would assert an observation nobody made.
skipped='{"status":"skipped","reason":"no_claimed_digest"}'

# observation <final> <prepared> <monoTag> <frontTag> [monoObj] [frontObj] [monoCand] [frontCand]
observation() {
  cat <<EOF
{"schemaVersion":1,"commit":"$SHA","environment":"production",
 "expected":{"repository":"owner/name","frontendConfigFingerprint":"$FP","signerWorkflow":".github/workflows/publish.yml"},
 "lookups":{"finalMarker":$1,"preparedMarker":$2,"monolithTag":$3,"frontendTag":$4,
            "monolithDigestObject":${5:-$(present "$MONO")},
            "frontendDigestObject":${6:-$(present "$FRONT")},
            "monolithCandidate":${7:-$absent},"frontendCandidate":${8:-$absent}}}
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
  "$(observation "$absent" "$absent" "$absent" "$absent" | python3 -c '
import json,sys
o=json.load(sys.stdin); del o["lookups"]["finalMarker"]; print(json.dumps(o))')" \
  UNKNOWN '[]' false false
assert_decision "an unexpected lookup key is a typo, not a fact" \
  "$(observation "$absent" "$absent" "$absent" "$absent" | python3 -c '
import json,sys
o=json.load(sys.stdin); o["lookups"]["finlMarker"]={"status":"absent"}; print(json.dumps(o))')" \
  UNKNOWN '[]' false false
# Deliberately a complete, otherwise-valid observation: with the duplicate rejected this is
# UNKNOWN, and with it accepted the later "absent" wins and the whole thing classifies as ABSENT
# and authorises build_new. An earlier version of this case omitted the other lookups, so it
# reached UNKNOWN through the missing-key check either way and could not tell the two apart.
assert_decision "duplicate keys cannot hide an error behind an absence" \
  "{\"schemaVersion\":1,\"commit\":\"$SHA\",\"environment\":\"production\",
    \"expected\":{\"repository\":\"owner/name\",\"frontendConfigFingerprint\":\"$FP\",\"signerWorkflow\":\".github/workflows/publish.yml\"},
    \"lookups\":{\"finalMarker\":{\"status\":\"error\",\"code\":503},
                 \"finalMarker\":$absent,
                 \"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent,
                 \"monolithDigestObject\":$absent,\"frontendDigestObject\":$absent,
                 \"monolithCandidate\":$absent,\"frontendCandidate\":$absent}}" \
  UNKNOWN '[]' false false

echo
echo "== ABSENT"
# A clean slate has no digest to have queried, so the digest objects are skipped rather than
# absent. Claiming absence there would be an observation nobody made.
assert_decision "nothing published at all" \
  "$(observation "$absent" "$absent" "$absent" "$absent" "$skipped" "$skipped")" \
  ABSENT '["build_new"]' false false
assert_decision "an orphan candidate is debt, not a release" \
  "$(observation "$absent" "$absent" "$absent" "$absent" "$skipped" "$skipped" "$(present "$MONO")")" \
  ABSENT '["build_new"]' true false
assert_decision "a digest object present with no marker is unexplained, not absent" \
  "$(observation "$absent" "$absent" "$absent" "$absent" "$(present "$MONO")" "$skipped")" \
  CONFLICT '[]' false false

echo
echo "== PARTIAL, only with a trustworthy prepared marker and digests that still exist"
assert_decision "both tags missing" \
  "$(observation "$absent" "$(marker)" "$absent" "$absent")" \
  PARTIAL '["promote_monolith_tag","promote_frontend_tag","publish_final_marker"]' false false
assert_decision "one tag missing" \
  "$(observation "$absent" "$(marker)" "$(present "$MONO")" "$absent")" \
  PARTIAL '["promote_frontend_tag","publish_final_marker"]' false false
assert_decision "both tags right, final marker missing" \
  "$(observation "$absent" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")")" \
  PARTIAL '["publish_final_marker"]' false false
assert_decision "a marker whose digest is no longer in the registry cannot be resumed" \
  "$(observation "$absent" "$(marker)" "$absent" "$absent" "$absent")" \
  CONFLICT '[]' false false

echo
echo "== COMPLETE"
assert_decision "final marker and both tags agree" \
  "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")")" \
  COMPLETE '["verify_only"]' false false
assert_decision "leftover candidate does not invalidate it" \
  "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")" "" "" "$(present "$MONO")")" \
  COMPLETE '["verify_only"]' true false

echo
echo "== CONFLICT"
assert_decision "official tag with nothing to anchor it" \
  "$(observation "$absent" "$absent" "$(present "$MONO")" "$absent")" \
  CONFLICT '[]' false false
assert_decision "tag disagrees with the prepared marker" \
  "$(observation "$absent" "$(marker)" "$(present "$OTHER")" "$absent")" \
  CONFLICT '[]' false false
assert_decision "final marker present but a tag is absent" \
  "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$absent")" \
  CONFLICT '[]' false false
assert_decision "final trustworthy, prepared beside it is not" \
  "$(observation "$(marker)" "$(marker '{"verification":{"policyPassed":false}}')" "$(present "$MONO")" "$(present "$FRONT")")" \
  CONFLICT '[]' false false

echo
echo "== a marker that cannot be trusted is not a marker"
untrustworthy=(
  '{"markerDigest":"nonsense"}|marker digest malformed'
  '{"content":{"commit":"'"$OTHER_SHA"'"}}|records another commit'
  '{"content":{"environment":"staging"}}|records another environment'
  '{"content":{"frontendConfigFingerprint":"deadbeef"}}|fingerprint malformed'
  '{"content":{"images":{"monolith":"sha256:zzzz"}}}|digest is not hex'
  '{"content":{"provenance":{"monolith":{"revision":"'"$OTHER_SHA"'"}}}}|provenance points elsewhere'
  '{"content":{"evidence":{"sbom":true}}}|sbom evidence is a boolean'
  '{"content":{"evidence":{"vulnerabilityScan":{"monolith":"anything"}}}}|scan evidence is free text'
  '{"content":{"flywayInventory":{"boundTo":"'"$OTHER"'"}}}|inventory bound to another image'
  '{"content":{"flywayInventory":{"migrations":[]}}}|inventory has no migrations'
  '{"content":{"flywayInventory":{"checksum":"short"}}}|inventory checksum malformed'
)
for entry in "${untrustworthy[@]}"; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label" \
    "$(observation "$absent" "$(marker "$override")" "$absent" "$absent")" \
    CONFLICT '[]' false false
done
for entry in "${untrustworthy[@]}"; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "final marker: $label" \
    "$(observation "$(marker "$override")" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")")" \
    CONFLICT '[]' false false
done

echo
echo "== the schema rejects values that merely resemble the right ones"
base_obs() { observation "$absent" "$absent" "$absent" "$absent"; }
for tweak in   'o["schemaVersion"]=True|schemaVersion is boolean true'   'o["schemaVersion"]=1.0|schemaVersion is a float'   'o["commit"]=o["commit"]+chr(10)|commit has a trailing newline'   'o["expected"]["frontendConfigFingerprint"]+=chr(10)|fingerprint has a trailing newline'   'del o["expected"]["signerWorkflow"]|no expected signer workflow'   'o["lookups"]["finalMarker"]={"status":"absent"}|absence without an observed code'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":503,"queriedRef":"r"}|absence claimed from a 503'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":404,"code":503,"queriedRef":"r"}|absent carrying an error code'   'o["lookups"]["finalMarker"]={"status":"absent","observedCode":404}|absence without a queried reference'   ; do
  code="${tweak%%|*}"; label="${tweak##*|}"
  assert_decision "$label"     "$(base_obs | python3 -c "
import json,sys
o=json.load(sys.stdin); $code; print(json.dumps(o))")"     UNKNOWN '[]' false false
done

echo
echo "== a marker is believed only after the collector verified it"
for entry in   '{"verification":null}|no verification block'   '{"verification":{"attestationVerified":false}}|attestation not verified'   '{"verification":{"attestationVerified":"true"}}|verification flag is a string'   '{"verification":{"subjectDigest":"'"$OTHER"'"}}|verified a different subject'   '{"verification":{"signerRepository":"someone/else"}}|signed by another repository'   '{"verification":{"signerWorkflow":".github/workflows/evil.yml"}}|signed by another workflow'   '{"verification":{"sourceRevision":"'"$OTHER_SHA"'"}}|built from another revision'   '{"verification":{"policyPassed":false}}|policy did not pass'   ; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label"     "$(observation "$absent" "$(marker "$override")" "$absent" "$absent")"     CONFLICT '[]' false false
done

echo
echo "== the Flyway inventory has to be an inventory"
for entry in   '{"content":{"flywayInventory":{"migrations":[true]}}}|migrations are booleans'   '{"content":{"flywayInventory":{"migrations":[null]}}}|migrations are nulls'   '{"content":{"flywayInventory":{"migrations":[{}]}}}|migration records are empty'   '{"content":{"flywayInventory":{"migrations":[{"version":"1","type":"SQL","script":"V1__a.sql","checksum":"1","success":true}]}}}|checksum is a string'   '{"content":{"flywayInventory":{"migrations":[{"version":"1","type":"SQL","script":"V1__a.sql","checksum":1,"success":false}]}}}|a migration failed'   '{"content":{"flywayInventory":{"checksum":"'"$(printf 'f%.0s' {1..64})"'"}}}|checksum does not match the migrations'   ; do
  override="${entry%%|*}"; label="${entry##*|}"
  assert_decision "prepared marker: $label"     "$(observation "$absent" "$(marker "$override")" "$absent" "$absent")"     CONFLICT '[]' false false
done

echo
echo "== markers must be the same artifact, and the bytes must still be there"
assert_decision "markers agree on images but are different artifacts"   "$(observation "$(marker)" "$(marker '' '' '' 'sha256:4444444444444444444444444444444444444444444444444444444444444444')" "$(present "$MONO")" "$(present "$FRONT")")"   CONFLICT '[]' false false
assert_decision "COMPLETE requires the digest objects to exist"   "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")" "$absent" "$absent")"   CONFLICT '[]' false false
assert_decision "COMPLETE requires the digest objects to match"   "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$(present "$FRONT")" "$(present "$OTHER")")"   CONFLICT '[]' false false

echo
echo "== guards that the mutation runner found untested"
# Content-addressed storage cannot produce two different contents under one digest, so an
# observation showing it contradicts itself and nothing here can choose which half to believe.
assert_decision "same marker digest but different content"   "$(observation "$(marker)" "$(marker '{"content":{"environment":"production","provenance":{"monolith":{"revision":"'"$SHA"'","subjectDigest":"'"$MONO"'","extra":"different"}}}}')" "$(present "$MONO")" "$(present "$FRONT")")"   CONFLICT '[]' false false
# A status that is not a string used to raise TypeError out of the membership test: traceback,
# exit 1, and no decision for the caller to read at all.
assert_decision "a status that is not a string"   "$(observation '{"status":[]}' "$absent" "$absent" "$absent")"   UNKNOWN '[]' false false
assert_decision "a status that is a number"   "$(observation '{"status":404}' "$absent" "$absent" "$absent")"   UNKNOWN '[]' false false
# skipped is the one status that asserts a question was never asked, so its reason is the whole
# justification and an unrecognised one means nobody knows why the lookup is missing.
assert_decision "skipped for an unrecognised reason"   "$(observation "$absent" "$absent" "$absent" "$absent" '{"status":"skipped","reason":"felt_like_it"}' "$skipped")"   UNKNOWN '[]' false false
assert_decision "only a digest object may be skipped"   "$(observation '{"status":"skipped","reason":"no_claimed_digest"}' "$absent" "$absent" "$absent" "$skipped" "$skipped")"   UNKNOWN '[]' false false

echo
echo "== UNKNOWN outranks everything and proposes nothing"
error_lookup() { printf '{"status":"error","code":%s,"queriedRef":"ghcr.io/owner/name:sha-x"}' "$1"; }
for code in 408 429 500 502 503 504; do
  assert_decision "code $code is retryable" \
    "$(observation "$(error_lookup "$code")" "$absent" "$absent" "$absent")" \
    UNKNOWN '[]' false true
done
# Not only the four common ones. Enumerating 500/502/503/504 left 501 and 507 failing immediately
# when they are exactly as worth one more attempt.
for code in 501 507; do
  assert_decision "code $code is retryable as well" \
    "$(observation "$(error_lookup "$code")" "$absent" "$absent" "$absent")" \
    UNKNOWN '[]' false true
done
for code in 401 403 404; do
  assert_decision "code $code is not retryable" \
    "$(observation "$(error_lookup "$code")" "$absent" "$absent" "$absent")" \
    UNKNOWN '[]' false false
done
assert_decision "cleanup debt survives an unknown" \
  "$(observation "$(error_lookup 503)" "$absent" "$absent" "$absent" "" "" "$(present "$MONO")")" \
  UNKNOWN '[]' true true
assert_decision "an error outranks an otherwise complete release" \
  "$(observation "$(marker)" "$(marker)" "$(present "$MONO")" "$(error_lookup 500)")" \
  UNKNOWN '[]' false true
for bad_digest in '""' '"sha256:abc"' '"sha256:'"$(printf 'z%.0s' {1..64})"'"' '"1111"'; do
  assert_decision "a malformed tag digest is not a digest: $bad_digest" \
    "$(observation "$absent" "$(marker)" "{\"status\":\"present\",\"digest\":$bad_digest}" "$absent")" \
    UNKNOWN '[]' false false
done
assert_decision "an unrecognised status is not a status" \
  "$(observation '{"status":"probably"}' "$absent" "$absent" "$absent")" \
  UNKNOWN '[]' false false

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
