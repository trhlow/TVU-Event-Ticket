package vn.edu.tvu.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.mail")
public record NotificationMailProperties(String fromAddress, String fromName) {

    public NotificationMailProperties {
        if (fromAddress == null || fromAddress.isBlank()) {
            throw new IllegalArgumentException("Notification sender address is required");
        }
        if (fromName == null || fromName.isBlank()) {
            throw new IllegalArgumentException("Notification sender name is required");
        }
    }
}
