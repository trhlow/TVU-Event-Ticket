package vn.edu.tvu.event.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EventAuditPublisherTest {
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
