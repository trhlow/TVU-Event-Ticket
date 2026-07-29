-- H13.1, decision (B): the record of which ticket emails were sent moves from Redis into
-- PostgreSQL, so it survives a restore.
--
-- Redis was the only place that knew an email had gone out, with a 30-day TTL and no relationship
-- to the database backup. Restoring PostgreSQL while standing up an empty Redis left two choices,
-- both wrong: requeue every SENT outbox row and email people twice, or requeue nothing and drop
-- messages that were published but never consumed. A ledger in the same database as the outbox is
-- carried by the same pg_dump, so reconciliation finally has a source of truth.
--
-- Redis keeps only the short-lived lock. It is no longer where the truth lives.
CREATE TABLE notification_delivery_ledger (
    -- The RabbitMQ message id. One row per message, so a redelivery finds the existing row rather
    -- than starting a second, parallel attempt.
    message_id UUID PRIMARY KEY,

    -- PROCESSING  claimed, outcome not yet known
    -- DELIVERED   SMTP accepted the message and that fact was committed
    -- FAILED      failed provably before the message body was handed over; safe to retry
    -- UNKNOWN     SMTP may or may not have accepted it; only the reconciler writes this
    status VARCHAR(20) NOT NULL,

    -- Identifies one attempt. TX2 concludes with "... WHERE message_id = ? AND attempt_id = ?" so
    -- a slow earlier attempt cannot overwrite the verdict of a later one.
    attempt_id UUID NOT NULL,
    attempt_no INTEGER NOT NULL,

    started_at TIMESTAMPTZ NOT NULL,

    -- When this claim is considered abandoned. The reconciler turns expired PROCESSING rows into
    -- UNKNOWN; that is the ONLY way a row becomes UNKNOWN, because a process that dies mid-send
    -- cannot write anything itself.
    lease_until TIMESTAMPTZ NOT NULL,

    concluded_at TIMESTAMPTZ,
    last_error TEXT,

    CONSTRAINT chk_ndl_status CHECK (status IN ('PROCESSING', 'DELIVERED', 'FAILED', 'UNKNOWN')),
    -- A concluded row must say when, and a PROCESSING row must not pretend it has concluded.
    CONSTRAINT chk_ndl_concluded_at CHECK (
        (status = 'PROCESSING' AND concluded_at IS NULL)
     OR (status <> 'PROCESSING' AND concluded_at IS NOT NULL)
    )
);

-- The reconciler's only query: expired claims.
CREATE INDEX ix_ndl_expired_claims ON notification_delivery_ledger (lease_until)
    WHERE status = 'PROCESSING';

-- Backs the gauge that alerts on outstanding UNKNOWN rows. A gauge read from the database, rather
-- than an in-memory counter, is what makes the alert survive a restart and clear itself once the
-- backlog is worked off.
CREATE INDEX ix_ndl_unknown ON notification_delivery_ledger (message_id)
    WHERE status = 'UNKNOWN';
