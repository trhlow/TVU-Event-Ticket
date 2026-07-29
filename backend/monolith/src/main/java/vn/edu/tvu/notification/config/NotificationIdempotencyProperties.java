package vn.edu.tvu.notification.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.idempotency")
/**
 * @param leaseTtl how long a delivery claim stays valid before the reconciler treats it as
 *                 abandoned. Must comfortably exceed the SMTP timeout — a lease that expires while
 *                 a send is merely slow manufactures UNKNOWN rows for deliveries that were fine,
 *                 and each of those costs a human an investigation.
 */
public record NotificationIdempotencyProperties(Duration lockTtl, Duration leaseTtl) {

    public NotificationIdempotencyProperties {
        if (lockTtl == null || lockTtl.isNegative() || lockTtl.isZero()) {
            throw new IllegalArgumentException("Notification lock TTL must be positive");
        }
        if (leaseTtl == null || leaseTtl.isNegative() || leaseTtl.isZero()) {
            throw new IllegalArgumentException("Notification lease TTL must be positive");
        }
    }
}
