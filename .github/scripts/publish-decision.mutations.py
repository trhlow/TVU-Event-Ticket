import sys
s = open('publish-decision.sh').read(); m = sys.argv[1]
M = {
 'conflictacts': ('return decision("CONFLICT", [], reason, cleanup_debt)', 'return decision("CONFLICT", ["build_new"], reason, cleanup_debt)'),
 'schemaint':    ('require(type(value) is int, f"{where} must be an integer, got {value!r}")', 'require(isinstance(value, (int, float)), "x")'),
 'fullmatch':    ('pattern.fullmatch(value)', 'pattern.match(value)'),
 'absent404':    ('require(exact_int(lookup.get("observedCode"), f"lookups.{name}.observedCode") == 404,', 'require(True,'),
 'fieldset':     ('require(present_fields <= allowed_fields,', 'require(True or present_fields <= allowed_fields,'),
 'markerdigest': ('if final["markerDigest"] != prepared["markerDigest"]:', 'if False:'),
 'completeobj':  ('        problem = missing_or_mismatched(objects, claimed, "digest object")\n        if problem:\n            return conflict(problem, cleanup_debt)\n        problem = missing_or_mismatched(tags, claimed, "tag")', '        problem = missing_or_mismatched(tags, claimed, "tag")'),
 'inventory':    ('if type(record) is not dict:', 'if False and type(record) is not dict:'),
 'checksum':     ('if inventory.get("checksum") != computed:', 'if False:'),
 'verification': ('if verification.get("policyPassed") is not True:', 'if False:'),
 'retry5xx':     ('or (type(code) is int and 500 <= code <= 599)', ''),
 'debtunknown':  ('return unknown(f"{name}: lookup failed with code={code}", retryable, cleanup_debt)', 'return unknown(f"{name}: lookup failed with code={code}", retryable)'),
}
old, new = M[m]
assert old in s, m
open('publish-decision.sh','w').write(s.replace(old, new, 1))
