package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WellKnownControllerTest {

    @Test
    void jwks_returnsPublicRsaSigningKey() {
        var properties = new JwtProperties(
                "http://localhost:8084",
                Duration.ofMinutes(15),
                "dev-key",
                null,
                null);
        var controller = new WellKnownController(properties, RsaKeyManager.generate(properties.keyId()));

        var body = controller.jwks();

        assertThat(body).containsKey("keys");
        var keys = (List<Map<String, Object>>) body.get("keys");
        assertThat(keys).hasSize(1);
        assertThat(keys.getFirst())
                .containsEntry("kty", "RSA")
                .containsEntry("kid", "dev-key")
                .containsEntry("use", "sig")
                .containsEntry("alg", "RS256");
        assertThat(keys.getFirst()).containsKeys("n", "e");
    }

    @Test
    void openidConfiguration_returnsMinimalDiscoveryDocument() {
        var properties = new JwtProperties(
                "http://localhost:8084",
                Duration.ofMinutes(15),
                "dev-key",
                null,
                null);
        var controller = new WellKnownController(properties, RsaKeyManager.generate(properties.keyId()));

        var body = controller.openidConfiguration();

        assertThat(body)
                .containsEntry("issuer", "http://localhost:8084")
                .containsEntry("jwks_uri", "http://localhost:8084/.well-known/jwks.json");
        assertThat((List<String>) body.get("id_token_signing_alg_values_supported"))
                .containsExactly("RS256");
    }
}
