-- H8: session revocation that does not lock out sessions created after the revocation.
--
-- Every issued JWT carries this number; a request is authenticated only while the claim still
-- equals the value here. Locking an organiser, deactivating a club or signing out everywhere
-- increments it in the same transaction that changes the state, so tokens issued before that
-- moment stop working and tokens issued after keep working.
--
-- Deliberately NOT the existing users.version column (V8, JPA @Version optimistic locking):
-- that one increments on every UPDATE, so editing a display name would sign the user out
-- everywhere. Only security-relevant operations touch auth_version.
--
-- DEFAULT 0 covers existing rows. It is not a fallback for tokens: a JWT without the claim is
-- rejected outright, so old tokens do not silently match this default.
ALTER TABLE users
    ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0;
