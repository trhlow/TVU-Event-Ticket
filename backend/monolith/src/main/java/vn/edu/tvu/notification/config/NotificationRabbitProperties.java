package vn.edu.tvu.notification.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.rabbit")
public record NotificationRabbitProperties(
        String queue,
        String routingKey,
        String deadLetterExchange,
        String deadLetterQueue,
        String retryQueue,
        Duration retryDelay,
        int maxRetries) {

    public NotificationRabbitProperties {
        require(queue, "RabbitMQ queue");
        require(routingKey, "RabbitMQ routing key");
        require(deadLetterExchange, "RabbitMQ dead-letter exchange");
        require(deadLetterQueue, "RabbitMQ dead-letter queue");
        require(retryQueue, "RabbitMQ retry queue");
        if (retryDelay == null || retryDelay.isNegative() || retryDelay.isZero()) {
            throw new IllegalArgumentException("RabbitMQ retry delay must be positive");
        }
        if (maxRetries < 1) {
            throw new IllegalArgumentException("RabbitMQ max retries must be at least 1");
        }
    }

    private static void require(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " is required");
    }
}
