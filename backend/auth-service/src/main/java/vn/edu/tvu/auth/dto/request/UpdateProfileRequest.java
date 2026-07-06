package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank @Size(max = 30) String mssv,
        @NotBlank @Size(max = 50) String classCode) {
}
