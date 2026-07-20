package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutboxRelayServiceTest {

    @Mock
    private OutboxClaimService claimService;

    @Mock
    private ConfirmedRabbitPublisher publisher;

    private OutboxRelayService service;

    @BeforeEach
    void setUp() {
        service = new OutboxRelayService(claimService, publisher);
    }

    @Test
    void relayPendingMessages_publishesWithMessageIdAndMarksPublished() throws Exception {
        var message = persisted(OutboxMessage.pending("reservation", UUID.randomUUID(),
                "reservation.approved", "{\"reservationId\":\"r1\"}"));
        when(claimService.claim(org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of(message));

        service.relayPendingMessages();

        verify(publisher).publish(message);
        verify(claimService).markSent(eq(message.getId()), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void relayPendingMessages_marksFailedWhenPublishFails() {
        var message = persisted(OutboxMessage.pending("audit", UUID.randomUUID(),
                "audit.ticket.approve", "{}"));
        when(claimService.claim(org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of(message));
        doThrow(new IllegalStateException("broker down")).when(publisher).publish(message);

        service.relayPendingMessages();

        verify(claimService).markRetryable(eq(message.getId()), org.mockito.ArgumentMatchers.anyString(),
                eq("broker down"));
    }

    private static OutboxMessage persisted(OutboxMessage message) {
        ReflectionTestUtils.setField(message, "id", UUID.randomUUID());
        return message;
    }
}
