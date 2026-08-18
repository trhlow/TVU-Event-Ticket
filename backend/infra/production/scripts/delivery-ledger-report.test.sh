#!/usr/bin/env bash
# Runs delivery-ledger-report.sql against a real PostgreSQL carrying the real migrations.
#
# Not a stub and not a copy of the queries: the file the production host executes is the file this
# feeds to psql. A report is the kind of thing that fails by returning nothing -- a typo in a join
# condition, a column renamed by a later migration, an outer join that quietly became an inner one
# -- and every one of those looks exactly like "all clear" to whoever reads the output.
#
# So each section is given a row it MUST find and a row it must NOT: section 4 gets both a student
# whose email never arrived and a student whose did, and passes only if it reports the first and
# stays silent about the second.
#
# Needs Docker. Says so loudly and fails rather than skipping, because a green skip is how a report
# nobody has run gets mistaken for a report that found nothing.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$here/../../../.." && pwd)"
migrations="$repo_root/backend/monolith/src/main/resources/db/migration"
report_sql="$here/delivery-ledger-report.sql"

passed=0
failed=0
report() {
  if [[ "$2" == "ok" ]]; then
    passed=$((passed + 1)); echo "ok    $1"
  else
    failed=$((failed + 1)); echo "FAIL  $1: $3"
  fi
}

if ! docker info >/dev/null 2>&1; then
  echo "FAIL  Docker is not available, so none of the report's SQL was executed." >&2
  echo "      This suite does not skip: an unrun report is indistinguishable from a clean one." >&2
  exit 1
fi
[[ -d "$migrations" ]] || { echo "FAIL  migrations not found at $migrations" >&2; exit 1; }
[[ -f "$report_sql" ]] || { echo "FAIL  $report_sql not found" >&2; exit 1; }

# A name of our own, removed by name on exit. Never a machine-wide sweep by image: a previous
# version of another suite in this repository killed a registry a concurrent job was pushing to,
# and the resulting "connection refused" read exactly like a flaky test.
container="tvu-ledger-report-test-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting $container ..."
docker run -d --name "$container" \
  -e POSTGRES_DB=ledger_test -e POSTGRES_USER=ledger_owner -e POSTGRES_PASSWORD=ledger_pw \
  postgres:18.4-alpine >/dev/null || { echo "FAIL  could not start postgres" >&2; exit 1; }

psql_in() { docker exec -i "$container" psql -U ledger_owner -d ledger_test -v ON_ERROR_STOP=1 "$@"; }

ready=""
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -U ledger_owner -d ledger_test >/dev/null 2>&1; then
    ready=yes; break
  fi
  sleep 1
done
[[ -n "$ready" ]] || { echo "FAIL  postgres never became ready" >&2; exit 1; }

# Version-sorted, not lexicographically: V10 sorts before V2 as a string, and applying the
# migrations in that order fails on a table that does not exist yet.
mapfile -t files < <(cd "$migrations" && ls -1 V*.sql | sed 's/^V//' | sort -V | sed 's/^/V/')
[[ ${#files[@]} -gt 0 ]] || { echo "FAIL  no migrations matched" >&2; exit 1; }
for f in "${files[@]}"; do
  psql_in -q <"$migrations/$f" >/dev/null 2>"/tmp/mig.$$.err" || {
    echo "FAIL  migration $f did not apply: $(tail -2 "/tmp/mig.$$.err")" >&2
    rm -f "/tmp/mig.$$.err"; exit 1
  }
done
rm -f "/tmp/mig.$$.err"
echo "Applied ${#files[@]} migration(s)."

# Flyway's own bookkeeping, which section 4 reads to find out when the ledger started existing.
# Applying the migrations by hand above does not create it; production always has it, because the
# application runs Flyway. Built here with the real column set rather than an invented one, and
# stamped before the fixtures so the cutoff falls where a real V15 install would put it.
psql_in -q >/dev/null <<'SQL'
CREATE TABLE flyway_schema_history (
    installed_rank INTEGER PRIMARY KEY,
    version VARCHAR(50),
    description VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL,
    script VARCHAR(1000) NOT NULL,
    checksum INTEGER,
    installed_by VARCHAR(100) NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT now(),
    execution_time INTEGER NOT NULL,
    success BOOLEAN NOT NULL
);
INSERT INTO flyway_schema_history
  (installed_rank, version, description, type, script, installed_by, installed_on, execution_time, success)
VALUES (15, '15', 'notification delivery ledger', 'SQL',
        'V15__notification_delivery_ledger.sql', 'ledger_owner', now() - interval '1 day', 12, true);
SQL
[[ $? -eq 0 ]] || { echo "FAIL  could not build flyway_schema_history" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Fixtures. Each section gets a row it must find and a row it must not.
# ---------------------------------------------------------------------------
psql_in -q >/dev/null <<'SQL'
-- Identifiable literals: an assertion matching 'test' would match half the output.
\set ev   '11111111-1111-1111-1111-111111111111'
\set club '22222222-2222-2222-2222-222222222222'

-- V7 gave reservations and tickets real foreign keys to events, clubs and users, so the parents
-- have to exist. That is a feature of this fixture, not an obstacle: it means the report is being
-- tested against the shape of data production can actually hold.
INSERT INTO clubs (id, name) VALUES (:'club', 'Drill Club');
INSERT INTO users (id, ext_subject, email, display_name, mssv, role, auth_method)
SELECT ('dddddddd-0000-0000-0000-00000000000' || n)::uuid,
       'ext-' || n, 'student' || n || '@student.tvu', 'Student ' || n, 'MSSV' || n, 'SINH_VIEN', 'MICROSOFT'
  FROM generate_series(1, 6) AS n;
INSERT INTO events (id, club_id, title, capacity, reg_open_at, reg_close_at, start_at, end_at,
                    location, status, created_by, created_at, updated_at)
VALUES (:'ev', :'club', 'Drill Event', 100,
        now() - interval '10 days', now() - interval '1 day',
        now() + interval '1 day', now() + interval '2 days',
        'Hall A', 'OPEN', 'dddddddd-0000-0000-0000-000000000001', now(), now());

-- The five reservations, one per outcome under test.
INSERT INTO reservations (id, event_id, club_id, student_id, student_email, student_mssv, status,
                          idempotency_key, requested_at, reviewed_at, event_title, event_start_at,
                          event_end_at, event_location)
VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000001',
  'unknown-fate@student.tvu', 'MSSV-UNKNOWN', 'APPROVED', 'k1', now() - interval '3 hours',
  now() - interval '2 hours', 'Workshop Unknown', now() + interval '1 day', now() + interval '1 day', 'A1'),
 ('aaaaaaaa-0000-0000-0000-000000000002', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000002',
  'delivered-fine@student.tvu', 'MSSV-OK', 'APPROVED', 'k2', now() - interval '3 hours',
  now() - interval '2 hours', 'Workshop Delivered', now() + interval '1 day', now() + interval '1 day', 'A2'),
 ('aaaaaaaa-0000-0000-0000-000000000003', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000003',
  'sent-on-retry@student.tvu', 'MSSV-RETRY', 'APPROVED', 'k3', now() - interval '3 hours',
  now() - interval '2 hours', 'Workshop Retry', now() + interval '1 day', now() + interval '1 day', 'A3'),
 ('aaaaaaaa-0000-0000-0000-000000000004', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000004',
  'never-mailed@student.tvu', 'MSSV-SILENT', 'APPROVED', 'k4', now() - interval '3 hours',
  now() - interval '1 hour', 'Workshop Silent', now() + interval '1 day', now() + interval '1 day', 'A4'),
 -- Rejected, so it has no ticket and must never appear anywhere in the report.
 ('aaaaaaaa-0000-0000-0000-000000000005', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000005',
  'rejected-person@student.tvu', 'MSSV-REJECTED', 'REJECTED', 'k5', now() - interval '3 hours',
  now() - interval '2 hours', 'Workshop Rejected', now() + interval '1 day', now() + interval '1 day', 'A5'),
 -- Approved and ticketed two days ago, before the V15 migration was installed a day ago. It has no
 -- ledger row and never could have had one, so reporting it would be reporting history the ledger
 -- was never present for. The other half of the cutoff: section 4 has to draw the line, not just
 -- draw it late.
 ('aaaaaaaa-0000-0000-0000-000000000006', :'ev', :'club', 'dddddddd-0000-0000-0000-000000000006',
  'before-the-ledger@student.tvu', 'MSSV-ANCIENT', 'APPROVED', 'k6', now() - interval '3 days',
  now() - interval '2 days', 'Workshop Ancient', now() + interval '1 day', now() + interval '1 day', 'A6');

INSERT INTO tickets (id, reservation_id, event_id, club_id, student_id, status, issued_at)
SELECT gen_random_uuid(), r.id, r.event_id, r.club_id, r.student_id, 'VALID', r.reviewed_at
  FROM reservations r WHERE r.status = 'APPROVED';

INSERT INTO outbox_messages (id, message_id, aggregate_type, aggregate_id, routing_key, payload,
                             status, attempts, created_at, sent_at)
VALUES
 (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'reservation',
  'aaaaaaaa-0000-0000-0000-000000000001', 'reservation.approved', '{}', 'SENT', 1, now(), now()),
 (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000002', 'reservation',
  'aaaaaaaa-0000-0000-0000-000000000002', 'reservation.approved', '{}', 'SENT', 1, now(), now()),
 (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000003', 'reservation',
  'aaaaaaaa-0000-0000-0000-000000000003', 'reservation.approved', '{}', 'SENT', 2, now(), now());
-- Reservation 4 gets NO outbox row at all: approved, ticketed, nothing ever queued. The worst case
-- and the one section 4 exists for.

INSERT INTO notification_delivery_ledger
  (message_id, status, attempt_id, attempt_no, started_at, lease_until, concluded_at, last_error)
VALUES
 ('cccccccc-0000-0000-0000-000000000001', 'UNKNOWN', gen_random_uuid(), 1,
  now() - interval '2 hours', now() - interval '110 minutes', now() - interval '100 minutes',
  'worker vanished mid-send'),
 ('cccccccc-0000-0000-0000-000000000002', 'DELIVERED', gen_random_uuid(), 1,
  now() - interval '2 hours', now() - interval '110 minutes', now() - interval '119 minutes', NULL),
 ('cccccccc-0000-0000-0000-000000000003', 'DELIVERED', gen_random_uuid(), 3,
  now() - interval '2 hours', now() - interval '110 minutes', now() - interval '118 minutes', NULL),
 -- An abandoned claim the reconciler has not swept: still PROCESSING, lease long expired.
 ('cccccccc-0000-0000-0000-000000000009', 'PROCESSING', gen_random_uuid(), 1,
  now() - interval '30 minutes', now() - interval '20 minutes', NULL, NULL);
SQL
[[ $? -eq 0 ]] || { echo "FAIL  fixtures did not load" >&2; exit 1; }

out="$(psql_in <"$report_sql" 2>&1)"
run_status=$?

if [[ $run_status -ne 0 ]]; then
  echo "FAIL  the report itself errored:"
  printf '%s\n' "$out" | tail -15
  exit 1
fi
report "the report runs against the real schema without error" ok

section() {
  # Text between one '== N.' banner and the next, so a row found in the wrong section fails.
  printf '%s\n' "$out" | awk -v n="== $1\\\\." '
    $0 ~ n {grab=1; next}
    /^== [0-9]+\./ {grab=0}
    grab {print}'
}

must_show()   { grep -q -- "$2" <<<"$(section "$1")"; }

must_show 1 "unknown-fate@student.tvu" \
  && report "section 1 names the student behind an UNKNOWN delivery, not just a message_id" ok \
  || report "section 1 names the student behind an UNKNOWN delivery, not just a message_id" fail \
       "the UNKNOWN row is missing or the join to reservations returned nothing"

must_show 1 "delivered-fine@student.tvu" \
  && report "section 1 does not drag in deliveries that concluded fine" fail "a DELIVERED row was listed as UNKNOWN" \
  || report "section 1 does not drag in deliveries that concluded fine" ok

must_show 2 "cccccccc-0000-0000-0000-000000000009" \
  && report "section 2 catches a claim whose lease expired without the reconciler sweeping it" ok \
  || report "section 2 catches a claim whose lease expired without the reconciler sweeping it" fail \
       "an expired PROCESSING row went unreported, so a dead scheduler would look healthy"

must_show 3 "sent-on-retry@student.tvu" \
  && report "section 3 flags a delivery that only succeeded on a later attempt" ok \
  || report "section 3 flags a delivery that only succeeded on a later attempt" fail "attempt_no > 1 row missing"

must_show 3 "delivered-fine@student.tvu" \
  && report "section 3 leaves first-attempt deliveries alone" fail "a clean attempt_no=1 delivery was flagged as a duplicate risk" \
  || report "section 3 leaves first-attempt deliveries alone" ok

# The section this whole report is for. No email means no QR, and there is no second way to get one.
must_show 4 "never-mailed@student.tvu" \
  && report "section 4 finds an approved, ticketed student whose email was never even queued" ok \
  || report "section 4 finds an approved, ticketed student whose email was never even queued" fail \
       "a student holding a ticket and no QR code was reported as fine"

must_show 4 "unknown-fate@student.tvu" \
  && report "section 4 also surfaces the ticket whose delivery is UNKNOWN" ok \
  || report "section 4 also surfaces the ticket whose delivery is UNKNOWN" fail \
       "only DELIVERED counts as delivered; UNKNOWN must not pass as one"

must_show 4 "delivered-fine@student.tvu" \
  && report "section 4 stays silent about students who did receive their ticket" fail \
       "a DELIVERED ticket was reported as undelivered; on a healthy system this report would cry wolf" \
  || report "section 4 stays silent about students who did receive their ticket" ok

must_show 4 "before-the-ledger@student.tvu"   && report "section 4 ignores tickets issued before the ledger existed" fail        "a reservation approved before V15 was reported as undelivered; every historical ticket would be flagged"   || report "section 4 ignores tickets issued before the ledger existed" ok

grep -q "rejected-person@student.tvu" <<<"$out" \
  && report "a rejected reservation appears nowhere in the report" fail "it has no ticket and nothing was ever sent" \
  || report "a rejected reservation appears nowhere in the report" ok

# 1 UNKNOWN + 1 expired PROCESSING + 2 in section 4 (never-mailed, unknown-fate) = 4.
verdict="$(printf '%s' "$out" | tr -d '\r' | sed -n 's/^NEEDS_ATTENTION=\([0-9]\{1,\}\)$/\1/p' | tail -1)"
if [[ "$verdict" == "4" ]]; then
  report "the gate counts exactly the rows a person must act on" ok
else
  report "the gate counts exactly the rows a person must act on" fail \
    "NEEDS_ATTENTION was '${verdict:-absent}', expected 4; the exit status would disagree with the printed report"
fi

# And on a clean ledger it must say so, rather than finding problems in an empty database.
psql_in -q >/dev/null 2>&1 <<'SQL'
-- Resolve rather than delete. Deleting the UNKNOWN row would leave its reservation with no ledger
-- entry at all, which section 4 correctly reports -- and the suite would then be asserting that a
-- ticket with no record of delivery is "healthy". Exactly the outcome this report exists to refuse.
DELETE FROM notification_delivery_ledger WHERE message_id = 'cccccccc-0000-0000-0000-000000000009';
UPDATE notification_delivery_ledger SET status = 'DELIVERED', concluded_at = coalesce(concluded_at, now());
INSERT INTO outbox_messages (id, message_id, aggregate_type, aggregate_id, routing_key, payload,
                             status, attempts, created_at, sent_at)
VALUES (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000004', 'reservation',
        'aaaaaaaa-0000-0000-0000-000000000004', 'reservation.approved', '{}', 'SENT', 1, now(), now());
INSERT INTO notification_delivery_ledger
  (message_id, status, attempt_id, attempt_no, started_at, lease_until, concluded_at)
VALUES ('cccccccc-0000-0000-0000-000000000004', 'DELIVERED', gen_random_uuid(), 1,
        now() - interval '2 hours', now() - interval '110 minutes', now() - interval '119 minutes');
SQL
clean_out="$(psql_in <"$report_sql" 2>&1)"
clean_verdict="$(printf '%s' "$clean_out" | tr -d '\r' | sed -n 's/^NEEDS_ATTENTION=\([0-9]\{1,\}\)$/\1/p' | tail -1)"
if [[ "$clean_verdict" == "0" ]]; then
  report "a healthy ledger reports nothing to act on" ok
else
  report "a healthy ledger reports nothing to act on" fail \
    "NEEDS_ATTENTION was '${clean_verdict:-absent}' with every delivery accounted for; a report that always finds something gets ignored"
fi

echo ""
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
