package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateOrganizerRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Size(max = 255) String displayName,
        @NotNull UUID clubId) {
}
