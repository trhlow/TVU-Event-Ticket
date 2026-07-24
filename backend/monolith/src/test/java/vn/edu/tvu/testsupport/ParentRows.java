package vn.edu.tvu.testsupport;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Materialises the club, user and event rows that ticket rows point at.
 *
 * <p>Before V7 the ticket tables carried bare UUIDs with nothing enforcing that the club, user or event
 * existed, so ticket tests could invent parent ids with {@code UUID.randomUUID()} and never create the
 * parents. V7 adds the foreign keys the database-per-service split had made impossible, so those parents
 * have to be real.
 *
 * <p>Every method takes the id the test already chose and inserts that row if it is missing, rather than
 * minting one. That keeps the fixture change confined to the test helpers — the call sites keep passing
 * whatever ids they like, and the ids stay stable across a test's assertions.
 *
 * <p>Raw SQL rather than the owning features' repositories on purpose: the callers are {@code @DataJpaTest}
 * slices scoped to one feature, and pulling in another feature's entities to satisfy a constraint would
 * widen every one of them.
 */
public final class ParentRows {

    private ParentRows() {
    }

    /** Inserts the club under this id if absent. Returns the id for call-site chaining. */
    public static UUID club(JdbcTemplate jdbc, UUID id) {
        jdbc.update("insert into clubs (id, name, status) values (?, ?, 'ACTIVE') on conflict (id) do nothing",
                id, "club-" + id);
        return id;
    }

    /** Inserts a user under this id if absent, unaffiliated with any club. */
    public static UUID user(JdbcTemplate jdbc, UUID id) {
        return user(jdbc, id, null, "SINH_VIEN");
    }

    /** Inserts a user under this id if absent, in the given club (null for none). */
    public static UUID user(JdbcTemplate jdbc, UUID id, UUID clubId, String role) {
        if (clubId != null) {
            club(jdbc, clubId);
        }
        // Role decides the sign-in method, and only Entra accounts carry a subject. Fixtures follow the
        // same rule so they cannot describe a user the application would never create.
        var entra = "SINH_VIEN".equals(role);
        jdbc.update("""
                insert into users (id, ext_subject, email, display_name, role, club_id, status, auth_method)
                values (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                on conflict (id) do nothing
                """,
                id, entra ? "ext-" + id : null, id + "@example.com", "User " + id, role, clubId,
                entra ? "MICROSOFT" : "EMAIL_OTP");
        return id;
    }

    /** Inserts an OPEN event under this id if absent, owned by the given club. */
    public static UUID event(JdbcTemplate jdbc, UUID id, UUID clubId, int capacity) {
        club(jdbc, clubId);
        var creator = user(jdbc, UUID.nameUUIDFromBytes(("creator-" + clubId).getBytes()), clubId, "ORGANIZER");
        jdbc.update("""
                insert into events (id, club_id, title, capacity, reg_open_at, reg_close_at, start_at,
                                    end_at, location, status, created_by, created_at, updated_at)
                values (?, ?, ?, ?, now() - interval '1 day', now() + interval '1 day',
                        now() + interval '2 day', now() + interval '3 day', 'Hall', 'OPEN', ?, now(), now())
                on conflict (id) do nothing
                """,
                id, clubId, "event-" + id, capacity, creator);
        return id;
    }
}
