package vn.edu.tvu.auth.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.cookies")
public record AuthCookieProperties(
        String jwtName,
        String xsrfName,
        boolean secure,
        String sameSite,
        String path,
        Duration maxAge) {

    public AuthCookieProperties {
        if (jwtName == null || jwtName.isBlank()) {
            jwtName = "TVU_AUTH";
        }
        if (xsrfName == null || xsrfName.isBlank()) {
            xsrfName = "XSRF-TOKEN";
        }
        if (sameSite == null || sameSite.isBlank()) {
            sameSite = "Lax";
        }
        if (path == null || path.isBlank()) {
            path = "/";
        }
        if (maxAge == null) {
            maxAge = Duration.ofMinutes(15);
        }
    }
}
