-- Role now decides the sign-in method, so accounts an admin creates have no Entra subject at all.
-- Existing organizers and super admins move to the emailed-code path and their subjects are dropped,
-- which is what stops an Entra login from ever reaching those accounts by address.
ALTER TABLE users ADD COLUMN auth_method VARCHAR(20);

UPDATE users SET auth_method = 'EMAIL_OTP' WHERE role IN ('ORGANIZER', 'SUPER_ADMIN');
UPDATE users SET auth_method = 'MICROSOFT' WHERE auth_method IS NULL;
ALTER TABLE users ALTER COLUMN auth_method SET NOT NULL;

-- Order matters: the column has to accept NULL before the rows are nulled, and the UNIQUE
-- constraint owns its index, so the index cannot be dropped on its own.
ALTER TABLE users ALTER COLUMN ext_subject DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ext_subject_key;

UPDATE users SET ext_subject = NULL WHERE auth_method = 'EMAIL_OTP';

-- Partial so the remaining subjects stay unique while every admin row holds NULL.
CREATE UNIQUE INDEX ux_users_ext_subject_not_null
    ON users (ext_subject) WHERE ext_subject IS NOT NULL;
