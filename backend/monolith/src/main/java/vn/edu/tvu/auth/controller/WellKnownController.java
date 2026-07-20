package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;

import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Discovery", description = "JWKS and minimal OIDC discovery")
public class WellKnownController {

    private final JwtProperties properties;
    private final RsaKeyManager keyManager;

    public WellKnownController(JwtProperties properties, RsaKeyManager keyManager) {
        this.properties = properties;
        this.keyManager = keyManager;
    }

    @GetMapping("/.well-known/jwks.json")
    @Operation(summary = "Return the monolith public JWKS")
    public Map<String, Object> jwks() {
        return keyManager.publicJwks();
    }

    @GetMapping("/.well-known/openid-configuration")
    @Operation(summary = "Return minimal OIDC discovery metadata")
    public Map<String, Object> openidConfiguration() {
        return Map.of(
                "issuer", properties.issuer(),
                "jwks_uri", properties.issuer() + "/.well-known/jwks.json",
                "subject_types_supported", List.of("public"),
                "id_token_signing_alg_values_supported", List.of("RS256"));
    }
}
