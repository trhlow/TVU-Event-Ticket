package vn.edu.tvu.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.notification.rabbit")
public record NotificationRabbitProperties(
        String exchange,
        String queue,
        String routingKey,
        String deadLetterExchange,
        String deadLetterQueue) {

    public NotificationRabbitProperties {
        require(exchange, "RabbitMQ exchange");
        require(queue, "RabbitMQ queue");
        require(routingKey, "RabbitMQ routing key");
        require(deadLetterExchange, "RabbitMQ dead-letter exchange");
        require(deadLetterQueue, "RabbitMQ dead-letter queue");
    }

    private static void require(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " is required");
    }
}
