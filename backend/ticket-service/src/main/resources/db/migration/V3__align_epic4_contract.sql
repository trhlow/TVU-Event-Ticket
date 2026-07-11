ALTER TABLE reservations
    ADD COLUMN event_title VARCHAR(255),
    ADD COLUMN event_start_at TIMESTAMPTZ,
    ADD COLUMN event_end_at TIMESTAMPTZ,
    ADD COLUMN event_location VARCHAR(255);

UPDATE reservations r
SET event_title = i.event_title,
    event_start_at = i.event_start_at,
    event_end_at = i.event_end_at,
    event_location = i.event_location
FROM ticket_inventories i
WHERE i.event_id = r.event_id;

UPDATE reservations
SET event_title = COALESCE(event_title, 'Unknown event'),
    event_start_at = COALESCE(event_start_at, requested_at),
    event_end_at = COALESCE(event_end_at, requested_at),
    event_location = COALESCE(event_location, 'Unknown location');

ALTER TABLE reservations
    ALTER COLUMN event_title SET NOT NULL,
    ALTER COLUMN event_start_at SET NOT NULL,
    ALTER COLUMN event_end_at SET NOT NULL,
    ALTER COLUMN event_location SET NOT NULL,
    DROP CONSTRAINT ux_reservations_student_idempotency,
    ADD CONSTRAINT ux_reservations_event_student_idempotency
        UNIQUE (event_id, student_id, idempotency_key);

ALTER TABLE outbox_messages DROP CONSTRAINT chk_outbox_messages_status;

UPDATE outbox_messages
SET status = CASE status
    WHEN 'PUBLISHED' THEN 'SENT'
    ELSE 'NEW'
END;

ALTER TABLE outbox_messages
    ALTER COLUMN payload TYPE JSONB USING payload::jsonb;

ALTER TABLE outbox_messages RENAME COLUMN published_at TO sent_at;

ALTER TABLE outbox_messages
    ADD COLUMN last_error TEXT,
    ADD COLUMN locked_at TIMESTAMPTZ,
    ADD COLUMN locked_by VARCHAR(120),
    ADD COLUMN locked_until TIMESTAMPTZ,
    ADD CONSTRAINT chk_outbox_messages_status CHECK (status IN ('NEW', 'PROCESSING', 'SENT'));

DROP INDEX ix_outbox_messages_status_created_at;
CREATE INDEX ix_outbox_messages_relay
    ON outbox_messages(status, locked_until, created_at)
    WHERE status <> 'SENT';
