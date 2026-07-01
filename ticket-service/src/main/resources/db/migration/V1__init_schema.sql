-- Flyway baseline for ticket-service.
-- Real DDL (reservations, tickets) will be added here as entities are defined.
-- Reminder for upcoming migrations (§6.3):
--   * reservations.status: PENDING | APPROVED | REJECTED
--   * UNIQUE (event_id, student_id) to enforce max 1 ticket/event/account
--   * tickets.version column for JPA optimistic locking (@Version)
-- Migration files are immutable once applied: never edit a shipped Vn__*.sql — add a new version.
SELECT 1;
