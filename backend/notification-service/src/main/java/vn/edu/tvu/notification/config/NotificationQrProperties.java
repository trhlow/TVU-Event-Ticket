package vn.edu.tvu.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.qr")
public record NotificationQrProperties(String signingSecret) {

    public NotificationQrProperties {
        if (signingSecret == null || signingSecret.length() < 32) {
            throw new IllegalArgumentException("QR signing secret must contain at least 32 characters");
        }
    }
}
