package vn.edu.tvu.ticket.dto.response;

import java.time.Instant;
import java.util.UUID;

public record AttendeeResponse(UUID ticketId, UUID eventId, UUID studentId, String studentEmail,
        String studentMssv, String status, Instant issuedAt, Instant checkedInAt) {
}
