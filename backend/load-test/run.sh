#!/usr/bin/env bash
# One command: bring the stack up, seed the fixture, hammer approvals, reconcile the result.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$HERE/../infra"
BASE="${BASE_URL:-http://localhost:8080}"

# Everything below reads/writes .seed.json and results.json via RELATIVE paths after cd'ing into $HERE.
# On Windows/Git Bash, node's require() cannot resolve a Git Bash-style absolute path like
# /d/TVU-Event-Ticket/backend/load-test/.seed.json -- it needs a Windows path or (simplest) a relative
# one, so every `node -e` below runs with $HERE as its cwd instead of interpolating $HERE into the require.
cd "$HERE"

echo "==> bringing the stack up"
docker compose -f "$INFRA/docker-compose.app.yml" up -d --build --wait

echo "==> seeding the fixture"
node seed.mjs

EVENT=$(node -e "console.log(require('./.seed.json').eventId)")
CAPACITY=$(node -e "console.log(require('./.seed.json').capacity)")
TOTAL=$(node -e "console.log(require('./.seed.json').reservationIds.length)")

echo "==> before: $(curl -s "$BASE/api/ticketing/events/$EVENT/availability")"

echo "==> running k6 ($TOTAL concurrent approvals against capacity $CAPACITY, direct to ticket-service:8082)"
# The approval hammer bypasses the gateway on purpose (see approval-capacity.js) -- the gateway's
# per-principal rate limiter would otherwise serialize all 500 approvals into a slow trickle and mask
# whether ticket-service's own Redis-DECR + DB-transaction pairing is race-free under real concurrency.
# MSYS_NO_PATHCONV=1: Git Bash rewrites the -v host:container mount and -w path as if they were Windows
# paths, mangling both sides of the docker bind mount. Disabling that conversion, plus using $PWD (already
# cd'ed into $HERE) instead of re-interpolating $HERE, gets the k6 container an actual working mount.
K6_FAILED=0
MSYS_NO_PATHCONV=1 docker run --rm -i \
  -v "$PWD:/scripts" -w /scripts \
  --add-host=host.docker.internal:host-gateway \
  grafana/k6 run --summary-export=/scripts/results.json approval-capacity.js || K6_FAILED=1

AFTER=$(curl -s "$BASE/api/ticketing/events/$EVENT/availability") || true
echo "==> after: $AFTER"

FAILED=0
APPROVED_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).approvedCount)" "$AFTER" 2>/dev/null) || { echo "FAIL: could not parse the 'after' availability response: $AFTER"; FAILED=1; APPROVED_COUNT=""; }
REMAINING=$(node -e "console.log(JSON.parse(process.argv[1]).remaining)" "$AFTER" 2>/dev/null) || { echo "FAIL: could not parse the 'after' availability response: $AFTER"; FAILED=1; REMAINING=""; }

echo
echo "==> verdict (database counters)"
if [ -n "$APPROVED_COUNT" ]; then
  [ "$APPROVED_COUNT" -eq "$CAPACITY" ] || { echo "FAIL: approvedCount=$APPROVED_COUNT, expected exactly $CAPACITY (OVERBOOKING or under-issue)"; FAILED=1; }
fi
if [ -n "$REMAINING" ]; then
  [ "$REMAINING" -eq 0 ] || { echo "FAIL: remaining=$REMAINING, expected 0"; FAILED=1; }
  [ "$REMAINING" -ge 0 ] || { echo "FAIL: remaining is negative"; FAILED=1; }
fi
[ "$K6_FAILED" -eq 0 ] || { echo "FAIL: k6 exited non-zero (a threshold was breached -- see its summary above)"; FAILED=1; }
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: exactly $CAPACITY tickets issued, remaining 0, no overbooking."
fi

echo
echo "==> reconciling k6 counters (must total $TOTAL)"
node -e "
const r = require('./results.json');
const ok = r.metrics.approvals_succeeded?.count ?? 0;
const sold = r.metrics.approvals_sold_out?.count ?? 0;
const limited = r.metrics.approvals_rate_limited?.count ?? 0;
const bad = r.metrics.approvals_unexpected_status?.count ?? 0;
const total = ok + sold + limited + bad;
console.log('approved=' + ok, 'soldOut=' + sold, 'rateLimited=' + limited, 'unexpected=' + bad, 'total=' + total);
if (total !== $TOTAL) {
  console.log('FAIL: k6 counters total ' + total + ', expected exactly $TOTAL -- requests vanished, do not round this into agreement.');
  process.exitCode = 1;
}
if (bad > 0) {
  console.log('FAIL: ' + bad + ' request(s) resolved with an unexpected (non-200/409/429) status.');
  process.exitCode = 1;
}
" || FAILED=1

exit "$FAILED"
