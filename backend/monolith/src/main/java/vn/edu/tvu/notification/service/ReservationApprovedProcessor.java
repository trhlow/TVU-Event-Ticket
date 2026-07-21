package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.messaging.ReservationApprovedMessage;

import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReservationApprovedProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(ReservationApprovedProcessor.class);

    private final NotificationIdempotencyStore idempotencyStore;
    private final QrSigner qrSigner;
    private final TicketMailSender mailSender;
    private final NotificationMetrics metrics;

    public ReservationApprovedProcessor(
            NotificationIdempotencyStore idempotencyStore,
            QrSigner qrSigner,
            TicketMailSender mailSender,
            NotificationMetrics metrics) {
        this.idempotencyStore = idempotencyStore;
        this.qrSigner = qrSigner;
        this.mailSender = mailSender;
        this.metrics = metrics;
    }

    public Result process(UUID messageId, ReservationApprovedMessage message) {
        var claim = idempotencyStore.claim(messageId);
        if (claim.status() == NotificationIdempotencyStore.Status.ALREADY_DONE) {
            metrics.duplicate();
            return Result.DUPLICATE;
        }
        if (claim.status() == NotificationIdempotencyStore.Status.LOCKED) {
            return Result.IN_PROGRESS;
        }
        try {
            var signedQr = qrSigner.create(message.ticketId(), message.eventId(), Instant.parse(message.eventEndAt()));
            mailSender.send(message, signedQr);
            idempotencyStore.markDone(messageId);
            metrics.delivered();
            return Result.DELIVERED;
        } catch (RuntimeException ex) {
            metrics.failed();
            throw ex;
        } finally {
            releaseLockBestEffort(claim);
        }
    }

    private void releaseLockBestEffort(NotificationIdempotencyStore.Claim claim) {
        try {
            idempotencyStore.release(claim);
        } catch (RuntimeException ex) {
            LOGGER.warn("Notification lock release failed for messageId={}", claim.messageId(), ex);
        }
    }

    public enum Result {
        DELIVERED,
        DUPLICATE,
        IN_PROGRESS
    }
}
