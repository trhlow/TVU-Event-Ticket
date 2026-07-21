package vn.edu.tvu.ticket.client;

import java.util.UUID;

public interface EventLookup {
    EventSnapshot getOpenEvent(UUID eventId);
}
