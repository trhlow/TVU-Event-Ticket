package vn.edu.tvu.ticket.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record InitializeTicketInventoryRequest(
        @NotNull UUID eventId) {
}
