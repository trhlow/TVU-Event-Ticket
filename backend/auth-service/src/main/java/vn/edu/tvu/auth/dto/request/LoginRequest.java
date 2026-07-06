package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank String credential, String displayName) {
}
