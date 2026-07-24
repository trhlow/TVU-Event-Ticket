-- A verified browser is remembered here so an admin does not enter a code on every visit. Only the
-- hash of the cookie token is stored; the token itself lives solely in the browser.
CREATE TABLE trusted_devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX ix_trusted_devices_user ON trusted_devices (user_id);
