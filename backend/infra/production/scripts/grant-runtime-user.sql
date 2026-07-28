-- H11: the grants the runtime account needs, and nothing more.
--
-- Run as the migration owner (POSTGRES_USER), after every migration. Idempotent, so running it
-- more often than necessary is harmless.
--
-- :owner and :app are passed with psql -v; they are identifiers, so they are interpolated with
-- :"name" quoting rather than as string literals.

-- Reach the database and the schema at all.
GRANT CONNECT ON DATABASE :"db" TO :"app";
GRANT USAGE ON SCHEMA public TO :"app";

-- Read and write existing business tables. Deliberately no CREATE, ALTER, DROP or TRUNCATE: the
-- application never needs them, and withholding them is what turns a code-execution bug into a
-- data problem rather than a schema-destruction problem.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app";

-- And on tables a FUTURE migration creates. Without this, the next migration that adds a table
-- leaves the application unable to read or write it — the site breaks on the first deploy after
-- that migration, with a permission error nobody expected.
--
-- Default privileges only apply to objects created by the named role, which is why every
-- migration must run as the owner and not as some other superuser.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app";

-- Explicitly not granted, as a reminder to anyone tempted to widen this file:
--   CREATE / ALTER / DROP on the schema, ownership of any object, superuser, CREATEROLE.
