package vn.edu.tvu.ticket.service;

import java.util.UUID;

public interface TicketCounterService {

    void seedIfMissing(UUID eventId, int remainingTickets);

    /** Authoritatively overwrite the counter to match the value derived from PostgreSQL. */
    void reconcile(UUID eventId, int remainingTickets);

    boolean tryReserve(UUID eventId);

    void release(UUID eventId);

    int remaining(UUID eventId);
}
