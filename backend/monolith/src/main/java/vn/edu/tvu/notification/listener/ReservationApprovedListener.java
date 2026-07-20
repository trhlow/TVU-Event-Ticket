package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.ReservationApprovedProcessor;

import java.util.UUID;

import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

@Component
@Lazy(false)
public class ReservationApprovedListener {

    private final ObjectMapper objectMapper;
    private final ReservationApprovedProcessor processor;

    public ReservationApprovedListener(ObjectMapper objectMapper, ReservationApprovedProcessor processor) {
        this.objectMapper = objectMapper;
        this.processor = processor;
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
                throw new AmqpRejectAndDontRequeueException("Reservation notification is already being processed");
            }
        } catch (AmqpRejectAndDontRequeueException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new IllegalStateException("Reservation notification could not be processed", ex);
        }
    }
}
