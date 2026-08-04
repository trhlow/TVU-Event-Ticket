"""Rewrite every fixture's ociEnvelope and markerDigest from its own content.

Run by hand after any change to a fixture's marker content, then commit the result. Idempotent: a
second run on an unchanged tree writes nothing.

The placeholder digests these replace were all sha256:3333... -- fifteen markers naming one object.
Once the decision recomputes the digest, a shared placeholder is simply wrong, and each marker's
digest becomes a fact about its own payload.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from envelope import envelope_for, marker_digest

FIXTURES = pathlib.Path(__file__).parents[1] / "contracts" / "fixtures"


def refresh(marker):
    """True if this marker changed. A marker with no content cannot have a derived envelope."""
    if "content" not in marker:
        return False
    raw = envelope_for(marker["content"])
    digest = marker_digest(raw)
    before = (marker.get("ociEnvelope"), marker.get("markerDigest"))
    marker["ociEnvelope"] = {"digestVerified": True, "sizeVerified": True,
                            "parsed": True, "raw": raw}
    marker["markerDigest"] = digest
    # Only where it was already the marker's own digest. A fixture whose whole subject is a
    # subjectDigest that does NOT name its marker -- the collector verified one thing and the
    # registry holds another -- would otherwise be healed by the next regeneration, and the rule it
    # witnesses would lose its only witness without anyone editing the case.
    verification = marker.get("verification")
    if isinstance(verification, dict) and verification.get("subjectDigest") == before[1]:
        verification["subjectDigest"] = digest
    return before != (marker["ociEnvelope"], marker["markerDigest"])


def main():
    changed = []
    for path in sorted(FIXTURES.rglob("*.json")):
        if path.name == "expectations.json":
            continue
        obs = json.loads(path.read_text(encoding="utf-8"))
        touched = False
        for lookup in obs.get("lookups", {}).values():
            if isinstance(lookup, dict) and lookup.get("status") == "present" \
                    and "markerDigest" in lookup:
                touched |= refresh(lookup)
        if touched:
            path.write_text(json.dumps(obs, indent=2) + "\n", encoding="utf-8", newline="\n")
            changed.append(path.name)
    print(f"rewrote {len(changed)} fixtures" + ("" if not changed else ": " + ", ".join(changed)))


if __name__ == "__main__":
    main()
