-- Runs once on a fresh Postgres data volume (docker-entrypoint-initdb.d).
-- Creates the three logical databases, one per data-owning service, so no manual step is needed.
-- POSTGRES_DB=tvu_event already creates tvu_event; create the other two here.
CREATE DATABASE tvu_ticket;
CREATE DATABASE tvu_auth;
