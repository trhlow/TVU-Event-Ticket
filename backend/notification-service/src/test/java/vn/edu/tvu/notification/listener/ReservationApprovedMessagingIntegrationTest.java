package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.config.NotificationRabbitProperties;
import vn.edu.tvu.notification.messaging.ReservationApprovedMessage;
import vn.edu.tvu.notification.service.TicketMailSender;
import vn.edu.tvu.notification.support.AbstractRabbitIntegrationTest;

import io.micrometer.core.instrument.MeterRegistry;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

@SpringBootTest
class ReservationApprovedMessagingIntegrationTest extends AbstractRabbitIntegrationTest {

    @MockitoBean TicketMailSender mailSender;

    @org.springframework.beans.factory.annotation.Autowired RabbitTemplate rabbitTemplate;
    @org.springframework.beans.factory.annotation.Autowired StringRedisTemplate redisTemplate;
    @org.springframework.beans.factory.annotation.Autowired NotificationRabbitProperties properties;
    @org.springframework.beans.factory.annotation.Autowired MeterRegistry meterRegistry;
    @org.springframework.beans.factory.annotation.Autowired ObjectMapper objectMapper;

    @Test
    void deliversOnceAndSkipsRedeliveryWithTheSameMessageId() throws Exception {
        var messageId = UUID.randomUUID();
        var message = message();
        doAnswer(invocation -> null).when(mailSender).send(any(), any());

        publish(messageId, message);
        verify(mailSender, timeout(TimeUnit.SECONDS.toMillis(10)).times(1)).send(any(), any());
        awaitDoneKey(messageId);

        publish(messageId, message);
        verify(mailSender, after(1000).times(1)).send(any(), any());
    }

    @Test
    void failedMailDoesNotCreateDoneKeyAndReachesDlqMetric() throws Exception {
        var messageId = UUID.randomUUID();
        doThrow(new IllegalStateException("smtp unavailable")).when(mailSender).send(any(), any());

        publish(messageId, message());
        verify(mailSender, timeout(TimeUnit.SECONDS.toMillis(10)).times(1)).send(any(), any());
        awaitDlqMetric();

        assertThat(redisTemplate.hasKey("notification:done:" + messageId)).isFalse();
    }

    private void publish(UUID messageId, ReservationApprovedMessage message) throws Exception {
        var amqpMessage = MessageBuilder.withBody(objectMapper.writeValueAsBytes(message))
                .setContentType("application/json")
                .setMessageId(messageId.toString())
                .build();
        rabbitTemplate.send(properties.exchange(), properties.routingKey(), amqpMessage);
    }

    private void awaitDlqMetric() throws InterruptedException {
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (meterRegistry.find("notification.messages.dlq").counter() != null
                    && meterRegistry.find("notification.messages.dlq").counter().count() > 0) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Expected notification message to reach the DLQ");
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
