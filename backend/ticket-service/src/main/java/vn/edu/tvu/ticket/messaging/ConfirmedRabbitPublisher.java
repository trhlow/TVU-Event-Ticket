package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ConfirmedRabbitPublisher {

    private final RabbitTemplate rabbitTemplate;
    private final long confirmTimeoutMillis;

    public ConfirmedRabbitPublisher(
            RabbitTemplate rabbitTemplate,
            @Value("${tvu.ticket.outbox.confirm-timeout:5000}") long confirmTimeoutMillis) {
        this.rabbitTemplate = rabbitTemplate;
        this.confirmTimeoutMillis = confirmTimeoutMillis;
    }

    public void publish(OutboxMessage message) {
        rabbitTemplate.invoke(operations -> {
            operations.convertAndSend(
                    TicketRabbitConfig.EXCHANGE,
                    message.getRoutingKey(),
                    message.getPayload(),
                    amqpMessage -> {
                        var properties = amqpMessage.getMessageProperties();
                        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                        properties.setMessageId(message.getMessageId().toString());
                        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                        return amqpMessage;
                    });
            operations.waitForConfirmsOrDie(confirmTimeoutMillis);
            return null;
        });
    }
}
