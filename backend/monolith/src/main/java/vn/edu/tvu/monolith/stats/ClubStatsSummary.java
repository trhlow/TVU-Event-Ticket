package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.Map;
import java.util.UUID;

public record ClubStatsSummary(
        UUID clubId,
        String clubName,
        long totalEvents,
        Map<EventStatus, Long> eventsByStatus,
        long organizers,
        long ticketsIssued,
        long checkedIn,
        Double checkInRate) {
}
