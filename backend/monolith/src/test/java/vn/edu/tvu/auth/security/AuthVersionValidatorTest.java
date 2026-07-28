package vn.edu.tvu.auth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The validator is the whole point of H8: a revoked session must stop working on the very
 * next request, while a session minted *after* the revocation must keep working. The old
 * boolean-in-Redis scheme got the second half wrong and locked users out for a full JWT TTL
 * after they signed out and signed back in.
 */
class AuthVersionValidatorTest {

    private static final UUID USER_ID = UUID.randomUUID();

    private static Jwt jwtWith(Map<String, Object> claims) {
        var builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(USER_ID.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600));
        claims.forEach(builder::claim);
        return builder.build();
    }

    @Test
    @DisplayName("accepts a token whose auth_version equals the stored one")
    void acceptsMatchingVersion() {
        var validator = new AuthVersionValidator(userId -> Optional.of(7L));

        var result = validator.validate(jwtWith(Map.of("auth_version", 7L)));

        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    @DisplayName("rejects a token minted before a revocation bumped the version")
    void rejectsStaleVersion() {
        var validator = new AuthVersionValidator(userId -> Optional.of(8L));

        var result = validator.validate(jwtWith(Map.of("auth_version", 7L)));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    @DisplayName("accepts a token minted after the revocation, unlike the old boolean scheme")
    void acceptsTokenMintedAfterRevocation() {
        // This is the regression the whole change exists for: sign-out-all then sign in again
        // used to return 401 for up to a full JWT TTL because the Redis flag was still set.
        var validator = new AuthVersionValidator(userId -> Optional.of(8L));

        var result = validator.validate(jwtWith(Map.of("auth_version", 8L)));

        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    @DisplayName("rejects a token that carries no auth_version claim at all")
    void rejectsMissingClaim() {
        // Tokens minted before this change have no claim. Treating "absent" as 0 would let
        // every one of them through; they must be rejected instead.
        var validator = new AuthVersionValidator(userId -> Optional.of(0L));

        var result = validator.validate(jwtWith(Map.of("email", "a@tvu.edu.vn")));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    @DisplayName("rejects when the user no longer exists")
    void rejectsUnknownUser() {
        var validator = new AuthVersionValidator(userId -> Optional.empty());

        var result = validator.validate(jwtWith(Map.of("auth_version", 0L)));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    @DisplayName("rejects when the lookup fails — fail closed, never fail open")
    void rejectsWhenLookupThrows() {
        // A database outage must not turn into "everyone is authenticated".
        var validator = new AuthVersionValidator(userId -> {
            throw new IllegalStateException("database down");
        });

        var result = validator.validate(jwtWith(Map.of("auth_version", 0L)));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    @DisplayName("rejects a token whose subject is not a user id")
    void rejectsUnparsableSubject() {
        var validator = new AuthVersionValidator(userId -> Optional.of(0L));
        var jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("not-a-uuid")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600))
                .claim("auth_version", 0L)
                .build();

        assertThat(validator.validate(jwt).hasErrors()).isTrue();
    }
}
