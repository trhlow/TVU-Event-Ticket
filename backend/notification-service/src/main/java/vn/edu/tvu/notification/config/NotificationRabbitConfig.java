package vn.edu.tvu.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableRabbit
@EnableConfigurationProperties({
        NotificationRabbitProperties.class,
        NotificationQrProperties.class,
        NotificationMailProperties.class,
        NotificationIdempotencyProperties.class
})
public class NotificationRabbitConfig {

    private final NotificationRabbitProperties properties;

    public NotificationRabbitConfig(NotificationRabbitProperties properties) {
        this.properties = properties;
    }

    @Bean
    TopicExchange notificationEventsExchange() {
        return new TopicExchange(properties.exchange(), true, false);
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
    Binding notificationBinding(Queue notificationQueue, TopicExchange notificationEventsExchange) {
        return BindingBuilder.bind(notificationQueue)
                .to(notificationEventsExchange)
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
