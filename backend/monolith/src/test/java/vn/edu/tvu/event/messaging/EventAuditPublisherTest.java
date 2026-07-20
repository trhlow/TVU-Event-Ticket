package vn.edu.tvu.event.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessagePostProcessor;

class EventAuditPublisherTest {
    @Test
    void publishesExpectedRoutingKeyAndStableMessageId() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        EventAuditPublisher publisher = new EventAuditPublisher(template);
        UUID eventId = UUID.randomUUID();

        publisher.publish(UUID.randomUUID(), eventId, "STATUS_CHANGED", "OPEN");

        ArgumentCaptor<AuditEventMessage> payload = ArgumentCaptor.forClass(AuditEventMessage.class);
        ArgumentCaptor<MessagePostProcessor> postProcessor = ArgumentCaptor.forClass(MessagePostProcessor.class);
        verify(template).convertAndSend(eq(EventRabbitConfig.EXCHANGE), eq("audit.event.status_changed"),
                payload.capture(), postProcessor.capture());
        Message message = new Message(new byte[0]);
        postProcessor.getValue().postProcessMessage(message);
        assertThat(payload.getValue().targetId()).isEqualTo(eventId);
        assertThat(payload.getValue().action()).isEqualTo("STATUS_CHANGED");
        assertThat(message.getMessageProperties().getMessageId()).isNotBlank();
    }

    @Test
    void brokerFailureDoesNotFailBusinessOperation() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        doThrow(new IllegalStateException("broker down")).when(template)
                .convertAndSend(anyString(), anyString(), any(), any(org.springframework.amqp.core.MessagePostProcessor.class));
        EventAuditPublisher publisher = new EventAuditPublisher(template);
        assertThatCode(() -> publisher.publish(UUID.randomUUID(), UUID.randomUUID(), "CREATED", "event"))
                .doesNotThrowAnyException();
    }
}
