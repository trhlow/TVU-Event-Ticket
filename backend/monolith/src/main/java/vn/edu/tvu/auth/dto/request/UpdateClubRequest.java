package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateClubRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 2000) String description) {
}
