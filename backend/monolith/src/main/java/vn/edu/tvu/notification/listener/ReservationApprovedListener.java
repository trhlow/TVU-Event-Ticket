package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.config.NotificationRabbitProperties;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.ReservationApprovedProcessor;

import java.util.UUID;

import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

@Component
@Lazy(false)
public class ReservationApprovedListener {

    static final String RETRY_HEADER = "x-notification-retries";

    private final ObjectMapper objectMapper;
    private final ReservationApprovedProcessor processor;
    private final RabbitTemplate rabbitTemplate;
    private final NotificationRabbitProperties properties;
    private final long confirmTimeoutMillis;

    public ReservationApprovedListener(ObjectMapper objectMapper, ReservationApprovedProcessor processor,
                                       RabbitTemplate rabbitTemplate, NotificationRabbitProperties properties,
                                       @Value("${tvu.notification.rabbit.confirm-timeout:5000}") long confirmTimeoutMillis) {
        this.objectMapper = objectMapper;
        this.processor = processor;
        this.rabbitTemplate = rabbitTemplate;
        this.properties = properties;
        this.confirmTimeoutMillis = confirmTimeoutMillis;
    }

    @RabbitListener(queues = "${tvu.notification.rabbit.queue}")
    public void consume(Message message) {
        UUID messageId;
        ReservationApprovedMessage payload;
        try {
            messageId = UUID.fromString(message.getMessageProperties().getMessageId());
            payload = objectMapper.readValue(message.getBody(), ReservationApprovedMessage.class);
        } catch (Exception ex) {
            throw new AmqpRejectAndDontRequeueException("Reservation notification payload is invalid", ex);
        }

        try {
            var result = processor.process(messageId, payload);
            if (result == ReservationApprovedProcessor.Result.IN_PROGRESS) {
                scheduleRetryOrDeadLetter(message);
            }
        } catch (AmqpRejectAndDontRequeueException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new IllegalStateException("Reservation notification could not be processed", ex);
        }
    }

    /**
     * The idempotency lock was held by another delivery — usually a peer still working, but possibly one
     * that crashed after locking and before marking done. Rejecting to the DLQ here would strand a valid
     * ticket email until someone replayed it by hand. Instead, park the message on the delayed retry queue
     * so it comes back after the lock's TTL. Only give up (DLQ) once it has stayed locked past maxRetries.
     *
     * <p>The publish is confirmed before returning (invoke + waitForConfirmsOrDie), mirroring
     * {@code ConfirmedRabbitPublisher}. The container acks the original message once this method returns
     * normally; if the retry copy were fire-and-forget and the broker dropped it before persisting, both
     * copies would be lost. An unconfirmed publish throws, so the original is redelivered instead.
     */
    private void scheduleRetryOrDeadLetter(Message message) {
        long attempts = retryAttempts(message);
        if (attempts >= properties.maxRetries()) {
            throw new AmqpRejectAndDontRequeueException(
                    "Reservation notification is still locked after " + attempts + " retries");
        }
        Message retryMessage = MessageBuilder.fromMessage(message)
                .setHeader(RETRY_HEADER, attempts + 1)
                .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                .build();
        rabbitTemplate.invoke(operations -> {
            operations.send("", properties.retryQueue(), retryMessage);
            operations.waitForConfirmsOrDie(confirmTimeoutMillis);
            return null;
        });
    }

    private long retryAttempts(Message message) {
        Object header = message.getMessageProperties().getHeader(RETRY_HEADER);
        return header instanceof Number number ? number.longValue() : 0L;
    }
}
