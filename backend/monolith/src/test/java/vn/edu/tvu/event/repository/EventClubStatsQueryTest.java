package vn.edu.tvu.event.repository;

import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.support.AbstractPostgresIntegrationTest;

import vn.edu.tvu.testsupport.ParentRows;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired EventRepository repository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void countsEventsPerClubSplitByStatus() {
        var clubA = UUID.randomUUID();
        var clubB = UUID.randomUUID();
        insert(clubA, EventStatus.OPEN);
        insert(clubA, EventStatus.OPEN);
        insert(clubA, EventStatus.DRAFT);
        insert(clubB, EventStatus.CLOSED);

        var counts = repository.countByClubAndStatus(List.of(clubA, clubB));

        assertThat(counts)
                .extracting(ClubEventCount::getClubId, ClubEventCount::getStatus, ClubEventCount::getTotal)
                .containsExactlyInAnyOrder(
                        tuple(clubA, EventStatus.OPEN, 2L),
                        tuple(clubA, EventStatus.DRAFT, 1L),
                        tuple(clubB, EventStatus.CLOSED, 1L));
    }

    @Test
    void omitsClubsWithNoEvents() {
        assertThat(repository.countByClubAndStatus(List.of(UUID.randomUUID()))).isEmpty();
    }

    private void insert(UUID clubId, EventStatus status) {
        ParentRows.club(jdbcTemplate, clubId);
        jdbcTemplate.update("""
                INSERT INTO events (id, club_id, title, description, capacity,
                                    reg_open_at, reg_close_at, start_at, end_at, location,
                                    status, created_by, created_at, updated_at)
                VALUES (?, ?, 'Test event', '', 100,
                        now() - interval '2 day', now() - interval '1 day', now() + interval '1 day', now() + interval '2 day', 'Hall',
                        ?, ?, now(), now())
                """, UUID.randomUUID(), clubId, status.name(),
                ParentRows.user(jdbcTemplate, UUID.randomUUID(), clubId, "ORGANIZER"));
    }
}
