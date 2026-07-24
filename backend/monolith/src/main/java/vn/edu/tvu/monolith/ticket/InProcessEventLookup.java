package vn.edu.tvu.monolith.ticket;

import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.exception.EventNotFoundException;
import vn.edu.tvu.event.service.EventService;
import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.client.EventSnapshot;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class InProcessEventLookup implements EventLookup {
    private final EventService eventService;

    InProcessEventLookup(EventService eventService) {
        this.eventService = eventService;
    }

    @Override
    public EventSnapshot getOpenEvent(UUID eventId) {
        // EventService signals an unknown/non-OPEN event with the event feature's own runtime exception.
        // That type only means anything inside the event package's exception handler; if it escaped into
        // ticket controllers it would fall through to a generic 500. Translate it here, at the feature
        // boundary, into the ticket feature's error vocabulary so callers only ever see ResponseStatusException.
        EventResponse event;
        try {
            event = eventService.getPublic(eventId);
        } catch (EventNotFoundException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found");
        }
        return new EventSnapshot(event.id(), event.clubId(), event.title(), event.description(), event.capacity(),
                event.registrationOpenAt(), event.registrationCloseAt(), event.startAt(), event.endAt(),
                event.location(), event.status().name(), event.createdBy(), event.createdAt(), event.updatedAt());
    }
}
