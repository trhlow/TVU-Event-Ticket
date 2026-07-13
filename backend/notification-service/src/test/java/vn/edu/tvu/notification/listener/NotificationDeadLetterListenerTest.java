package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.service.NotificationMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.MessageBuilder;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationDeadLetterListenerTest {

    @Test
    void recordsDeadLetterWithoutRepublishingIt() {
        var registry = new SimpleMeterRegistry();
        var listener = new NotificationDeadLetterListener(new NotificationMetrics(registry));
        var message = MessageBuilder.withBody("invalid payload".getBytes())
                .setMessageId("18c8a8d0-33f6-460d-a4e7-154f72e8a9a9")
                .setReceivedRoutingKey("reservation.approved")
                .build();

        listener.consume(message);

        assertThat(registry.get("notification.messages.dlq").counter().count()).isEqualTo(1.0d);
    }
}
