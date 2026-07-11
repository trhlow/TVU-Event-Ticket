package vn.edu.tvu.ticket.dto.response;

import java.util.UUID;

public record AvailabilityResponse(UUID eventId, int totalCapacity, int approvedCount, int remaining) {
}
