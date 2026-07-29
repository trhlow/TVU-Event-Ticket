package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.config.NotificationRabbitProperties;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.TicketMailSender;
import vn.edu.tvu.notification.support.AbstractRabbitIntegrationTest;

import io.micrometer.core.instrument.MeterRegistry;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import vn.edu.tvu.notification.domain.DeliveryLedgerEntry;
import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.notification.repository.DeliveryLedgerRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import tools.jackson.databind.ObjectMapper;
import vn.edu.tvu.MonolithApplication;
import vn.edu.tvu.shared.messaging.MessagingProperties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

/**
 * Proves the whole retry topology end to end against real RabbitMQ + PostgreSQL: a delivery that
 * finds another worker's claim still live is parked on the retry queue, its TTL returns it to the
 * main queue, and once that claim has expired it is processed exactly once — never reaching the DLQ.
 *
 * <p>The lease now lives in the delivery ledger rather than in Redis, so the peer is simulated by a
 * PROCESSING row rather than by a Redis key. lease-ttl and retry-delay are shrunk to seconds so the
 * cycle completes inside a test instead of taking the 5m/3m production defaults.
 */
@SpringBootTest(classes = MonolithApplication.class, properties = {
        "tvu.notification.idempotency.lock-ttl=PT2S",
        "tvu.notification.idempotency.lease-ttl=PT2S",
        "tvu.notification.rabbit.retry-delay=PT4S",
        // Off: this test is about the retry cycle, and a reconciler running alongside would turn the
        // peer's expired claim into UNKNOWN, which is a different scenario with its own test.
        "tvu.notification.reconcile-delay=3600000"
})
class ReservationApprovedRetryCycleIntegrationTest extends AbstractRabbitIntegrationTest {

    @MockitoBean TicketMailSender mailSender;

    @Autowired RabbitTemplate rabbitTemplate;
    @Autowired DeliveryLedgerRepository ledger;
    @Autowired NotificationRabbitProperties properties;
    @Autowired MessagingProperties messaging;
    @Autowired ObjectMapper objectMapper;
    @Autowired MeterRegistry meterRegistry;

    @Test
    void claimedDeliveryIsRetriedFromTheRetryQueueAfterTheLeaseExpires() throws Exception {
        var messageId = UUID.randomUUID();
        when(mailSender.send(any(), any())).thenReturn(TicketMailSender.SendResult.accepted());

        // A peer holds a live claim; its lease runs out (2s) before the retry message returns (4s).
        var now = Instant.now();
        ledger.saveAndFlush(new DeliveryLedgerEntry(messageId, UUID.randomUUID(), now,
                now.plusSeconds(2)));

        publish(messageId, message());

        // First pass finds the claim live, so nothing is delivered and nothing is dead-lettered yet.
        verify(mailSender, after(TimeUnit.SECONDS.toMillis(2)).never()).send(any(), any());
        // The retry queue returns it, the lease has now expired, and it is delivered exactly once.
        verify(mailSender, timeout(TimeUnit.SECONDS.toMillis(20)).times(1)).send(any(), any());
        awaitStatus(messageId, DeliveryStatus.DELIVERED);
        verify(mailSender, after(1000).times(1)).send(any(), any());
        assertThat(meterRegistry.find("notification.messages.dlq").counter()).satisfiesAnyOf(
                counter -> assertThat(counter).isNull(),
                counter -> assertThat(counter.count()).isZero());
    }

    private void publish(UUID messageId, ReservationApprovedMessage message) throws Exception {
        var amqpMessage = MessageBuilder.withBody(objectMapper.writeValueAsBytes(message))
                .setContentType("application/json")
                .setMessageId(messageId.toString())
                .build();
        rabbitTemplate.send(messaging.exchange(), properties.routingKey(), amqpMessage);
    }

    private void awaitStatus(UUID messageId, DeliveryStatus expected) throws InterruptedException {
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < deadline) {
            if (ledger.findById(messageId).filter(e -> e.getStatus() == expected).isPresent()) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Expected ledger status " + expected + " for " + messageId);
    }

    private ReservationApprovedMessage message() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }
}
