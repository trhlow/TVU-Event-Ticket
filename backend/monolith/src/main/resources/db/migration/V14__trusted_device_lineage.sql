-- H8 phase 2 + M1: give a remembered browser an identity that survives token rotation, and a
-- record of which revocation generation it was issued under.
--
-- device_family_id  — stable across every rotation of the same browser. Logging out of one
--                     browser has to revoke that browser, and the token it presents may already
--                     have been rotated away; without a family id the only handle available was
--                     "every device on the account".
-- issued_auth_version — the users.auth_version in force when this device was issued. Lets a
--                     replayed cookie be classified instead of always treated as a live theft:
--                     a cookie from a generation that was already invalidated must not be able
--                     to revoke the devices someone just re-registered.
--
-- C3.0 chose clean slate, so on the v2 stack this table is empty and the backfill below is a
-- no-op. The statements are written anyway so the migration is also correct on a development
-- database that already holds rows: those rows predate lineage, cannot be assigned a truthful
-- generation, and are therefore revoked rather than guessed at.
ALTER TABLE trusted_devices
    ADD COLUMN device_family_id UUID,
    ADD COLUMN issued_auth_version BIGINT;

-- Pre-existing rows: each becomes its own family, and is revoked because its true generation is
-- unknowable. Users re-register the browser on next sign-in; the alternative is inventing a
-- generation number and having the replay rules act on a fiction.
UPDATE trusted_devices SET device_family_id = id WHERE device_family_id IS NULL;
UPDATE trusted_devices SET issued_auth_version = 0 WHERE issued_auth_version IS NULL;
UPDATE trusted_devices SET revoked_at = now() WHERE revoked_at IS NULL;

ALTER TABLE trusted_devices ALTER COLUMN device_family_id SET NOT NULL;
ALTER TABLE trusted_devices ALTER COLUMN issued_auth_version SET NOT NULL;

-- One live token per browser. Rotation revokes the old row and inserts the successor, so two
-- active rows in the same family would mean a rotation produced two usable cookies.
CREATE UNIQUE INDEX ux_trusted_devices_active_family
    ON trusted_devices (device_family_id) WHERE revoked_at IS NULL;

-- Replay detection reads revoked rows, so cleanup may only delete rows past expires_at, never
-- rows merely because they are revoked. This index is what makes that sweep cheap.
CREATE INDEX ix_trusted_devices_expires_at ON trusted_devices (expires_at);
