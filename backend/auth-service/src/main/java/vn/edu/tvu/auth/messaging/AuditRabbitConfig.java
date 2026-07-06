package vn.edu.tvu.auth.messaging;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuditRabbitConfig {

    public static final String EXCHANGE = "tvu.events";
    public static final String AUDIT_QUEUE = "audit.log";
    public static final String AUDIT_ROUTING_PATTERN = "audit.#";

    @Bean
    TopicExchange tvuEventsExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    Queue auditQueue() {
        return new Queue(AUDIT_QUEUE, true);
    }

    @Bean
    Binding auditBinding(Queue auditQueue, TopicExchange tvuEventsExchange) {
        return BindingBuilder.bind(auditQueue)
                .to(tvuEventsExchange)
                .with(AUDIT_ROUTING_PATTERN);
    }

    @Bean
    Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
