package vn.edu.tvu.monolith.ticket;

import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.service.EventService;
import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.client.EventSnapshot;

import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("monolith")
class InProcessEventLookup implements EventLookup {
    private final EventService eventService;

    InProcessEventLookup(EventService eventService) {
        this.eventService = eventService;
    }

    @Override
    public EventSnapshot getOpenEvent(UUID eventId) {
        EventResponse event = eventService.getPublic(eventId);
        return new EventSnapshot(event.id(), event.clubId(), event.title(), event.description(), event.capacity(),
                event.registrationOpenAt(), event.registrationCloseAt(), event.startAt(), event.endAt(),
                event.location(), event.status().name(), event.createdBy(), event.createdAt(), event.updatedAt());
    }
}
