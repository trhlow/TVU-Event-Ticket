package vn.edu.tvu.monolith.ticket;

import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.exception.EventNotFoundException;
import vn.edu.tvu.event.service.EventService;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InProcessEventLookupTest {

    private final EventService eventService = mock(EventService.class);
    private final InProcessEventLookup lookup = new InProcessEventLookup(eventService);

    @Test
    void translatesEventNotFoundIntoResponseStatus404() {
        var eventId = UUID.randomUUID();
        when(eventService.getPublic(eventId)).thenThrow(new EventNotFoundException());

        assertThatThrownBy(() -> lookup.getOpenEvent(eventId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void mapsOpenEventToSnapshot() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var createdBy = UUID.randomUUID();
        var now = Instant.now();
        when(eventService.getPublic(eventId)).thenReturn(new EventResponse(eventId, clubId, "Title",
                "Desc", 100, now, now.plusSeconds(60), now.plusSeconds(120), now.plusSeconds(180),
                "Hall", EventStatus.OPEN, createdBy, now, now));

        var snapshot = lookup.getOpenEvent(eventId);

        assertThat(snapshot.id()).isEqualTo(eventId);
        assertThat(snapshot.clubId()).isEqualTo(clubId);
        assertThat(snapshot.capacity()).isEqualTo(100);
        assertThat(snapshot.status()).isEqualTo("OPEN");
    }
}
