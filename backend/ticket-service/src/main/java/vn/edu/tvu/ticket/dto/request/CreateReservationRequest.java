package vn.edu.tvu.ticket.dto.request;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record CreateReservationRequest(
        @NotNull UUID eventId) {

    public CreateReservationRequest(UUID eventId, UUID ignoredClientClubId) {
        this(eventId);
    }
}
