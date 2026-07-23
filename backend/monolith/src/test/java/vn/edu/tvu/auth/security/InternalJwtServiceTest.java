package vn.edu.tvu.auth.security;

import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.service.InternalJwtService;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;

class InternalJwtServiceTest {

    @Test
    void mint_createsRs256TokenWithContractClaimsAndUniqueJti() {
        var properties = new JwtProperties(
                "http://localhost:8084",
                Duration.ofMinutes(15),
                "test-key",
                null,
                null);
        var keyManager = RsaKeyManager.generate(properties.keyId());
        var service = new InternalJwtService(properties, keyManager);
        var userId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var subject = new JwtSubject(
                userId,
                "organizer@example.com",
                UserRole.ORGANIZER,
                clubId,
                "110122001",
                true);

        var first = service.mint(subject);
        var second = service.mint(subject);

        var decoder = NimbusJwtDecoder.withPublicKey(keyManager.publicKey()).build();
        var decoded = decoder.decode(first.value());
        var decodedAgain = decoder.decode(second.value());

        assertThat(decoded.getHeaders()).containsEntry("alg", "RS256");
        assertThat(decoded.getHeaders()).containsEntry("kid", "test-key");
        assertThat(decoded.getIssuer().toString()).isEqualTo("http://localhost:8084");
        assertThat(decoded.getSubject()).isEqualTo(userId.toString());
        assertThat(decoded.getClaimAsString("email")).isEqualTo("organizer@example.com");
        assertThat(decoded.getClaimAsStringList("roles")).containsExactly("ORGANIZER");
        assertThat(decoded.getClaimAsString("club_id")).isEqualTo(clubId.toString());
        assertThat(decoded.getClaimAsString("mssv")).isEqualTo("110122001");
        assertThat(decoded.getId()).isNotBlank();
        assertThat(decodedAgain.getId()).isNotEqualTo(decoded.getId());
        assertThat(first.expiresAt()).isEqualTo(decoded.getExpiresAt());
        assertThat(first.jti()).isEqualTo(decoded.getId());
    }

    @Test
    void mint_omitsOptionalClubAndMssvClaimsWhenAbsent() {
        var properties = new JwtProperties(
                "http://localhost:8084",
                Duration.ofMinutes(15),
                "test-key",
                null,
                null);
        var keyManager = RsaKeyManager.generate(properties.keyId());
        var service = new InternalJwtService(properties, keyManager);
        var subject = new JwtSubject(
                UUID.randomUUID(),
                "student@example.com",
                UserRole.SINH_VIEN,
                null,
                null,
                false);

        var decoded = NimbusJwtDecoder.withPublicKey(keyManager.publicKey())
                .build()
                .decode(service.mint(subject).value());

        assertThat(decoded.getClaimAsStringList("roles")).containsExactly("SINH_VIEN");
        assertThat(decoded.hasClaim("club_id")).isFalse();
        assertThat(decoded.hasClaim("mssv")).isFalse();
    }
}
