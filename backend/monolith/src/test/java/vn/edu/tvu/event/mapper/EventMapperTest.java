package vn.edu.tvu.event.mapper;

import org.junit.jupiter.api.Test;
import vn.edu.tvu.event.domain.Event;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class EventMapperTest {
    private final EventMapper mapper = new EventMapperImpl();

    @Test
    void mapsEntityToApiResponseWithoutRemainingTicketField() {
        UUID clubId = UUID.randomUUID();
        Event event = Event.draft(clubId, UUID.randomUUID(), "Open Day", "Description", 100,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-02T00:00:00Z"),
                Instant.parse("2026-08-03T00:00:00Z"), Instant.parse("2026-08-03T04:00:00Z"), "TVU");

        var response = mapper.toResponse(event);

        assertThat(response.id()).isEqualTo(event.getId());
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.title()).isEqualTo("Open Day");
        assertThat(response.capacity()).isEqualTo(100);
        assertThat(response.status()).isEqualTo(event.getStatus());
    }
}
