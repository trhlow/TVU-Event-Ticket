package vn.edu.tvu.auth.messaging;

import vn.edu.tvu.auth.service.AuditLogService;

import java.util.UUID;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

@Component
@Lazy(false)
public class AuditEventConsumer {

    private final AuditLogService auditLogService;

    public AuditEventConsumer(AuditLogService auditLogService) {
        this.auditLogService = auditLogService;
    }

    @RabbitListener(queues = AuditRabbitConfig.AUDIT_QUEUE)
    public void handle(AuditEventMessage event, Message message) {
        handle(event, message.getMessageProperties());
    }

    public void handle(AuditEventMessage event, MessageProperties properties) {
        var messageId = properties.getMessageId();
        if (messageId == null || messageId.isBlank()) {
            throw new IllegalArgumentException("Audit message-id is required");
        }
        auditLogService.recordMessage(UUID.fromString(messageId), event);
    }
}
