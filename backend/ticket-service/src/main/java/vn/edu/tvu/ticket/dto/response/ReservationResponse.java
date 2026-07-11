package vn.edu.tvu.ticket.dto.response;

import vn.edu.tvu.ticket.domain.ReservationStatus;

import java.time.Instant;
import java.util.UUID;

public record ReservationResponse(
        UUID id,
        UUID eventId,
        UUID clubId,
        UUID studentId,
        String studentEmail,
        String studentMssv,
        String eventTitle,
        Instant eventStartAt,
        Instant eventEndAt,
        String eventLocation,
        ReservationStatus status,
        Instant requestedAt,
        Instant reviewedAt,
        UUID reviewedBy,
        UUID ticketId) {
}
