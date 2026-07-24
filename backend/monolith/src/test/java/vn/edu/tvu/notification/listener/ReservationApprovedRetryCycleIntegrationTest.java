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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import tools.jackson.databind.ObjectMapper;
import vn.edu.tvu.MonolithApplication;
import vn.edu.tvu.shared.messaging.MessagingProperties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

/**
 * Proves the whole H3 topology end to end against real RabbitMQ + Redis: a delivery that finds the
 * idempotency lock held is parked on the retry queue, its TTL expires it back onto the main queue, and once
 * the lock is gone it is processed exactly once — never reaching the DLQ. lock-ttl and retry-delay are
 * shrunk to seconds (keeping retry-delay > lock-ttl, which startup validation enforces) so the cycle runs
 * in a test's lifetime instead of the 2m/3m production defaults.
 */
@SpringBootTest(classes = MonolithApplication.class, properties = {
        "tvu.notification.idempotency.lock-ttl=PT2S",
        "tvu.notification.rabbit.retry-delay=PT4S"
})
class ReservationApprovedRetryCycleIntegrationTest extends AbstractRabbitIntegrationTest {

    @MockitoBean TicketMailSender mailSender;

    @Autowired RabbitTemplate rabbitTemplate;
    @Autowired StringRedisTemplate redisTemplate;
    @Autowired NotificationRabbitProperties properties;
    @Autowired MessagingProperties messaging;
    @Autowired ObjectMapper objectMapper;
    @Autowired MeterRegistry meterRegistry;

    @Test
    void lockedDeliveryIsRetriedFromTheRetryQueueAfterTheLockExpires() throws Exception {
        var messageId = UUID.randomUUID();
        doAnswer(invocation -> null).when(mailSender).send(any(), any());

        // A peer holds the idempotency lock; it expires (2s) before the retry message returns (4s).
        redisTemplate.opsForValue().set("notification:lock:" + messageId, "peer-owner", Duration.ofSeconds(2));

        publish(messageId, message());

        // First pass finds the lock held, so nothing is delivered and nothing is dead-lettered yet.
        verify(mailSender, after(TimeUnit.SECONDS.toMillis(2)).never()).send(any(), any());
        // The retry queue returns it after its TTL and, the lock now gone, it is delivered exactly once.
        verify(mailSender, timeout(TimeUnit.SECONDS.toMillis(20)).times(1)).send(any(), any());
        awaitDoneKey(messageId);
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

    private void awaitDoneKey(UUID messageId) throws InterruptedException {
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (Boolean.TRUE.equals(redisTemplate.hasKey("notification:done:" + messageId))) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Expected notification done key");
    }

    private ReservationApprovedMessage message() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }
}
