-- H3 + M8, deliberately in one migration.
--
-- Splitting them would mean preflighting the same table twice and leaving a window where V13
-- succeeded and the follow-up failed halfway through on production.
--
-- C3.0 chose clean slate, so these run against an empty users table on the v2 stack: no data
-- repair step, no ADD CONSTRAINT ... NOT VALID dance. On a development database that already
-- holds violating rows the migration fails loudly, which is the correct outcome — such a row is
-- a bug, and the fix is to reset the dev database rather than to weaken the constraint.
--
-- V1 only ever checked that enum columns held known values; every invariant below was previously
-- enforced by application code alone, i.e. not enforced against a manual UPDATE during an
-- incident or against a future code path.

-- H3: role decides the sign-in method, and only students carry an Entra subject.
-- The shape this forbids is the dangerous one: an admin account with an ext_subject, which the
-- Entra login flow could reach by matching on that subject.
ALTER TABLE users ADD CONSTRAINT chk_users_identity_by_role CHECK (
    (role = 'SINH_VIEN' AND auth_method = 'MICROSOFT' AND ext_subject IS NOT NULL)
 OR (role IN ('ORGANIZER', 'SUPER_ADMIN') AND auth_method = 'EMAIL_OTP' AND ext_subject IS NULL)
);

-- M8: an organiser without a club has no scope to organise anything, and a student or super
-- admin carrying a club_id would silently widen or narrow what club-scoped queries return.
ALTER TABLE users ADD CONSTRAINT chk_users_club_by_role CHECK (
    (role = 'ORGANIZER' AND club_id IS NOT NULL)
 OR (role IN ('SINH_VIEN', 'SUPER_ADMIN') AND club_id IS NULL)
);

-- M8: "verified" has to be a statement about something. VERIFIED with no mssv is a state the
-- verify endpoint could previously produce, because it only checked the string was non-blank.
ALTER TABLE users ADD CONSTRAINT chk_users_mssv_verified_requires_mssv CHECK (
    mssv_status <> 'VERIFIED' OR mssv IS NOT NULL
);

-- M8: mssv and class_code describe a student. On an admin row they are meaningless at best, and
-- at worst they make that account show up in student-facing lookups.
ALTER TABLE users ADD CONSTRAINT chk_users_student_fields_by_role CHECK (
    role = 'SINH_VIEN' OR (mssv IS NULL AND class_code IS NULL)
);
