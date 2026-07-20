package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.domain.UserRole;

import java.util.UUID;

public record JwtSubject(
        UUID userId,
        String email,
        UserRole role,
        UUID clubId,
        String mssv) {
}
