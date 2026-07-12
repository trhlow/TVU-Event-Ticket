package vn.edu.tvu.gateway.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.gateway.csrf")
public record GatewayCsrfProperties(String signingSecret) {

    public GatewayCsrfProperties {
        if (signingSecret == null || signingSecret.isBlank()) {
            throw new IllegalArgumentException("Gateway CSRF signing secret is required");
        }
    }
}
