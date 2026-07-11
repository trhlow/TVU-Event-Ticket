package vn.edu.tvu.event.dto.response;

import vn.edu.tvu.event.domain.EventStatus;
import java.time.Instant;
import java.util.UUID;

public record EventResponse(UUID id, UUID clubId, String title, String description, int capacity,
                            Instant registrationOpenAt, Instant registrationCloseAt, Instant startAt,
                            Instant endAt, String location, EventStatus status, UUID createdBy,
                            Instant createdAt, Instant updatedAt) {}
