CREATE TABLE ticket_inventories (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    club_id UUID NOT NULL,
    total_capacity INTEGER NOT NULL,
    approved_count INTEGER NOT NULL DEFAULT 0,
    event_title VARCHAR(255) NOT NULL,
    event_start_at TIMESTAMPTZ NOT NULL,
    event_end_at TIMESTAMPTZ NOT NULL,
    event_location VARCHAR(255) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ticket_inventories_capacity CHECK (total_capacity > 0),
    CONSTRAINT chk_ticket_inventories_approved_count CHECK (
        approved_count >= 0 AND approved_count <= total_capacity
    )
);

CREATE INDEX ix_ticket_inventories_club_id ON ticket_inventories(club_id);

CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    club_id UUID NOT NULL,
    student_id UUID NOT NULL,
    student_email VARCHAR(320) NOT NULL,
    student_mssv VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    idempotency_key VARCHAR(120) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    CONSTRAINT chk_reservations_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT ux_reservations_event_student UNIQUE (event_id, student_id),
    CONSTRAINT ux_reservations_student_idempotency UNIQUE (student_id, idempotency_key)
);

CREATE INDEX ix_reservations_club_status ON reservations(club_id, status);
CREATE INDEX ix_reservations_student_id ON reservations(student_id);

CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL UNIQUE,
    event_id UUID NOT NULL,
    club_id UUID NOT NULL,
    student_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_tickets_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    CONSTRAINT chk_tickets_status CHECK (status IN ('VALID', 'CHECKED_IN', 'CANCELLED'))
);

CREATE INDEX ix_tickets_event_id ON tickets(event_id);
CREATE INDEX ix_tickets_student_id ON tickets(student_id);

CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL UNIQUE,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id UUID NOT NULL,
    routing_key VARCHAR(120) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    CONSTRAINT chk_outbox_messages_status CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED'))
);

CREATE INDEX ix_outbox_messages_status_created_at ON outbox_messages(status, created_at);
