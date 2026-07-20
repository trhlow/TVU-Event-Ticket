package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitOperations;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConfirmedRabbitPublisherTest {

    @Test
    void publishSendsRawPayloadBytesWithStableMessageIdPersistentDeliveryAndWaitsForConfirm() throws Exception {
        var template = mock(RabbitTemplate.class);
        var operations = mock(RabbitOperations.class);
        when(template.invoke(any())).thenAnswer(invocation -> {
            RabbitOperations.OperationsCallback<?> callback = invocation.getArgument(0);
            return callback.doInRabbit(operations);
        });
        var publisher = new ConfirmedRabbitPublisher(template, 3210);
        var outbox = OutboxMessage.pending("reservation", UUID.randomUUID(), "reservation.approved",
                "{\"eventId\":\"abc\"}");

        publisher.publish(outbox);

        // Must go through RabbitOperations#send with a pre-built Message, NOT convertAndSend(String, ...) —
        // the latter would run the already-serialized JSON payload through the MessageConverter a second
        // time and double-encode it into a quoted JSON string the consumer cannot deserialize.
        var messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(operations).send(eq(TicketRabbitConfig.EXCHANGE), eq("reservation.approved"), messageCaptor.capture());
        verify(operations).waitForConfirmsOrDie(3210);

        var message = messageCaptor.getValue();
        assertThat(new String(message.getBody(), StandardCharsets.UTF_8)).isEqualTo("{\"eventId\":\"abc\"}");
        assertThat(message.getMessageProperties().getContentType()).isEqualTo(MessageProperties.CONTENT_TYPE_JSON);
        assertThat(message.getMessageProperties().getMessageId()).isEqualTo(outbox.getMessageId().toString());
        assertThat(message.getMessageProperties().getDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
    }
}
