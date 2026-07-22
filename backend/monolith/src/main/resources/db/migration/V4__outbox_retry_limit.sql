-- Give the outbox relay a way to give up.
--
-- Before this migration a message the broker permanently rejects returned to NEW with no delay and no
-- attempt ceiling. findClaimable takes the 50 oldest claimable rows, so 50 such rows saturate every batch
-- forever and no newer message is ever published again -- with nothing logged as an error.

ALTER TABLE outbox_messages ADD COLUMN next_attempt_at TIMESTAMPTZ;

ALTER TABLE outbox_messages DROP CONSTRAINT chk_outbox_messages_status;
ALTER TABLE outbox_messages ADD CONSTRAINT chk_outbox_messages_status
    CHECK (status IN ('NEW', 'PROCESSING', 'SENT', 'FAILED'));

-- The relay index must keep excluding terminal rows, and FAILED is now terminal alongside SENT.
DROP INDEX ix_outbox_messages_relay;
CREATE INDEX ix_outbox_messages_relay
    ON outbox_messages(status, next_attempt_at, locked_until, created_at)
    WHERE status NOT IN ('SENT', 'FAILED');
