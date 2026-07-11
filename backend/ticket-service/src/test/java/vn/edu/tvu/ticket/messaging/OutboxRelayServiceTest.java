package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutboxRelayServiceTest {

    @Mock
    private OutboxClaimService claimService;

    @Mock
    private RabbitTemplate rabbitTemplate;

    private OutboxRelayService service;

    @BeforeEach
    void setUp() {
        service = new OutboxRelayService(claimService, rabbitTemplate);
    }

    @Test
    void relayPendingMessages_publishesWithMessageIdAndMarksPublished() throws Exception {
        var message = persisted(OutboxMessage.pending("reservation", UUID.randomUUID(),
                "reservation.approved", "{\"reservationId\":\"r1\"}"));
        when(claimService.claim(org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of(message));

        service.relayPendingMessages();

        var processorCaptor = ArgumentCaptor.forClass(MessagePostProcessor.class);
        verify(rabbitTemplate).convertAndSend(eq(TicketRabbitConfig.EXCHANGE), eq("reservation.approved"),
                eq(message.getPayload()), processorCaptor.capture());
        var processed = processorCaptor.getValue().postProcessMessage(new Message(new byte[0]));
        assertThat(processed.getMessageProperties().getMessageId()).isEqualTo(message.getMessageId().toString());
        verify(claimService).markSent(message.getId());
    }

    @Test
    void relayPendingMessages_marksFailedWhenPublishFails() {
        var message = persisted(OutboxMessage.pending("audit", UUID.randomUUID(),
                "audit.ticket.approve", "{}"));
        when(claimService.claim(org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of(message));
        doThrow(new IllegalStateException("broker down")).when(rabbitTemplate)
                .convertAndSend(eq(TicketRabbitConfig.EXCHANGE), eq("audit.ticket.approve"),
                        eq(message.getPayload()), org.mockito.ArgumentMatchers.any(MessagePostProcessor.class));

        service.relayPendingMessages();

        verify(claimService).markRetryable(eq(message.getId()), eq("broker down"));
    }

    private static OutboxMessage persisted(OutboxMessage message) {
        ReflectionTestUtils.setField(message, "id", UUID.randomUUID());
        return message;
    }
}
