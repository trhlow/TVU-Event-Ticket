-- The tickets table has indexes on event_id and student_id but none on club_id, so every per-club
-- aggregate below would sequentially scan the whole table.
CREATE INDEX ix_tickets_club_status ON tickets(club_id, status);
CREATE INDEX ix_tickets_club_issued ON tickets(club_id, issued_at);
