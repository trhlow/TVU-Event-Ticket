package vn.edu.tvu.notification.listener;

import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.ReservationApprovedProcessor;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.MessageBuilder;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationApprovedListenerTest {

    @Mock ReservationApprovedProcessor processor;

    @Test
    void passesMessageIdAndPayloadToProcessor() throws Exception {
        var messageId = UUID.randomUUID();
        var payload = payload();
        when(processor.process(messageId, payload)).thenReturn(ReservationApprovedProcessor.Result.DELIVERED);
        var listener = new ReservationApprovedListener(new ObjectMapper(), processor);

        listener.consume(message(payload, messageId));

        verify(processor).process(messageId, payload);
    }

    @Test
    void rejectsMissingMessageIdMalformedPayloadAndActiveLock() throws Exception {
        var listener = new ReservationApprovedListener(new ObjectMapper(), processor);
        var payload = payload();
        var messageId = UUID.randomUUID();
        when(processor.process(messageId, payload)).thenReturn(ReservationApprovedProcessor.Result.IN_PROGRESS);

        assertThatThrownBy(() -> listener.consume(message(payload, null)))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
        assertThatThrownBy(() -> listener.consume(MessageBuilder.withBody("not-json".getBytes()).setMessageId(messageId.toString()).build()))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
        assertThatThrownBy(() -> listener.consume(message(payload, messageId)))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
    }

    private org.springframework.amqp.core.Message message(ReservationApprovedMessage payload, UUID messageId)
            throws Exception {
        var builder = MessageBuilder.withBody(new ObjectMapper().writeValueAsBytes(payload));
        if (messageId != null) {
            builder.setMessageId(messageId.toString());
        }
        return builder.build();
    }

    private ReservationApprovedMessage payload() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }
}
