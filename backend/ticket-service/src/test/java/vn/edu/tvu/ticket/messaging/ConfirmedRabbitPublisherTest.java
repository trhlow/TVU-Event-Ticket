package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessagePostProcessor;
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
    void publishUsesStableMessageIdPersistentDeliveryAndWaitsForConfirm() throws Exception {
        var template = mock(RabbitTemplate.class);
        var operations = mock(RabbitOperations.class);
        when(template.invoke(any())).thenAnswer(invocation -> {
            RabbitOperations.OperationsCallback<?> callback = invocation.getArgument(0);
            return callback.doInRabbit(operations);
        });
        var publisher = new ConfirmedRabbitPublisher(template, 3210);
        var outbox = OutboxMessage.pending("reservation", UUID.randomUUID(), "reservation.approved", "{}");

        publisher.publish(outbox);

        var processor = ArgumentCaptor.forClass(MessagePostProcessor.class);
        verify(operations).convertAndSend(eq(TicketRabbitConfig.EXCHANGE), eq("reservation.approved"),
                eq("{}"), processor.capture());
        verify(operations).waitForConfirmsOrDie(3210);
        var message = processor.getValue().postProcessMessage(new Message(new byte[0]));
        assertThat(message.getMessageProperties().getMessageId()).isEqualTo(outbox.getMessageId().toString());
        assertThat(message.getMessageProperties().getDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
    }
}
