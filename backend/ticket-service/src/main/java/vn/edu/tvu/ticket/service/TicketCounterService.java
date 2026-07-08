package vn.edu.tvu.ticket.service;

import java.util.UUID;

public interface TicketCounterService {

    void initialize(UUID eventId, int remainingTickets);

    boolean tryReserve(UUID eventId);

    void release(UUID eventId);
}
