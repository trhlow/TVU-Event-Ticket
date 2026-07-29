package vn.edu.tvu.auth.security;

import vn.edu.tvu.shared.domain.UserRole;

import java.util.UUID;

public record JwtSubject(
        UUID userId,
        String email,
        UserRole role,
        UUID clubId,
        String mssv,
        boolean mssvVerified,
        /**
         * The user's auth_version at mint time. Must be read in the same transaction that read the
         * user, otherwise a revocation landing in between produces a token that is stale the moment
         * it is issued.
         */
        long authVersion) {
}
