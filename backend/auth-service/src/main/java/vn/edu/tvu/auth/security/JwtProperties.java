package vn.edu.tvu.auth.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.jwt")
public record JwtProperties(
        String issuer,
        Duration ttl,
        String keyId,
        String privateKeyPem,
        String publicKeyPem) {

    public JwtProperties {
        if (issuer == null || issuer.isBlank()) {
            issuer = "http://localhost:8084";
        }
        if (ttl == null) {
            ttl = Duration.ofMinutes(15);
        }
        if (keyId == null || keyId.isBlank()) {
            keyId = "auth-service-dev";
        }
    }
}
