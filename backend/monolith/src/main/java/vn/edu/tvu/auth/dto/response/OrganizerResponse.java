package vn.edu.tvu.auth.dto.response;

import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.domain.UserStatus;

import java.util.UUID;

public record OrganizerResponse(
        UUID id,
        String email,
        String displayName,
        UserRole role,
        UUID clubId,
        UserStatus status) {
}
