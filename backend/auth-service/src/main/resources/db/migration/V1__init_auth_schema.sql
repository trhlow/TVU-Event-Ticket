CREATE TABLE clubs (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_clubs_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    ext_subject VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    mssv VARCHAR(30),
    mssv_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED',
    class_code VARCHAR(50),
    role VARCHAR(30) NOT NULL,
    club_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_users_club_id FOREIGN KEY (club_id) REFERENCES clubs(id),
    CONSTRAINT chk_users_mssv_status CHECK (mssv_status IN ('UNVERIFIED', 'VERIFIED')),
    CONSTRAINT chk_users_role CHECK (role IN ('SINH_VIEN', 'ORGANIZER', 'SUPER_ADMIN')),
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'LOCKED'))
);

CREATE UNIQUE INDEX ux_users_mssv_not_null ON users(mssv) WHERE mssv IS NOT NULL;
CREATE INDEX ix_users_club_id ON users(club_id);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    message_id UUID UNIQUE,
    actor_id UUID,
    action VARCHAR(120) NOT NULL,
    target_type VARCHAR(80) NOT NULL,
    target_id UUID,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_log_created_at ON audit_log(created_at);
CREATE INDEX ix_audit_log_action ON audit_log(action);
