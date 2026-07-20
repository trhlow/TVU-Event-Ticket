package vn.edu.tvu.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.bootstrap")
public record BootstrapAdminProperties(String email) {

    public boolean hasEmail() {
        return email != null && !email.isBlank();
    }

    public String normalizedEmail() {
        return hasEmail() ? email.trim().toLowerCase() : null;
    }
}
