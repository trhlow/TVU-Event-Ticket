package vn.edu.tvu.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Both fields are student-controlled and both end up in the organizer's CSV attendee export, so they are
 * constrained to an alphanumeric shape rather than length alone. The export escapes formula characters as
 * well ({@code TicketingService#csvCell}); this is the same rule enforced at the point of entry.
 */
public record UpdateProfileRequest(
        @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9]+", message = "MSSV chỉ gồm chữ và số")
        String mssv,
        @NotBlank @Size(max = 50) @Pattern(regexp = "[A-Za-z0-9._-]+", message = "Mã lớp chỉ gồm chữ, số, . _ -")
        String classCode) {
}
