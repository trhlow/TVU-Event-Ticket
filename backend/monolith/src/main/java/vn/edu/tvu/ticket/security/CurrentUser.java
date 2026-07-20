package vn.edu.tvu.ticket.security;

import java.util.List;
import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

public record CurrentUser(
        UUID userId,
        String email,
        UserRole role,
        UUID clubId,
        String mssv) {

    public static CurrentUser from(Jwt jwt) {
        var roles = jwt.getClaimAsStringList("roles");
        if (roles == null || roles.isEmpty()) {
            roles = List.of();
        }
        var role = roles.isEmpty() ? null : UserRole.valueOf(roles.getFirst());
        var clubId = jwt.getClaimAsString("club_id");
        return new CurrentUser(
                UUID.fromString(jwt.getSubject()),
                jwt.getClaimAsString("email"),
                role,
                clubId == null || clubId.isBlank() ? null : UUID.fromString(clubId),
                jwt.getClaimAsString("mssv"));
    }
}
