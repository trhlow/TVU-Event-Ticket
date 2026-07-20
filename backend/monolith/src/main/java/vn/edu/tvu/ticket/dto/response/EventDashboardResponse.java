package vn.edu.tvu.ticket.dto.response;

import java.util.UUID;

/**
 * Event operations KPIs for an organizer. {@code checkInRate} is checkedIn/approved and is null when no
 * reservation has been approved yet — the club-wide dashboard uses the same denominator, while the
 * school-wide {@link TicketStatsResponse} intentionally divides by tickets issued instead.
 */
public record EventDashboardResponse(UUID eventId, UUID clubId, int totalCapacity, int remaining,
        int approved, long checkedIn, Double checkInRate) {
}
