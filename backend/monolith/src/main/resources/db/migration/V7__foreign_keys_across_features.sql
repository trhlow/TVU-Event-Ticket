-- Referential integrity between what used to be separate databases.
--
-- Under the five-service split, events lived in one database and reservations/tickets in another, so a
-- reservation could only ever hold a bare event_id with nothing enforcing that the event existed. The
-- split is gone -- one schema, one connection pool -- but the missing constraints stayed, and with them
-- the ability to write a ticket for an event that was never created, or for a club that was deleted.
--
-- Two kinds of column are treated differently on purpose:
--
--   * STRUCTURAL references -- a ticket's event_id / club_id / student_id, a reservation's event_id /
--     club_id / student_id, an inventory's event_id / club_id, an event's club_id. A row whose structural
--     parent does not exist is corrupt, so these get foreign keys.
--
--   * ACTOR references -- events.created_by and reservations.reviewed_by. These record *who did it*, the
--     same role audit_log.actor_id plays, and V1 already leaves that column unconstrained on the stated
--     principle that an audit trail must outlive the account that caused it. They are deliberately NOT
--     constrained here, for three reasons that all point the same way:
--       1. Consistency with audit_log.actor_id.
--       2. Deleting an organizer who once created an event or approved a reservation must not fail. With a
--          FK it raises DataIntegrityViolationException, which the auth module surfaces as HTTP 500.
--       3. Before this migration, deleting an organizer already orphaned these columns (there was no FK to
--          stop it). Adding a FK now would make the ALTER itself fail on any existing database that holds
--          such an orphan -- i.e. the application would refuse to start. Leaving them unconstrained keeps
--          the migration applyable on real data.
--
-- ON DELETE is deliberately omitted (defaulting to NO ACTION) on the structural keys. These rows are the
-- record of who attended what; a cascade would let removing a club silently erase its ticket history.
-- Deleting a structurally-referenced row now fails loudly, which is the intended behaviour.
--
-- Not enforced: that a child's club_id matches its event's club_id. That needs a composite foreign key and
-- a matching composite key on the parent; the service layer already scopes every club-bound query, so the
-- extra schema machinery is not worth it for this system.

-- events -> clubs (structural). created_by is an actor reference: left unconstrained, see above.
ALTER TABLE events ADD CONSTRAINT fk_events_club_id
    FOREIGN KEY (club_id) REFERENCES clubs(id);

-- ticket_inventories -> events / clubs
ALTER TABLE ticket_inventories ADD CONSTRAINT fk_ticket_inventories_event_id
    FOREIGN KEY (event_id) REFERENCES events(id);
ALTER TABLE ticket_inventories ADD CONSTRAINT fk_ticket_inventories_club_id
    FOREIGN KEY (club_id) REFERENCES clubs(id);

-- reservations -> events / clubs / users. reviewed_by is an actor reference: left unconstrained, see above.
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_event_id
    FOREIGN KEY (event_id) REFERENCES events(id);
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_club_id
    FOREIGN KEY (club_id) REFERENCES clubs(id);
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_student_id
    FOREIGN KEY (student_id) REFERENCES users(id);

-- tickets -> events / clubs / users (reservation_id already had its constraint from V3)
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_event_id
    FOREIGN KEY (event_id) REFERENCES events(id);
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_club_id
    FOREIGN KEY (club_id) REFERENCES clubs(id);
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_student_id
    FOREIGN KEY (student_id) REFERENCES users(id);

-- Postgres does not index the referencing side of a foreign key automatically. Without an index, deleting
-- a parent row sequentially scans the child table to prove nothing references it.
--
-- Only reservations.event_id is genuinely uncovered. The rest already have an index, either directly or as
-- the leading column of a composite, which serves the FK check just as well:
--   reservations.club_id   -> ix_reservations_club_status (club_id, status)   [V3]
--   reservations.student_id-> ix_reservations_student_id                      [V3]
--   tickets.event_id       -> ix_tickets_event_id                             [V3]
--   tickets.student_id     -> ix_tickets_student_id                           [V3]
--   tickets.club_id        -> ix_tickets_club_status (club_id, status)        [V5]
--   ticket_inventories.event_id -> UNIQUE (event_id)                          [V3]
--   ticket_inventories.club_id  -> ix_ticket_inventories_club_id              [V3]
--   events.club_id         -> idx_events_club_id                              [V2]
CREATE INDEX ix_reservations_event_id ON reservations(event_id);
