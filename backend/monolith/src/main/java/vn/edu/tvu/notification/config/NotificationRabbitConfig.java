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

    public NotificationRabbitConfig(NotificationRabbitProperties properties, MessagingProperties messaging) {
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
