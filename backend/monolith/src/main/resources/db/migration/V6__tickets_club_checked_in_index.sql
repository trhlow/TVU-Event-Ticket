-- V5 indexed (club_id, status) and (club_id, issued_at), which covers the per-club totals and the
-- "issued per day" series. The "checked in per day" series filters on checked_in_at instead, so it had
-- no usable index: on a club with 300k historical tickets it would scan every one of them to find the
-- few hundred inside the 30-day window, while its sibling series on the same request did a tight range
-- scan.
--
-- Partial on checked_in_at IS NOT NULL: most tickets are never checked in, and the query already
-- excludes those rows, so the index stays small.
--
-- Deliberately a new file rather than an edit to V5: V5 has already been applied to local and CI
-- databases, and changing an applied migration fails Flyway's checksum validation.
CREATE INDEX ix_tickets_club_checked_in ON tickets(club_id, checked_in_at)
    WHERE checked_in_at IS NOT NULL;
