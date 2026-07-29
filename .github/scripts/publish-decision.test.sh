#!/usr/bin/env bash
# Tests for publish-decision.sh, one per row of the agreed state table plus the ways each
# classification can be reached wrongly.
#
# The invariant under test throughout: without a trustworthy prepared marker there is no
# self-recoverable PARTIAL. Every case that reaches PARTIAL has one; every case that lacks one and
# still finds objects in the registry is CONFLICT, not partial.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
subject="$script_dir/publish-decision.sh"

passed=0
failed=0

SHA=0123456789abcdef0123456789abcdef01234567
MONO=sha256:1111111111111111111111111111111111111111111111111111111111111111
FRONT=sha256:2222222222222222222222222222222222222222222222222222222222222222
OTHER=sha256:9999999999999999999999999999999999999999999999999999999999999999
FP=fea7afe794dacc6140c57ac4d8406f6ff97eb763c279c679f8fb89fcfa0f9477

# observation <lookups-json>
observation() {
  cat <<EOF
{
  "commit": "$SHA",
  "environment": "production",
  "expected": {"repository": "owner/name", "frontendConfigFingerprint": "$FP"},
  "lookups": $1
}
EOF
}

# marker [overrides-json]
marker() {
  python3 - "${1:-{\}}" <<PYTHON
import json, sys
base = {
  "status": "present",
  "attested": True,
  "attestedRepository": "owner/name",
  "content": {
    "commit": "$SHA",
    "environment": "production",
    "frontendConfigFingerprint": "$FP",
    "images": {"monolith": "$MONO", "frontend": "$FRONT"},
    "flywayInventoryFor": "$MONO",
    "evidence": {"sbom": "sha256:aa", "vulnerabilityScan": "sha256:bb"}
  }
}
override = json.loads(sys.argv[1])
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
merge(base, override)
print(json.dumps(base))
PYTHON
}

# expect <name> <lookups-json> <field> <wanted>
expect() {
  local name="$1" lookups="$2" field="$3" want="$4" got
  got="$(observation "$lookups" | bash "$subject" 2>&1 \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['$field'])" 2>/dev/null)" || got="<unparseable>"
  if [[ "$got" == "$want" ]]; then
    echo "ok    $name"
    ((passed++))
  else
    echo "FAIL  $name: $field is '$got', wanted '$want'"
    echo "      decision: $(observation "$lookups" | bash "$subject" 2>&1)"
    ((failed++))
  fi
}

absent='{"status":"absent"}'
present_mono="{\"status\":\"present\",\"digest\":\"$MONO\"}"
present_front="{\"status\":\"present\",\"digest\":\"$FRONT\"}"

echo "== ABSENT"
expect "nothing published at all" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state ABSENT
expect "an orphan candidate does not make a release exist" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent,\"monolithCandidate\":$present_mono}" \
  state ABSENT
expect "the orphan candidate is reported as debt" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent,\"monolithCandidate\":$present_mono}" \
  cleanupDebt True

echo
echo "== PARTIAL, only with a trustworthy prepared marker"
expect "prepared marker, both tags missing" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state PARTIAL
expect "prepared marker, one tag missing" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$absent}" \
  state PARTIAL
expect "both tags right, final marker missing" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state PARTIAL
expect "resuming never rebuilds" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$absent}" \
  actions "['promote_frontend_tag', 'publish_final_marker']"

echo
echo "== COMPLETE"
expect "final marker and both tags agree" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state COMPLETE

echo
echo "== CONFLICT"
expect "official tag with nothing to anchor it" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$absent,\"monolithTag\":$present_mono,\"frontendTag\":$absent}" \
  state CONFLICT
expect "tag points at a digest the prepared marker does not record" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":{\"status\":\"present\",\"digest\":\"$OTHER\"},\"frontendTag\":$absent}" \
  state CONFLICT
expect "final marker present but a tag is missing" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$absent}" \
  state CONFLICT
expect "final marker disagrees with the tag" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":{\"status\":\"present\",\"digest\":\"$OTHER\"},\"frontendTag\":$present_front}" \
  state CONFLICT

echo
echo "== a marker that cannot be trusted is not a marker"
expect "unattested" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"attested":false}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "attested to a different repository" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"attestedRepository":"someone/else"}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "records a different commit" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"content":{"commit":"ffffffffffffffffffffffffffffffffffffffff"}}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "records a different environment" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"content":{"environment":"staging"}}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "records a different frontend fingerprint" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"content":{"frontendConfigFingerprint":"deadbeef"}}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "Flyway inventory bound to a different image" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker "{\"content\":{\"flywayInventoryFor\":\"$OTHER\"}}"),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "missing SBOM evidence" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"content":{"evidence":{"sbom":""}}}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT
expect "missing scan evidence" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker '{"content":{"evidence":{"vulnerabilityScan":""}}}'),\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state CONFLICT


# A final marker is the document everything downstream trusts, so it has to be verified rather than
# believed. These cases exist because mutation testing found none: removing the trustworthiness
# check on the final marker left every other test green, since they all put the untrustworthy
# marker in the prepared slot.
echo
echo "== an untrustworthy final marker is a conflict, not a complete release"
expect "final marker unattested" \
  "{\"finalMarker\":$(marker '{"attested":false}'),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state CONFLICT
expect "final marker attested to a different repository" \
  "{\"finalMarker\":$(marker '{"attestedRepository":"someone/else"}'),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state CONFLICT
expect "final marker records a different commit" \
  "{\"finalMarker\":$(marker '{"content":{"commit":"ffffffffffffffffffffffffffffffffffffffff"}}'),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state CONFLICT
expect "final marker missing scan evidence" \
  "{\"finalMarker\":$(marker '{"content":{"evidence":{"vulnerabilityScan":""}}}'),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state CONFLICT
expect "final marker Flyway inventory bound elsewhere" \
  "{\"finalMarker\":$(marker "{\"content\":{\"flywayInventoryFor\":\"$OTHER\"}}"),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front}" \
  state CONFLICT

echo
echo "== UNKNOWN outranks everything, and proposes nothing"
for code in 408 429 500 502 503 504; do
  expect "code $code is retryable" \
    "{\"finalMarker\":{\"status\":\"error\",\"code\":$code},\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent}" \
    retryable True
done
for code in 401 403; do
  expect "code $code is not retryable" \
    "{\"finalMarker\":{\"status\":\"error\",\"code\":$code},\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent}" \
    retryable False
done
expect "an unreadable lookup proposes no actions" \
  "{\"finalMarker\":{\"status\":\"error\",\"code\":503},\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  actions "[]"
expect "an error outranks an otherwise complete release" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":{\"status\":\"error\",\"code\":500}}" \
  state UNKNOWN
expect "a malformed digest is not a digest" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":{\"status\":\"present\",\"digest\":\"\"},\"frontendTag\":$absent}" \
  state UNKNOWN
expect "a truncated digest is not a digest" \
  "{\"finalMarker\":$absent,\"preparedMarker\":$(marker),\"monolithTag\":{\"status\":\"present\",\"digest\":\"sha256:abc\"},\"frontendTag\":$absent}" \
  state UNKNOWN
expect "an unrecognised status is not a status" \
  "{\"finalMarker\":{\"status\":\"probably\"},\"preparedMarker\":$absent,\"monolithTag\":$absent,\"frontendTag\":$absent}" \
  state UNKNOWN

echo
echo "== cleanup debt never invalidates a release"
expect "complete release with a leftover candidate stays COMPLETE" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front,\"frontendCandidate\":$present_front}" \
  state COMPLETE
expect "and reports the debt" \
  "{\"finalMarker\":$(marker),\"preparedMarker\":$(marker),\"monolithTag\":$present_mono,\"frontendTag\":$present_front,\"frontendCandidate\":$present_front}" \
  cleanupDebt True

echo
echo "== malformed input is not a state"
got="$(printf 'not json' | bash "$subject" | python3 -c "import json,sys; print(json.load(sys.stdin)['state'])")"
if [[ "$got" == UNKNOWN ]]; then
  echo "ok    unparseable observation"
  ((passed++))
else
  echo "FAIL  unparseable observation: got '$got'"
  ((failed++))
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
