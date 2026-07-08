package vn.edu.tvu.gateway.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.gateway.auth")
public record GatewayAuthProperties(String jwtCookieName) {

    public GatewayAuthProperties {
        if (jwtCookieName == null || jwtCookieName.isBlank()) {
            jwtCookieName = "TVU_AUTH";
        }
    }
}
