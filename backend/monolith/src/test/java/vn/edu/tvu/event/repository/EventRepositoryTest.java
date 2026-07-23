package vn.edu.tvu.event.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.support.AbstractPostgresIntegrationTest;
import vn.edu.tvu.testsupport.ParentRows;

import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventRepositoryTest extends AbstractPostgresIntegrationTest {
    @Autowired EventRepository repository;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    /** V7 constrains events.club_id and events.created_by, so the parents have to exist. */
    private UUID organizerIn(UUID clubId) {
        return ParentRows.user(jdbcTemplate, UUID.randomUUID(), clubId, "ORGANIZER");
    }

    @Test
    void scopesByClubAndFindsEventsOpenForRegistration() {
        UUID clubId = UUID.randomUUID();
        Event event = Event.draft(clubId, organizerIn(clubId), "Open Day", null, 50,
                Instant.parse("2026-07-01T00:00:00Z"), Instant.parse("2026-07-20T00:00:00Z"),
                Instant.parse("2026-07-21T00:00:00Z"), Instant.parse("2026-07-21T04:00:00Z"), "TVU");
        event.open();
        repository.saveAndFlush(event);

        assertThat(repository.findByIdAndClubId(event.getId(), clubId)).isPresent();
        assertThat(repository.findByIdAndClubId(event.getId(), UUID.randomUUID())).isEmpty();
        assertThat(repository.findByStatusAndRegistrationOpenAtLessThanEqualAndRegistrationCloseAtGreaterThanEqualOrderByStartAt(
                EventStatus.OPEN, Instant.parse("2026-07-11T00:00:00Z"),
                Instant.parse("2026-07-11T00:00:00Z"))).extracting(Event::getId).containsExactly(event.getId());
    }

    @Test
    void repositoryGroupsCountsByStatus() {
        UUID draftClub = ParentRows.club(jdbcTemplate, UUID.randomUUID());
        Event draft = Event.draft(draftClub, organizerIn(draftClub), "Draft Event", null, 10,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-10T00:00:00Z"),
                Instant.parse("2026-08-11T00:00:00Z"), Instant.parse("2026-08-11T04:00:00Z"), "TVU");
        UUID openClub = ParentRows.club(jdbcTemplate, UUID.randomUUID());
        Event open = Event.draft(openClub, organizerIn(openClub), "Open Event", null, 20,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-10T00:00:00Z"),
                Instant.parse("2026-08-11T00:00:00Z"), Instant.parse("2026-08-11T04:00:00Z"), "TVU");
        open.open();
        repository.saveAndFlush(draft);
        repository.saveAndFlush(open);

        var rows = repository.countGroupedByStatus();

        var byStatus = rows.stream().collect(java.util.stream.Collectors.toMap(
                EventRepository.EventStatusCountProjection::getStatus,
                EventRepository.EventStatusCountProjection::getCount));
        assertThat(byStatus.get(EventStatus.DRAFT)).isGreaterThanOrEqualTo(1L);
        assertThat(byStatus.get(EventStatus.OPEN)).isGreaterThanOrEqualTo(1L);
    }
}
