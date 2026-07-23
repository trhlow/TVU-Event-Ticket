package vn.edu.tvu.notification.config;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationRabbitConfigTest {

    private final NotificationRabbitProperties properties = new NotificationRabbitProperties(
            "notification.reservation-approved", "reservation.approved",
            "tvu.events.notification.dlx", "notification.reservation-approved.dlq");
    private final NotificationRabbitConfig config = new NotificationRabbitConfig(properties,
            new vn.edu.tvu.shared.messaging.MessagingProperties("tvu.events"));

    @Test
    void declaresDurableMainQueueWithDeadLetterRouting() {
        Queue queue = config.notificationQueue();

        assertThat(queue.getName()).isEqualTo("notification.reservation-approved");
        assertThat(queue.isDurable()).isTrue();
        assertThat(queue.getArguments())
                .containsEntry("x-dead-letter-exchange", "tvu.events.notification.dlx")
                .containsEntry("x-dead-letter-routing-key", "notification.reservation-approved.dlq");
    }

    @Test
    void declaresDurableDeadLetterQueueAndExchange() {
        Queue deadLetterQueue = config.notificationDeadLetterQueue();
        DirectExchange deadLetterExchange = config.notificationDeadLetterExchange();

        assertThat(deadLetterQueue.getName()).isEqualTo("notification.reservation-approved.dlq");
        assertThat(deadLetterQueue.isDurable()).isTrue();
        assertThat(deadLetterExchange.getName()).isEqualTo("tvu.events.notification.dlx");
        assertThat(deadLetterExchange.isDurable()).isTrue();
    }
}
