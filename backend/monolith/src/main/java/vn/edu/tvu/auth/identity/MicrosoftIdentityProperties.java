package vn.edu.tvu.auth.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.microsoft")
public record MicrosoftIdentityProperties(
        String clientId,
        String tenantId,
        String issuerHost,
        String jwksUri) {

    public MicrosoftIdentityProperties {
        if (issuerHost == null || issuerHost.isBlank()) {
            issuerHost = "https://login.microsoftonline.com";
        }
        if (jwksUri == null || jwksUri.isBlank()) {
            jwksUri = "https://login.microsoftonline.com/common/discovery/v2.0/keys";
        }
    }
}
