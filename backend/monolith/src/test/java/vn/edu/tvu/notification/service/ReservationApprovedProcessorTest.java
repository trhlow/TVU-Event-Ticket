package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.notification.service.DeliveryLedger.Claim;
import vn.edu.tvu.notification.service.DeliveryLedger.ClaimResult;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationApprovedProcessorTest {

    @Mock DeliveryLedger ledger;
    @Mock QrSigner qrSigner;
    @Mock TicketMailSender mailSender;
    @Mock NotificationMetrics metrics;

    private ReservationApprovedProcessor processor;
    private final UUID messageId = UUID.randomUUID();
    private final UUID attemptId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        processor = new ReservationApprovedProcessor(ledger, qrSigner, mailSender, metrics);
    }

    private void claimed() {
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.CLAIMED, attemptId));
        when(qrSigner.create(any(), any(), any())).thenReturn(new QrSigner.SignedQr("signed", new byte[] {1}));
    }

    @Test
    @DisplayName("an accepted send is concluded DELIVERED against this attempt")
    void deliveredIsRecordedAgainstTheAttempt() {
        var message = message();
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.CLAIMED, attemptId));
        var signedQr = new QrSigner.SignedQr("signed", new byte[] {1});
        when(qrSigner.create(eq(message.ticketId()), eq(message.eventId()), any())).thenReturn(signedQr);
        when(mailSender.send(message, signedQr)).thenReturn(TicketMailSender.SendResult.accepted());

        var result = processor.process(messageId, message);

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.DELIVERED);
        verify(ledger).conclude(messageId, attemptId, DeliveryStatus.DELIVERED, null);
        verify(metrics).delivered();
    }

    @Test
    @DisplayName("a failure proven to precede the message body is FAILED and rethrown for retry")
    void retryableFailureIsRecordedAndRethrown() {
        claimed();
        when(mailSender.send(any(), any()))
                .thenReturn(TicketMailSender.SendResult.retryable("authentication failed"));

        assertThatThrownBy(() -> processor.process(messageId, message()))
                .isInstanceOf(IllegalStateException.class);

        // FAILED, not UNKNOWN: the provider provably has no copy, so redelivery cannot duplicate.
        verify(ledger).conclude(messageId, attemptId, DeliveryStatus.FAILED, "authentication failed");
        verify(metrics).failed();
    }

    @Test
    @DisplayName("an ambiguous send is recorded UNKNOWN and NOT retried")
    void ambiguousSendIsNotRetried() {
        // The heart of H13.1: a timeout after the body was handed over might have been accepted.
        // Retrying would hand a student a second ticket, so the message stops here for a human.
        claimed();
        when(mailSender.send(any(), any()))
                .thenReturn(TicketMailSender.SendResult.ambiguous("send failed: SocketTimeoutException"));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.NEEDS_RECONCILIATION);
        verify(ledger).conclude(messageId, attemptId, DeliveryStatus.UNKNOWN,
                "send failed: SocketTimeoutException");
        verify(metrics).unknown();
        verify(metrics, never()).delivered();
        verify(metrics, never()).failed();
    }

    @Test
    @DisplayName("a message already left UNKNOWN is never sent again automatically")
    void unknownMessageIsNotResent() {
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.NEEDS_RECONCILIATION, null));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.NEEDS_RECONCILIATION);
        verify(mailSender, never()).send(any(), any());
        verify(metrics).awaitingReconciliation();
    }

    @Test
    void alreadyDeliveredMessageDoesNotSendAgain() {
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.ALREADY_DELIVERED, null));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.DUPLICATE);
        verify(qrSigner, never()).create(any(), any(), any());
        verify(mailSender, never()).send(any(), any());
        verify(metrics).duplicate();
    }

    @Test
    void aLiveClaimHeldElsewhereIsNotTreatedAsDelivery() {
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.IN_PROGRESS, null));

        var result = processor.process(messageId, message());

        assertThat(result).isEqualTo(ReservationApprovedProcessor.Result.IN_PROGRESS);
        verify(mailSender, never()).send(any(), any());
    }

    @Test
    @DisplayName("an exception before the send is FAILED — nothing reached the provider")
    void exceptionBeforeSendIsRetryable() {
        when(ledger.claim(messageId)).thenReturn(new Claim(ClaimResult.CLAIMED, attemptId));
        when(qrSigner.create(any(), any(), any())).thenThrow(new IllegalStateException("qr signing failed"));

        assertThatThrownBy(() -> processor.process(messageId, message()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("qr signing");

        verify(ledger).conclude(eq(messageId), eq(attemptId), eq(DeliveryStatus.FAILED), any());
        verify(mailSender, never()).send(any(), any());
    }

    @Test
    @DisplayName("nothing here ever concludes PROCESSING")
    void neverConcludesWithProcessing() {
        claimed();
        when(mailSender.send(any(), any())).thenReturn(TicketMailSender.SendResult.accepted());

        processor.process(messageId, message());

        verify(ledger, never()).conclude(any(), any(), eq(DeliveryStatus.PROCESSING), isNull());
    }

    private ReservationApprovedMessage message() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }
}
