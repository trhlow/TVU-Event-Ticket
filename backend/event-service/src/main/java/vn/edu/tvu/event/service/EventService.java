package vn.edu.tvu.event.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.tvu.event.domain.*;
import vn.edu.tvu.event.dto.request.EventRequest;
import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.exception.*;
import vn.edu.tvu.event.mapper.EventMapper;
import vn.edu.tvu.event.messaging.EventAuditPublisher;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.event.security.CurrentUser;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class EventService {
    private final EventRepository repository;
    private final EventMapper mapper;
    private final EventAuditPublisher auditPublisher;
    private final Clock clock;

    public EventService(EventRepository repository, EventMapper mapper, EventAuditPublisher auditPublisher, Clock clock) {
        this.repository = repository;
        this.mapper = mapper;
        this.auditPublisher = auditPublisher;
        this.clock = clock;
    }

    @Transactional
    public EventResponse create(CurrentUser user, EventRequest request) {
        requireClub(user);
        validateSchedule(request);
        Event event = Event.draft(user.clubId(), user.id(), request.title(), request.description(),
                request.capacity(), request.registrationOpenAt(), request.registrationCloseAt(),
                request.startAt(), request.endAt(), request.location());
        repository.save(event);
        auditPublisher.publish(user.id(), event.getId(), "CREATED", event.getTitle());
        return mapper.toResponse(event);
    }

    @Transactional
    public EventResponse update(CurrentUser user, UUID eventId, EventRequest request) {
        Event event = ownedEvent(user, eventId);
        validateSchedule(request);
        if (event.getStatus() != EventStatus.DRAFT && event.getCapacity() != request.capacity()) {
            throw new EventConflictException("Capacity cannot be changed after an event is opened");
        }
        event.updateDetails(request.title(), request.description(), request.capacity(),
                request.registrationOpenAt(), request.registrationCloseAt(), request.startAt(),
                request.endAt(), request.location());
        auditPublisher.publish(user.id(), event.getId(), "UPDATED", event.getTitle());
        return mapper.toResponse(event);
    }

    @Transactional
    public EventResponse changeStatus(CurrentUser user, UUID eventId, EventStatus target) {
        Event event = ownedEvent(user, eventId);
        if (event.getStatus() == EventStatus.DRAFT && target == EventStatus.OPEN) event.open();
        else if (event.getStatus() == EventStatus.OPEN && target == EventStatus.CLOSED) event.close();
        else throw new EventConflictException("Invalid event status transition");
        auditPublisher.publish(user.id(), event.getId(), "STATUS_CHANGED", target.name());
        return mapper.toResponse(event);
    }

    @Transactional
    public void delete(CurrentUser user, UUID eventId) {
        Event event = ownedEvent(user, eventId);
        if (event.getStatus() != EventStatus.DRAFT) {
            throw new EventConflictException("Only draft events can be deleted");
        }
        repository.delete(event);
        auditPublisher.publish(user.id(), event.getId(), "DELETED", event.getTitle());
    }

    public List<EventResponse> listOwned(CurrentUser user) {
        requireClub(user);
        return repository.findByClubIdOrderByStartAtDesc(user.clubId()).stream().map(mapper::toResponse).toList();
    }

    public List<EventResponse> listPublic() {
        Instant now = clock.instant();
        return repository.findByStatusAndRegistrationOpenAtLessThanEqualAndRegistrationCloseAtGreaterThanEqualOrderByStartAt(
                EventStatus.OPEN, now, now).stream().map(mapper::toResponse).toList();
    }

    public EventResponse getPublic(UUID id) {
        Event event = repository.findById(id).filter(e -> e.getStatus() == EventStatus.OPEN)
                .orElseThrow(EventNotFoundException::new);
        return mapper.toResponse(event);
    }

    private Event ownedEvent(CurrentUser user, UUID id) {
        requireClub(user);
        Event event = repository.findById(id).orElseThrow(EventNotFoundException::new);
        if (!event.getClubId().equals(user.clubId())) throw new EventAccessDeniedException();
        return event;
    }

    private void requireClub(CurrentUser user) {
        if (user.clubId() == null) throw new EventValidationException("Organizer must belong to a club");
    }

    private void validateSchedule(EventRequest request) {
        if (!request.registrationOpenAt().isBefore(request.registrationCloseAt()))
            throw new EventValidationException("Registration opening must be before closing");
        if (!request.startAt().isBefore(request.endAt()))
            throw new EventValidationException("Event start must be before event end");
        if (request.registrationCloseAt().isAfter(request.startAt()))
            throw new EventValidationException("Registration must close before the event starts");
    }
}
