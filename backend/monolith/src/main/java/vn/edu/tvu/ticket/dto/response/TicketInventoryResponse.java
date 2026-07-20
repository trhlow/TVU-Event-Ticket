package vn.edu.tvu.ticket.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TicketInventoryResponse(
        UUID id,
        UUID eventId,
        UUID clubId,
        int totalCapacity,
        int approvedCount,
        int remainingCount,
        String eventTitle,
        Instant eventStartAt,
        Instant eventEndAt,
        String eventLocation) {
}
