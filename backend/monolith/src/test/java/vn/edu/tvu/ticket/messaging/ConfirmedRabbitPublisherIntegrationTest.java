package vn.edu.tvu.ticket.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import vn.edu.tvu.notification.support.AbstractRabbitIntegrationTest;
import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Drives {@link ConfirmedRabbitPublisher} against a real broker.
 *
 * <p>The unit test for this class mocks {@code RabbitTemplate} and stubs {@code invoke()}, so it asserts
 * that {@code waitForConfirmsOrDie} is <em>called</em> but never that the call can succeed. It cannot:
 * {@code waitForConfirms} throws {@code IllegalStateException("Confirms not selected")} unless the
 * connection factory was configured to put channels in confirm mode, which is a property in
 * {@code application.yml}, not something a mock can express. That gap let a configuration miss reach
 * production, where every publish failed and the outbox relay retried the same rows forever.
 */
@SpringBootTest
@TestPropertySource(properties = {"spring.rabbitmq.listener.simple.auto-startup=false"})
class ConfirmedRabbitPublisherIntegrationTest extends AbstractRabbitIntegrationTest {

    @Autowired ConfirmedRabbitPublisher publisher;

    @Test
    void publishCompletesWhenBrokerConfirmsTheMessage() {
        var reservationId = UUID.randomUUID();
        var message = OutboxMessage.pending("reservation", reservationId, "reservation.approved",
                "{\"reservationId\":\"" + reservationId + "\"}");

        assertThatCode(() -> publisher.publish(message)).doesNotThrowAnyException();
    }
}
