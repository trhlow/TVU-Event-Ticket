package vn.edu.tvu.auth.dto.response;

import vn.edu.tvu.auth.domain.ClubStatus;

import java.time.Instant;
import java.util.UUID;

public record ClubResponse(
        UUID id,
        String name,
        String description,
        ClubStatus status,
        Instant createdAt) {
}
