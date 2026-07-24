package vn.edu.tvu.notification.config;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationRabbitConfigTest {

    private final NotificationRabbitProperties properties = new NotificationRabbitProperties(
            "notification.reservation-approved", "reservation.approved",
            "tvu.events.notification.dlx", "notification.reservation-approved.dlq",
            "notification.reservation-approved.retry", Duration.ofMinutes(3), 5);
    private final NotificationIdempotencyProperties idempotency =
            new NotificationIdempotencyProperties(Duration.ofDays(30), Duration.ofMinutes(2));
    private final NotificationRabbitConfig config = new NotificationRabbitConfig(properties,
            new vn.edu.tvu.shared.messaging.MessagingProperties("tvu.events"), idempotency);

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
    void rejectsRetryDelayNotGreaterThanLockTtl() {
        var tooShort = new NotificationRabbitProperties(
                "notification.reservation-approved", "reservation.approved",
                "tvu.events.notification.dlx", "notification.reservation-approved.dlq",
                "notification.reservation-approved.retry", Duration.ofMinutes(2), 5);

        assertThatThrownBy(() -> new NotificationRabbitConfig(tooShort,
                new vn.edu.tvu.shared.messaging.MessagingProperties("tvu.events"), idempotency))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be greater than");
    }

    @Test
    void declaresDurableRetryQueueThatExpiresBackToTheMainExchange() {
        Queue retryQueue = config.notificationRetryQueue();

        assertThat(retryQueue.getName()).isEqualTo("notification.reservation-approved.retry");
        assertThat(retryQueue.isDurable()).isTrue();
        assertThat(retryQueue.getArguments())
                .containsEntry("x-message-ttl", (int) java.time.Duration.ofMinutes(3).toMillis())
                .containsEntry("x-dead-letter-exchange", "tvu.events")
                .containsEntry("x-dead-letter-routing-key", "reservation.approved");
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
