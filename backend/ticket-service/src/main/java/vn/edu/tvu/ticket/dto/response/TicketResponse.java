package vn.edu.tvu.ticket.dto.response;

import vn.edu.tvu.ticket.domain.TicketStatus;

import java.time.Instant;
import java.util.UUID;

public record TicketResponse(UUID id, UUID reservationId, UUID eventId, UUID studentId,
        TicketStatus status, Instant issuedAt, Instant checkedInAt) {
}
