package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.nio.charset.StandardCharsets;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.MessagePropertiesBuilder;
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
        // outbox.payload is already-serialized JSON text; send its raw bytes directly rather than
        // convertAndSend(String), which would run it through the JSON MessageConverter a second time
        // and double-encode it into a quoted JSON string the consumer cannot deserialize.
        var properties = MessagePropertiesBuilder.newInstance()
                .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                .setMessageId(message.getMessageId().toString())
                .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                .build();
        var amqpMessage = new Message(message.getPayload().getBytes(StandardCharsets.UTF_8), properties);
        rabbitTemplate.invoke(operations -> {
            operations.send(TicketRabbitConfig.EXCHANGE, message.getRoutingKey(), amqpMessage);
            operations.waitForConfirmsOrDie(confirmTimeoutMillis);
            return null;
        });
    }
}
