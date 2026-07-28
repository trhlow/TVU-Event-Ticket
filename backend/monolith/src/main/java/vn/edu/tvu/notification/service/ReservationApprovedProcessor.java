package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Sends one ticket email, recording what is known about it at every step.
 *
 * <p>The order is the whole point and must not be "simplified":
 *
 * <pre>
 *   TX1  claim  → PROCESSING + lease, COMMITTED
 *   ---  send   → SMTP, outside any transaction
 *   TX2  conclude → DELIVERED | FAILED, or nothing if this process dies
 * </pre>
 *
 * <p>Sending is a side effect on another system, so it can never be inside a database transaction:
 * committing the ledger first and then failing to send loses an email nobody retries, while sending
 * first and then failing to commit sends a second copy on retry. Neither ordering removes the
 * window — what removes the damage is <em>recording that an attempt started</em> before making it,
 * so an attempt that vanishes can be found afterwards.
 *
 * <p>There are two ways a message becomes UNKNOWN, and only one of them lives here. This class
 * writes UNKNOWN when it <em>knows</em> the answer is unknowable — a timeout or reset once the
 * message body was already in flight. It cannot write UNKNOWN for the other case, a process killed
 * mid-send, because there is nothing left running to write it; {@link DeliveryReconciler} draws that
 * conclusion later from the expired lease.
 */
@Service
public class ReservationApprovedProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(ReservationApprovedProcessor.class);

    private final DeliveryLedger ledger;
    private final QrSigner qrSigner;
    private final TicketMailSender mailSender;
    private final NotificationMetrics metrics;

    public ReservationApprovedProcessor(
            DeliveryLedger ledger,
            QrSigner qrSigner,
            TicketMailSender mailSender,
            NotificationMetrics metrics) {
        this.ledger = ledger;
        this.qrSigner = qrSigner;
        this.mailSender = mailSender;
        this.metrics = metrics;
    }

    public Result process(UUID messageId, ReservationApprovedMessage message) {
        var claim = ledger.claim(messageId);
        switch (claim.result()) {
            case ALREADY_DELIVERED -> {
                metrics.duplicate();
                return Result.DUPLICATE;
            }
            case IN_PROGRESS -> {
                return Result.IN_PROGRESS;
            }
            case NEEDS_RECONCILIATION -> {
                // Left UNKNOWN: the provider may already hold a copy. Sending again to clear the
                // backlog is exactly how a student ends up with two tickets, so this stops here and
                // waits for a person.
                LOGGER.warn("messageId={} is awaiting manual reconciliation; not sending", messageId);
                metrics.awaitingReconciliation();
                return Result.NEEDS_RECONCILIATION;
            }
            case CLAIMED -> { /* fall through to the send below */ }
        }

        var attemptId = claim.attemptId();
        TicketMailSender.SendResult sent;
        try {
            var signedQr = qrSigner.create(message.ticketId(), message.eventId(),
                    Instant.parse(message.eventEndAt()));
            sent = mailSender.send(message, signedQr);
        } catch (RuntimeException ex) {
            // Thrown before or instead of a classified send: nothing reached the provider, so this
            // is retryable. A genuine send failure comes back as a SendResult, not as an exception.
            LOGGER.warn("Ticket email attempt failed before sending, messageId={}", messageId, ex);
            ledger.conclude(messageId, attemptId, DeliveryStatus.FAILED, ex.getClass().getSimpleName());
            metrics.failed();
            throw ex;
        }

        return switch (sent.outcome()) {
            case ACCEPTED -> {
                ledger.conclude(messageId, attemptId, DeliveryStatus.DELIVERED, null);
                metrics.delivered();
                yield Result.DELIVERED;
            }
            case RETRYABLE_BEFORE_DATA -> {
                ledger.conclude(messageId, attemptId, DeliveryStatus.FAILED, sent.detail());
                metrics.failed();
                // Rethrow so the broker redelivers: the provider provably has no copy.
                throw new IllegalStateException("Ticket email failed before delivery: " + sent.detail());
            }
            case AMBIGUOUS -> {
                // Do NOT retry and do NOT claim success. Mark it for a human, who can check the
                // provider's logs and decide. Automatic retry here risks a duplicate ticket.
                ledger.conclude(messageId, attemptId, DeliveryStatus.UNKNOWN, sent.detail());
                metrics.unknown();
                LOGGER.error("Ticket email for messageId={} may or may not have been delivered: {}. "
                        + "Needs manual reconciliation against the provider's logs.", messageId, sent.detail());
                yield Result.NEEDS_RECONCILIATION;
            }
        };
    }

    public enum Result {
        DELIVERED,
        DUPLICATE,
        IN_PROGRESS,
        /** Not delivered, not retried: waiting on a person. */
        NEEDS_RECONCILIATION
    }
}
