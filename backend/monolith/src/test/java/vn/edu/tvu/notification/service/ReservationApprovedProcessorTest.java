package vn.edu.tvu.notification.service;

import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationApprovedProcessorTest {

    @Mock NotificationIdempotencyStore idempotencyStore;
    @Mock QrSigner qrSigner;
    @Mock TicketMailSender mailSender;
    @Mock NotificationMetrics metrics;

    private ReservationApprovedProcessor processor;

    @BeforeEach
    void setUp() {
        processor = new ReservationApprovedProcessor(idempotencyStore, qrSigner, mailSender, metrics);
    }

    @Test
    void sendsOnceThenMarksMessageDone() {
        var messageId = UUID.randomUUID();
        var message = message();
        var claim = NotificationIdempotencyStore.Claim.acquired(messageId, "owner");
        var signedQr = new QrSigner.SignedQr("signed", new byte[] {1});
        when(idempotencyStore.claim(messageId)).thenReturn(claim);
        when(qrSigner.create(eq(message.ticketId()), eq(message.eventId()), any())).thenReturn(signedQr);

        var result = processor.process(messageId, message);

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.DELIVERED);
        verify(mailSender).send(message, signedQr);
        verify(idempotencyStore).markDone(messageId);
        verify(idempotencyStore).release(claim);
        verify(metrics).delivered();
    }

    @Test
    void duplicateDoneMessageDoesNotSendAgain() {
        var messageId = UUID.randomUUID();
        when(idempotencyStore.claim(messageId)).thenReturn(NotificationIdempotencyStore.Claim.alreadyDone(messageId));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.DUPLICATE);
        verify(qrSigner, never()).create(any(), any(), any());
        verify(mailSender, never()).send(any(), any());
        verify(idempotencyStore, never()).markDone(any());
        verify(metrics).duplicate();
    }

    @Test
    void mailFailureReleasesLockWithoutMarkingDone() {
        var messageId = UUID.randomUUID();
        var message = message();
        var claim = NotificationIdempotencyStore.Claim.acquired(messageId, "owner");
        when(idempotencyStore.claim(messageId)).thenReturn(claim);
        when(qrSigner.create(any(), any(), any())).thenReturn(new QrSigner.SignedQr("signed", new byte[] {1}));
        org.mockito.Mockito.doThrow(new IllegalStateException("smtp unavailable"))
                .when(mailSender).send(any(), any());

        assertThatThrownBy(() -> processor.process(messageId, message))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("smtp unavailable");

        verify(idempotencyStore, never()).markDone(messageId);
        verify(idempotencyStore).release(claim);
        verify(metrics).failed();
    }

    @Test
    void activeLockIsNotTreatedAsSuccessfulDelivery() {
        var messageId = UUID.randomUUID();
        when(idempotencyStore.claim(messageId)).thenReturn(NotificationIdempotencyStore.Claim.locked(messageId));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.IN_PROGRESS);
        verify(mailSender, never()).send(any(), any());
    }

    private ReservationApprovedMessage message() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }
}
