package vn.edu.tvu.event.repository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.support.AbstractPostgresIntegrationTest;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventRepositoryTest extends AbstractPostgresIntegrationTest {
    @Autowired EventRepository repository;

    @Test
    void scopesByClubAndFindsEventsOpenForRegistration() {
        UUID clubId = UUID.randomUUID();
        Event event = Event.draft(clubId, UUID.randomUUID(), "Open Day", null, 50,
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
}
