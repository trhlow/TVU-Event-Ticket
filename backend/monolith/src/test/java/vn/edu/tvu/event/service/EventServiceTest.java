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
import vn.edu.tvu.event.exception.EventAccessDeniedException;
import vn.edu.tvu.event.exception.EventNotFoundException;
import vn.edu.tvu.event.exception.EventValidationException;
import vn.edu.tvu.event.mapper.EventMapper;
import vn.edu.tvu.shared.audit.AuditRecorder;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.event.security.CurrentUser;
import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventServiceTest {
    @Mock EventRepository repository;
    @Mock EventMapper mapper;
    @Mock AuditRecorder auditRecorder;
    private EventService service;
    private UUID clubId;
    private CurrentUser organizer;

    @BeforeEach
    void setUp() {
        service = new EventService(repository, mapper, auditRecorder,
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
        verify(auditRecorder).recordAudit(eq(organizer.id()), eq("CREATED"), eq("EVENT"), eq(response.id()), anyString());
    }

    @Test
    void rejectsInvalidRegistrationWindow() {
        EventRequest invalid = new EventRequest("Event", null, 10,
                Instant.parse("2026-08-02T00:00:00Z"), Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-03T00:00:00Z"), Instant.parse("2026-08-04T00:00:00Z"), "TVU");
        assertThatThrownBy(() -> service.create(organizer, invalid)).isInstanceOf(EventValidationException.class);
        verifyNoInteractions(repository, auditRecorder);
    }

    @Test
    void preventsCapacityChangeAfterOpen() {
        Event event = event(100);
        event.open();
        when(repository.findById(event.getId())).thenReturn(Optional.of(event));
        assertThatThrownBy(() -> service.update(organizer, event.getId(), request(101)))
                .isInstanceOf(EventConflictException.class);
    }

    @Test
    void onlyAllowsDraftToOpenAndOpenToClosed() {
        mapResponses();
        Event event = event(100);
        when(repository.findById(event.getId())).thenReturn(Optional.of(event));
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
        Event foreignEvent = Event.draft(UUID.randomUUID(), UUID.randomUUID(), "Foreign", null, 10,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-02T00:00:00Z"),
                Instant.parse("2026-08-03T00:00:00Z"), Instant.parse("2026-08-04T00:00:00Z"), "TVU");
        when(repository.findById(eventId)).thenReturn(Optional.of(foreignEvent));
        assertThatThrownBy(() -> service.update(organizer, eventId, request(100)))
                .isInstanceOf(EventAccessDeniedException.class);
    }

    @Test
    void deletesOnlyDraftEvents() {
        Event draft = event(100);
        when(repository.findById(draft.getId())).thenReturn(Optional.of(draft));
        service.delete(organizer, draft.getId());
        verify(repository).delete(draft);
        verify(auditRecorder).recordAudit(organizer.id(), "DELETED", "EVENT", draft.getId(), draft.getTitle());

        Event open = event(100);
        open.open();
        when(repository.findById(open.getId())).thenReturn(Optional.of(open));
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

    @Test
    void statsReturnsTotalAndZeroFilledStatusBreakdown() {
        when(repository.count()).thenReturn(12L);
        when(repository.countGroupedByStatus()).thenReturn(List.of(
                statusCount(EventStatus.OPEN, 5L),
                statusCount(EventStatus.CLOSED, 7L)));

        var stats = service.stats();

        assertThat(stats.totalEvents()).isEqualTo(12);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.OPEN, 5L);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.CLOSED, 7L);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.DRAFT, 0L);
    }

    private EventRepository.EventStatusCountProjection statusCount(EventStatus status, long count) {
        return new EventRepository.EventStatusCountProjection() {
            @Override public EventStatus getStatus() { return status; }
            @Override public long getCount() { return count; }
        };
    }
}
