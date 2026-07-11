package vn.edu.tvu.ticket.client;

import java.time.Instant;
import java.util.UUID;

public record EventSnapshot(
        UUID id,
        UUID clubId,
        String title,
        String description,
        int capacity,
        Instant registrationOpenAt,
        Instant registrationCloseAt,
        Instant startAt,
        Instant endAt,
        String location,
        String status,
        UUID createdBy,
        Instant createdAt,
        Instant updatedAt) {
}
