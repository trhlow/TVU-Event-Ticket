package vn.edu.tvu.shared.messaging;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The one broker topology shared by every feature.
 *
 * <p>The exchange name used to be declared in three places — {@code AuditRabbitConfig},
 * {@code EventRabbitConfig} and {@code TicketRabbitConfig} each hard-coded the string
 * {@code "tvu.events"}, and {@code NotificationRabbitConfig} bound a fourth copy from its own
 * property. All four had to agree or messages would be published to an exchange nobody consumed,
 * and nothing in the build checked that they did.
 */
@ConfigurationProperties(prefix = "tvu.messaging")
public record MessagingProperties(String exchange) {

    public MessagingProperties {
        if (exchange == null || exchange.isBlank()) {
            throw new IllegalArgumentException("RabbitMQ exchange is required");
        }
    }
}
