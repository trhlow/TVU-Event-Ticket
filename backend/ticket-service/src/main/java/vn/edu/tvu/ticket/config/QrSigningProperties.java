package vn.edu.tvu.ticket.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.ticket.qr")
public record QrSigningProperties(String secret) {
    public QrSigningProperties {
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("QR signing secret must contain at least 32 characters");
        }
    }
}
