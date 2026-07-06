package vn.edu.tvu.auth.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.csrf")
public record CsrfProperties(String signingSecret) {

    public CsrfProperties {
        if (signingSecret == null || signingSecret.isBlank()) {
            signingSecret = "dev-csrf-signing-secret-change-me";
        }
    }
}
