package vn.edu.tvu.auth.dto.response;

import vn.edu.tvu.shared.domain.UserRole;

import java.util.UUID;

public record AuthProfileResponse(
        UUID id,
        String email,
        String displayName,
        UserRole role,
        UUID clubId,
        String mssv,
        String classCode,
        boolean profileComplete) {
}
