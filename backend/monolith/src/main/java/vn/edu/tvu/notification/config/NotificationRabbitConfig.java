package vn.edu.tvu.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import vn.edu.tvu.shared.messaging.MessagingProperties;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableRabbit
@EnableConfigurationProperties({
        NotificationRabbitProperties.class,
        NotificationQrProperties.class,
        NotificationMailProperties.class,
        NotificationIdempotencyProperties.class,
        MessagingProperties.class
})
public class NotificationRabbitConfig {

    private final NotificationRabbitProperties properties;
    private final MessagingProperties messaging;

    public NotificationRabbitConfig(NotificationRabbitProperties properties, MessagingProperties messaging,
                                    NotificationIdempotencyProperties idempotency) {
        // The retry queue parks a still-locked delivery for retry-delay, then dead-letters it back to the
        // main queue. If that delay does not outlast the idempotency lock TTL, the message returns while the
        // lock is still held, is seen as IN_PROGRESS again, and (once retries run out) a perfectly valid
        // notification is dead-lettered. A misconfigured production override must fail startup, not silently
        // shrink the safety margin the default 3m-vs-2m encodes.
        if (properties.retryDelay().compareTo(idempotency.lockTtl()) <= 0) {
            throw new IllegalStateException(
                    "tvu.notification.rabbit.retry-delay (" + properties.retryDelay() + ") must be greater than "
                    + "tvu.notification.idempotency.lock-ttl (" + idempotency.lockTtl() + ")");
        }
        this.properties = properties;
        this.messaging = messaging;
    }

    /** The single {@code tvu.events} exchange. Every feature that publishes or binds uses this bean. */
    @Bean
    TopicExchange tvuEventsExchange() {
        return new TopicExchange(messaging.exchange(), true, false);
    }

    @Bean
    DirectExchange notificationDeadLetterExchange() {
        return new DirectExchange(properties.deadLetterExchange(), true, false);
    }

    @Bean
    Queue notificationQueue() {
        return QueueBuilder.durable(properties.queue())
                .withArgument("x-dead-letter-exchange", properties.deadLetterExchange())
                .withArgument("x-dead-letter-routing-key", properties.deadLetterQueue())
                .build();
    }

    @Bean
    Queue notificationDeadLetterQueue() {
        return QueueBuilder.durable(properties.deadLetterQueue()).build();
    }

    /**
     * Holding pen for deliveries that found the idempotency lock still held (a crashed or in-flight peer).
     * Messages sit here for {@code retry-delay} — deliberately longer than the lock TTL — then expire and
     * dead-letter back onto the main queue via the {@code tvu.events} exchange for another attempt. This is
     * what stops a lock held by a crashed consumer from routing a perfectly good ticket email straight to
     * the DLQ. Producers publish here through the default exchange, so no binding is declared.
     */
    @Bean
    Queue notificationRetryQueue() {
        return QueueBuilder.durable(properties.retryQueue())
                .withArgument("x-message-ttl", (int) properties.retryDelay().toMillis())
                .withArgument("x-dead-letter-exchange", messaging.exchange())
                .withArgument("x-dead-letter-routing-key", properties.routingKey())
                .build();
    }

    @Bean
    Binding notificationBinding(Queue notificationQueue, TopicExchange tvuEventsExchange) {
        return BindingBuilder.bind(notificationQueue)
                .to(tvuEventsExchange)
                .with(properties.routingKey());
    }

    @Bean
    Binding notificationDeadLetterBinding(
            Queue notificationDeadLetterQueue,
            DirectExchange notificationDeadLetterExchange) {
        return BindingBuilder.bind(notificationDeadLetterQueue)
                .to(notificationDeadLetterExchange)
                .with(properties.deadLetterQueue());
    }

}
