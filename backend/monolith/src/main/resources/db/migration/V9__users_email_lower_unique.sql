-- Case-insensitive email uniqueness.
--
-- V1 has UNIQUE(email), but that is case-sensitive: Student@tvu.edu.vn and student@tvu.edu.vn would be two
-- distinct rows. Every write path now normalizes email to lowercase at the boundary (admin provisioning,
-- the dev stub, and the Microsoft identity provider), so this index is the schema-level guarantee that a
-- reissued token with different casing resolves to the one existing account instead of silently forking a
-- duplicate. If this migration fails, the database already holds case-variant duplicate emails that must be
-- merged/removed by hand before it can apply.
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));
