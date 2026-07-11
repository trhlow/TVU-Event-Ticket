package vn.edu.tvu.ticket.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CheckInRequest(@NotBlank String qrPayload) {
}
