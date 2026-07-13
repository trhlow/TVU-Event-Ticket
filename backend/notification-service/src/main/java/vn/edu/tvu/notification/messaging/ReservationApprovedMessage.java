package vn.edu.tvu.notification.messaging;

import java.util.UUID;

public record ReservationApprovedMessage(
        UUID reservationId,
        UUID ticketId,
        UUID eventId,
        UUID studentId,
        String studentEmail,
        String studentMssv,
        String eventTitle,
        String eventStartAt,
        String eventEndAt,
        String eventLocation) {
}
