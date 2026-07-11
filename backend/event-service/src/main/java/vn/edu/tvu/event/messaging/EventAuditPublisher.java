package vn.edu.tvu.event.messaging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.UUID;

@Component
public class EventAuditPublisher {
    private static final Logger log = LoggerFactory.getLogger(EventAuditPublisher.class);
    private final RabbitTemplate rabbitTemplate;

    public EventAuditPublisher(RabbitTemplate rabbitTemplate) { this.rabbitTemplate = rabbitTemplate; }

    public void publish(UUID actorId, UUID eventId, String action, String detail) {
        UUID messageId = UUID.randomUUID();
        AuditEventMessage message = new AuditEventMessage(actorId, action, "EVENT", eventId,
                detail, Instant.now());
        try {
            rabbitTemplate.convertAndSend(EventRabbitConfig.EXCHANGE, "audit.event." + action.toLowerCase(),
                    message, amqpMessage -> {
                        amqpMessage.getMessageProperties().setMessageId(messageId.toString());
                        amqpMessage.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                        return amqpMessage;
                    });
        } catch (RuntimeException ex) {
            log.warn("Could not publish event audit message action={} eventId={}", action, eventId, ex);
        }
    }
}
