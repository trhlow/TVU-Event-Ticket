package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.config.NotificationRabbitProperties;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.ReservationApprovedProcessor;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.core.RabbitOperations;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationApprovedListenerTest {

    private static final NotificationRabbitProperties PROPERTIES = new NotificationRabbitProperties(
            "notification.reservation-approved", "reservation.approved",
            "tvu.events.notification.dlx", "notification.reservation-approved.dlq",
            "notification.reservation-approved.retry", Duration.ofMinutes(3), 5);

    @Mock ReservationApprovedProcessor processor;
    @Mock RabbitTemplate rabbitTemplate;
    @Mock RabbitOperations rabbitOperations;

    private ReservationApprovedListener listener() {
        return new ReservationApprovedListener(new ObjectMapper(), processor, rabbitTemplate, PROPERTIES, 5000L);
    }

    /** Run the invoke(...) callback against the operations mock so the confirmed publish can be verified. */
    private void runInvokeCallbackOnOperations() {
        when(rabbitTemplate.invoke(any())).thenAnswer(invocation ->
                ((RabbitTemplate.OperationsCallback<?>) invocation.getArgument(0)).doInRabbit(rabbitOperations));
    }

    @Test
    void passesMessageIdAndPayloadToProcessorAndDoesNotRepublishOnDelivery() throws Exception {
        var messageId = UUID.randomUUID();
        var payload = payload();
        when(processor.process(messageId, payload)).thenReturn(ReservationApprovedProcessor.Result.DELIVERED);

        listener().consume(message(payload, messageId));

        verify(processor).process(messageId, payload);
        verify(rabbitTemplate, never()).invoke(any());
    }

    @Test
    void rejectsMissingMessageIdAndMalformedPayload() throws Exception {
        var payload = payload();

        assertThatThrownBy(() -> listener().consume(message(payload, null)))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
        assertThatThrownBy(() -> listener().consume(
                        MessageBuilder.withBody("not-json".getBytes()).setMessageId(UUID.randomUUID().toString()).build()))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
        verify(rabbitTemplate, never()).invoke(any());
    }

    @Test
    void lockedDeliveryIsParkedOnRetryQueueWithAConfirmedPersistentPublish() throws Exception {
        var messageId = UUID.randomUUID();
        var payload = payload();
        when(processor.process(messageId, payload)).thenReturn(ReservationApprovedProcessor.Result.IN_PROGRESS);
        runInvokeCallbackOnOperations();

        listener().consume(message(payload, messageId));

        var captor = ArgumentCaptor.forClass(Message.class);
        verify(rabbitOperations).send(eq(""), eq("notification.reservation-approved.retry"), captor.capture());
        verify(rabbitOperations).waitForConfirmsOrDie(anyLong());
        var retried = captor.getValue().getMessageProperties();
        Object retryHeader = retried.getHeader(ReservationApprovedListener.RETRY_HEADER);
        assertThat(retryHeader).isEqualTo(1L);
        assertThat(retried.getDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
    }

    @Test
    void lockedDeliveryDeadLettersOnceRetriesAreExhausted() throws Exception {
        var messageId = UUID.randomUUID();
        var payload = payload();
        when(processor.process(messageId, payload)).thenReturn(ReservationApprovedProcessor.Result.IN_PROGRESS);
        var exhausted = MessageBuilder.fromMessage(message(payload, messageId))
                .setHeader(ReservationApprovedListener.RETRY_HEADER, 5L)
                .build();

        assertThatThrownBy(() -> listener().consume(exhausted))
                .isInstanceOf(AmqpRejectAndDontRequeueException.class);
        verify(rabbitTemplate, never()).invoke(any());
    }

    private Message message(ReservationApprovedMessage payload, UUID messageId) throws Exception {
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
