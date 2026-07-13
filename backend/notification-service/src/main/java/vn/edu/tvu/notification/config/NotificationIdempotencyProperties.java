package vn.edu.tvu.notification.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.idempotency")
public record NotificationIdempotencyProperties(Duration doneTtl, Duration lockTtl) {

    public NotificationIdempotencyProperties {
        if (doneTtl == null || doneTtl.isNegative() || doneTtl.isZero()) {
            throw new IllegalArgumentException("Notification done TTL must be positive");
        }
        if (lockTtl == null || lockTtl.isNegative() || lockTtl.isZero()) {
            throw new IllegalArgumentException("Notification lock TTL must be positive");
        }
    }
}
