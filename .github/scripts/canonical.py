"""The one canonical form, and the one strict reader.

Deliberately NOT RFC 8785 (JCS). The Flyway inventory checksums in the fixtures were computed with
Python's sorted, compact dump, and JCS escapes strings and formats numbers differently, so adopting
it would invalidate every checksum that already exists. What matters here is that exactly one form
exists and that every parameter of it is pinned -- not that it matches a standard nothing else in
this pipeline reads.

Writing `json.dumps(value, sort_keys=True, separators=(",", ":"))` is not enough on its own:
ensure_ascii defaults to True (so it must be stated, not inherited), allow_nan defaults to True (so
NaN and Infinity would be emitted as tokens no other parser accepts), and json.loads silently keeps
the last of duplicate keys (which is how a later "absent" hides an earlier "error").
"""
import json

__all__ = ["canonical_bytes", "strict_loads"]


def _no_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate key {key!r}")
        seen[key] = value
    return seen


def _forbid_float(text):
    raise ValueError(f"{text} is a float; the canonical form admits integers only, because no two "
                     f"runtimes agree on how to write a float")


def _forbid_constant(name):
    raise ValueError(f"{name} is not JSON")


def _reject_floats(value, where="<root>"):
    # A caller may build a dict in Python rather than read one, so the reader's guard is not enough.
    if isinstance(value, float):
        raise ValueError(f"{where} is a float; the canonical form admits integers only")
    if isinstance(value, dict):
        for key, item in value.items():
            _reject_floats(item, f"{where}.{key}")
    # tuple as well as list: json.dumps writes both as arrays, so a tuple reaches the canonical
    # bytes exactly like a list and has to be walked exactly like one. Walking only lists let a
    # float through the guard whose whole purpose is that a Python-built document is not a parsed
    # one -- and a Python-built document is where tuples come from.
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _reject_floats(item, f"{where}[{index}]")


def strict_loads(text):
    """Parse, refusing everything the canonical form cannot round-trip."""
    # U+FEFF. It is invisible here, which is the point: a reader that does not refuse it passes it
    # into the parser, where it is a syntax error nobody can see in the input either.
    if text.startswith("﻿"):
        raise ValueError("input starts with a BOM; the canonical form has none")
    return json.loads(text, object_pairs_hook=_no_duplicates,
                      parse_float=_forbid_float, parse_constant=_forbid_constant)


def canonical_bytes(value):
    """The bytes. UTF-8, no BOM, no trailing newline, sorted keys, no whitespace, ASCII-escaped."""
    _reject_floats(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("utf-8")
