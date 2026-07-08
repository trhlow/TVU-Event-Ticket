package vn.edu.tvu.ticket.dto.request;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public record InitializeTicketInventoryRequest(
        @NotNull UUID eventId,
        @NotNull UUID clubId,
        @Min(1) int totalCapacity,
        @NotBlank @Size(max = 255) String eventTitle,
        @NotNull Instant eventStartAt,
        @NotNull @Future Instant eventEndAt,
        @NotBlank @Size(max = 255) String eventLocation) {
}
