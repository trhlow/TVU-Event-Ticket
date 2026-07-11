package vn.edu.tvu.event.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.dto.request.EventRequest;
import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.exception.EventConflictException;
import vn.edu.tvu.event.exception.EventNotFoundException;
import vn.edu.tvu.event.exception.EventValidationException;
import vn.edu.tvu.event.mapper.EventMapper;
import vn.edu.tvu.event.messaging.EventAuditPublisher;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.event.security.CurrentUser;
import java.time.*;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventServiceTest {
    @Mock EventRepository repository;
    @Mock EventMapper mapper;
    @Mock EventAuditPublisher auditPublisher;
    private EventService service;
    private UUID clubId;
    private CurrentUser organizer;

    @BeforeEach
    void setUp() {
        service = new EventService(repository, mapper, auditPublisher,
                Clock.fixed(Instant.parse("2026-07-11T00:00:00Z"), ZoneOffset.UTC));
        clubId = UUID.randomUUID();
        organizer = new CurrentUser(UUID.randomUUID(), clubId);
    }

    @Test
    void createsDraftAndPublishesAudit() {
        mapResponses();
        EventResponse response = service.create(organizer, request(100));
        assertThat(response.status()).isEqualTo(EventStatus.DRAFT);
        assertThat(response.clubId()).isEqualTo(clubId);
        verify(repository).save(any(Event.class));
        verify(auditPublisher).publish(eq(organizer.id()), eq(response.id()), eq("CREATED"), anyString());
    }

    @Test
    void rejectsInvalidRegistrationWindow() {
        EventRequest invalid = new EventRequest("Event", null, 10,
                Instant.parse("2026-08-02T00:00:00Z"), Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-03T00:00:00Z"), Instant.parse("2026-08-04T00:00:00Z"), "TVU");
        assertThatThrownBy(() -> service.create(organizer, invalid)).isInstanceOf(EventValidationException.class);
        verifyNoInteractions(repository, auditPublisher);
    }

    @Test
    void preventsCapacityChangeAfterOpen() {
        Event event = event(100);
        event.open();
        when(repository.findByIdAndClubId(event.getId(), clubId)).thenReturn(Optional.of(event));
        assertThatThrownBy(() -> service.update(organizer, event.getId(), request(101)))
                .isInstanceOf(EventConflictException.class);
    }

    @Test
    void onlyAllowsDraftToOpenAndOpenToClosed() {
        mapResponses();
        Event event = event(100);
        when(repository.findByIdAndClubId(event.getId(), clubId)).thenReturn(Optional.of(event));
        assertThat(service.changeStatus(organizer, event.getId(), EventStatus.OPEN).status())
                .isEqualTo(EventStatus.OPEN);
        assertThat(service.changeStatus(organizer, event.getId(), EventStatus.CLOSED).status())
                .isEqualTo(EventStatus.CLOSED);
        assertThatThrownBy(() -> service.changeStatus(organizer, event.getId(), EventStatus.OPEN))
                .isInstanceOf(EventConflictException.class);
    }

    @Test
    void hidesEventsOwnedByAnotherClub() {
        UUID eventId = UUID.randomUUID();
        when(repository.findByIdAndClubId(eventId, clubId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(organizer, eventId, request(100)))
                .isInstanceOf(EventNotFoundException.class);
    }

    @Test
    void deletesOnlyDraftEvents() {
        Event draft = event(100);
        when(repository.findByIdAndClubId(draft.getId(), clubId)).thenReturn(Optional.of(draft));
        service.delete(organizer, draft.getId());
        verify(repository).delete(draft);
        verify(auditPublisher).publish(organizer.id(), draft.getId(), "DELETED", draft.getTitle());

        Event open = event(100);
        open.open();
        when(repository.findByIdAndClubId(open.getId(), clubId)).thenReturn(Optional.of(open));
        assertThatThrownBy(() -> service.delete(organizer, open.getId()))
                .isInstanceOf(EventConflictException.class);
    }

    private EventRequest request(int capacity) {
        return new EventRequest("Open Day", "Description", capacity,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-02T00:00:00Z"),
                Instant.parse("2026-08-03T00:00:00Z"), Instant.parse("2026-08-04T00:00:00Z"), "TVU Hall");
    }

    private Event event(int capacity) {
        EventRequest r = request(capacity);
        return Event.draft(clubId, organizer.id(), r.title(), r.description(), r.capacity(),
                r.registrationOpenAt(), r.registrationCloseAt(), r.startAt(), r.endAt(), r.location());
    }

    private EventResponse response(Event event) {
        return new EventResponse(event.getId(), event.getClubId(), event.getTitle(), event.getDescription(),
                event.getCapacity(), event.getRegistrationOpenAt(), event.getRegistrationCloseAt(),
                event.getStartAt(), event.getEndAt(), event.getLocation(), event.getStatus(),
                event.getCreatedBy(), event.getCreatedAt(), event.getUpdatedAt());
    }

    private void mapResponses() {
        when(mapper.toResponse(any())).thenAnswer(invocation -> response(invocation.getArgument(0)));
    }
}
