#!/usr/bin/env bash
# The envelope builder, pinned against values computed by hand once. If canonical_bytes changes, the
# digests below change with it and this suite is the first thing that says so.
set -uo pipefail
cd "$(dirname "$0")"
source "./python-bin.sh"

passed=0; failed=0
check() {
  local name="$1" want="$2" got
  got="$("$PYTHON" -c "$3" 2>&1)"
  if [[ "$got" == "$want" ]]; then echo "ok    $name"; ((passed++))
  else echo "FAIL  $name"; echo "      wanted: $want"; echo "      got:    $got"; ((failed++)); fi
}

check "an empty payload gives a one-layer manifest" "1" '
import envelope, json
print(len(envelope.envelope_for({})["layers"]))'

check "the layer digest is the digest of the canonical payload" \
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" '
import envelope
print(envelope.envelope_for({})["layers"][0]["digest"])'

check "the layer size is the length of the canonical payload" "2" '
import envelope
print(envelope.envelope_for({})["layers"][0]["size"])'

check "the config descriptor carries exactly four fields" \
  "data,digest,mediaType,size" '
import envelope
print(",".join(sorted(envelope.envelope_for({})["config"])))'

check "no annotations key at any of the three levels" "True" '
import envelope
e = envelope.envelope_for({})
print("annotations" not in e and "annotations" not in e["config"]
      and "annotations" not in e["layers"][0])'

check "no subject key" "True" '
import envelope
print("subject" not in envelope.envelope_for({}))'

check "marker_digest hashes the canonical form of the manifest" "True" '
import envelope, hashlib
from canonical import canonical_bytes
e = envelope.envelope_for({"a": 1})
print(envelope.marker_digest(e)
      == "sha256:" + hashlib.sha256(canonical_bytes(e)).hexdigest())'

check "a different payload gives a different marker digest" "True" '
import envelope
print(envelope.marker_digest(envelope.envelope_for({"a": 1}))
      != envelope.marker_digest(envelope.envelope_for({"a": 2})))'

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
