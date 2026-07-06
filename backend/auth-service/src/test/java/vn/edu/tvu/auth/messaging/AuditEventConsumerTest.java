package vn.edu.tvu.auth.messaging;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.repository.AuditLogRepository;
import vn.edu.tvu.auth.service.AuditLogService;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.MessageProperties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuditEventConsumerTest {

    @Mock
    private AuditLogRepository auditLogRepository;

    private AuditEventConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new AuditEventConsumer(new AuditLogService(auditLogRepository));
    }

    @Test
    void handle_recordsAuditLogWithAmqpMessageId() {
        var messageId = UUID.randomUUID();
        var actorId = UUID.randomUUID();
        var targetId = UUID.randomUUID();
        var event = new AuditEventMessage(actorId, "event.create", "event", targetId, "{\"title\":\"Demo\"}",
                Instant.parse("2026-07-02T09:00:00Z"));
        var properties = new MessageProperties();
        properties.setMessageId(messageId.toString());
        when(auditLogRepository.countByMessageId(messageId)).thenReturn(0L);

        consumer.handle(event, properties);

        var captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getMessageId()).isEqualTo(messageId);
        assertThat(captor.getValue().getActorId()).isEqualTo(actorId);
        assertThat(captor.getValue().getAction()).isEqualTo("event.create");
        assertThat(captor.getValue().getTargetId()).isEqualTo(targetId);
    }

    @Test
    void handle_ignoresDuplicateMessageId() {
        var messageId = UUID.randomUUID();
        var event = new AuditEventMessage(UUID.randomUUID(), "event.create", "event", UUID.randomUUID(), "{}",
                Instant.now());
        var properties = new MessageProperties();
        properties.setMessageId(messageId.toString());
        when(auditLogRepository.countByMessageId(messageId)).thenReturn(1L);

        consumer.handle(event, properties);

        verify(auditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
