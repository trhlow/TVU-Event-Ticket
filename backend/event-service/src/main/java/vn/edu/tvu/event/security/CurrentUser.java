package vn.edu.tvu.event.security;

import org.springframework.security.oauth2.jwt.Jwt;
import java.util.UUID;

public record CurrentUser(UUID id, UUID clubId) {
    public static CurrentUser from(Jwt jwt) {
        String clubId = jwt.getClaimAsString("club_id");
        return new CurrentUser(UUID.fromString(jwt.getSubject()), clubId == null ? null : UUID.fromString(clubId));
    }
}
