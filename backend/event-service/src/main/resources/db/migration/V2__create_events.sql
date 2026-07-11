CREATE TABLE events (
    id UUID PRIMARY KEY,
    club_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    reg_open_at TIMESTAMPTZ NOT NULL,
    reg_close_at TIMESTAMPTZ NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    location VARCHAR(300) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_event_registration_window CHECK (reg_open_at < reg_close_at),
    CONSTRAINT chk_event_schedule CHECK (start_at < end_at),
    CONSTRAINT chk_event_registration_before_start CHECK (reg_close_at <= start_at)
);

CREATE INDEX idx_events_club_id ON events (club_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_public_listing ON events (status, reg_open_at, reg_close_at);
