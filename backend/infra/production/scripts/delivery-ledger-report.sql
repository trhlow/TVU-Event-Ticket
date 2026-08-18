-- The delivery ledger, read from the operator's side. Read-only: nothing here writes.
--
-- OPERATIONS.md already describes the UNKNOWN duty and gives one query for it. That query returns a
-- message_id and nothing else, so the operator's first move is always to work out which student it
-- belongs to. These join that in, and add the three questions the doc's query cannot answer:
-- whether the reconciler is running at all, whether anyone was mailed twice, and -- the one that
-- matters most in this system -- whether an approved student with a ticket ever received the email
-- their QR code lives in. There is no other delivery path: no endpoint returns the payload and
-- check-in has no manual fallback, so an undelivered email is a student who cannot get in.
--
-- Kept in its own file, fed to psql by inspect-delivery-ledger.sh, so the test can run these exact
-- statements against a real PostgreSQL rather than against a copy that has drifted.

\pset border 2
\timing off

\echo ''
\echo '== 1. UNKNOWN -- deliveries whose fate nobody knows =========================='
\echo 'Nothing automatic will ever resolve these. Per row, follow OPERATIONS.md:'
\echo 'search the SMTP log around started_at, then mark DELIVERED or FAILED. Never guess.'
\echo ''
SELECT l.message_id,
       l.started_at,
       l.attempt_no,
       r.student_email,
       r.student_mssv,
       r.event_title,
       left(coalesce(l.last_error, ''), 70) AS last_error
  FROM notification_delivery_ledger l
  LEFT JOIN outbox_messages o ON o.message_id = l.message_id
  LEFT JOIN reservations r    ON r.id = o.aggregate_id
 WHERE l.status = 'UNKNOWN'
 ORDER BY l.started_at;

\echo ''
\echo '== 2. PROCESSING past its lease -- is the reconciler running? ==============='
\echo 'DeliveryReconciler turns expired claims into UNKNOWN once a minute. A row that is'
\echo 'still here minutes after lease_until means the scheduler is not running, and'
\echo 'nothing is watching abandoned sends.'
\echo ''
SELECT message_id,
       started_at,
       lease_until,
       now() - lease_until AS overdue_by
  FROM notification_delivery_ledger
 WHERE status = 'PROCESSING'
   AND lease_until < now()
 ORDER BY lease_until;

\echo ''
\echo '== 3. Delivered on a retry -- possible duplicate emails ====================='
\echo 'A later attempt succeeded. If an earlier attempt had already reached SMTP before'
\echo 'the worker lost track of it, the student holds two tickets to the same event.'
\echo 'Informational: this is the accepted cost of at-least-once, not necessarily a fault.'
\echo ''
SELECT l.message_id,
       l.attempt_no,
       l.concluded_at,
       r.student_email,
       r.event_title
  FROM notification_delivery_ledger l
  LEFT JOIN outbox_messages o ON o.message_id = l.message_id
  LEFT JOIN reservations r    ON r.id = o.aggregate_id
 WHERE l.status = 'DELIVERED'
   AND l.attempt_no > 1
 ORDER BY l.concluded_at;

\echo ''
\echo '== 4. Approved, ticketed, never delivered -- students with no way in ========'
\echo 'Bounded to reservations reviewed after the ledger existed: rows approved before'
\echo 'the V15 migration have no ledger entry and their absence proves nothing.'
\echo ''
-- The cutoff is when V15 was installed, read from Flyway's own history.
--
-- min(started_at) over the ledger was the obvious anchor and it is wrong: a delivery starts a
-- moment AFTER the reservation it belongs to was approved, so the earliest ledger row is always
-- timestamped later than the reservation behind it. Anchoring there silently excludes exactly one
-- reservation -- the first one the ledger ever recorded -- and excluding it is indistinguishable
-- from clearing it. Measured against a real schema, not reasoned about.
--
-- If flyway_schema_history is missing this query errors out under ON_ERROR_STOP rather than
-- returning nothing, which is the correct direction to fail: this section reports students who
-- cannot get into an event, and "no rows" must never be something a missing table can produce.
WITH ledger_start AS (
    SELECT min(installed_on) AS began
      FROM flyway_schema_history
     WHERE success AND script LIKE '%notification_delivery_ledger%'
)
SELECT r.id AS reservation_id,
       r.student_email,
       r.student_mssv,
       r.event_title,
       r.reviewed_at,
       coalesce(l.status, '(no ledger row at all)') AS delivery_status
  FROM reservations r
  JOIN tickets t ON t.reservation_id = r.id
  LEFT JOIN outbox_messages o
         ON o.aggregate_id = r.id
        AND o.aggregate_type = 'reservation'
        AND o.routing_key = 'reservation.approved'
  LEFT JOIN notification_delivery_ledger l ON l.message_id = o.message_id
 WHERE r.status = 'APPROVED'
   AND r.reviewed_at >= (SELECT began FROM ledger_start)
   AND (l.status IS NULL OR l.status <> 'DELIVERED')
 ORDER BY r.reviewed_at;

\echo ''
\echo '== 5. Ledger totals ========================================================='
\echo ''
SELECT status, count(*) AS rows, min(started_at) AS earliest, max(started_at) AS latest
  FROM notification_delivery_ledger
 GROUP BY status
 ORDER BY status;

-- The gate. One number, computed from the same tables as the sections above, so the exit status of
-- inspect-delivery-ledger.sh cannot disagree with what it just printed. Section 3 is deliberately
-- not counted: a delivery on a retry is a thing to know about, not a thing to act on.
\echo ''
\pset tuples_only on
\pset format unaligned
WITH ledger_start AS (
    SELECT min(installed_on) AS began
      FROM flyway_schema_history
     WHERE success AND script LIKE '%notification_delivery_ledger%'
)
SELECT 'NEEDS_ATTENTION=' || (
    (SELECT count(*) FROM notification_delivery_ledger WHERE status = 'UNKNOWN')
  + (SELECT count(*) FROM notification_delivery_ledger
      WHERE status = 'PROCESSING' AND lease_until < now())
  + (SELECT count(*)
       FROM reservations r
       JOIN tickets t ON t.reservation_id = r.id
       LEFT JOIN outbox_messages o
              ON o.aggregate_id = r.id
             AND o.aggregate_type = 'reservation'
             AND o.routing_key = 'reservation.approved'
       LEFT JOIN notification_delivery_ledger l ON l.message_id = o.message_id
      WHERE r.status = 'APPROVED'
        AND r.reviewed_at >= (SELECT began FROM ledger_start)
        AND (l.status IS NULL OR l.status <> 'DELIVERED'))
);
