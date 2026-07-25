package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record OtpRequest(@NotBlank @Email String email) {
}
