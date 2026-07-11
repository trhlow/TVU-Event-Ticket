package vn.edu.tvu.event.dto.request;

import jakarta.validation.constraints.*;
import java.time.Instant;

public record EventRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 5000) String description,
        @Positive int capacity,
        @NotNull Instant registrationOpenAt,
        @NotNull Instant registrationCloseAt,
        @NotNull Instant startAt,
        @NotNull Instant endAt,
        @NotBlank @Size(max = 300) String location) {
}
