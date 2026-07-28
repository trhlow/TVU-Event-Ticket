package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationIdempotencyProperties;
import vn.edu.tvu.notification.domain.DeliveryLedgerEntry;
import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.notification.repository.DeliveryLedgerRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The three-phase delivery protocol, with the transaction boundaries that make it work.
 *
 * <ol>
 *   <li><b>{@link #claim}</b> — write PROCESSING with a lease and <b>commit</b>.</li>
 *   <li>Send the email <b>outside any transaction</b>. It is a side effect on another system and
 *       cannot be rolled back.</li>
 *   <li><b>{@link #conclude}</b> — record the verdict in a second transaction.</li>
 * </ol>
 *
 * <p>Every phase is {@code REQUIRES_NEW} on purpose. If the claim shared a transaction with the
 * send, a crash would roll the claim back and leave no evidence that an email may have gone out —
 * which is the exact hole this design exists to close.
 *
 * <p>Nothing here ever writes UNKNOWN. A process killed between the send and the conclusion writes
 * nothing at all; its row simply stays PROCESSING until its lease expires, and
 * {@link DeliveryReconciler} is what turns that into UNKNOWN. Expecting the dying worker to record
 * UNKNOWN itself is the one thing that cannot be implemented.
 */
@Service
public class DeliveryLedger {

    private final DeliveryLedgerRepository repository;
    private final NotificationIdempotencyProperties properties;

    public DeliveryLedger(DeliveryLedgerRepository repository,
                          NotificationIdempotencyProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    /** The outcome of trying to take ownership of a message. */
    public enum ClaimResult {
        /** This worker owns the attempt and must go on to send. */
        CLAIMED,
        /** Already delivered; do nothing. */
        ALREADY_DELIVERED,
        /** Another worker holds a live lease. */
        IN_PROGRESS,
        /** Left UNKNOWN by the reconciler: a human decides, never an automatic retry. */
        NEEDS_RECONCILIATION
    }

    public record Claim(ClaimResult result, UUID attemptId) {
    }

    /**
     * Phase 1. Commits before returning, so the record that an attempt started outlives the process
     * making it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Claim claim(UUID messageId) {
        var now = Instant.now();
        var leaseUntil = now.plus(properties.leaseTtl());
        var attemptId = UUID.randomUUID();

        Optional<DeliveryLedgerEntry> existing = repository.findById(messageId);
        if (existing.isEmpty()) {
            try {
                repository.saveAndFlush(new DeliveryLedgerEntry(messageId, attemptId, now, leaseUntil));
                return new Claim(ClaimResult.CLAIMED, attemptId);
            } catch (DataIntegrityViolationException raced) {
                // Another worker inserted the same message id between the read and the write. Fall
                // through and treat it as an existing row rather than failing the delivery.
                existing = repository.findById(messageId);
            }
        }

        var entry = existing.orElseThrow();
        return switch (entry.getStatus()) {
            case DELIVERED -> new Claim(ClaimResult.ALREADY_DELIVERED, null);
            // Deliberately not retried. The provider may already hold a copy, so sending again could
            // give a student a second ticket; the escalation path is manual reconciliation.
            case UNKNOWN -> new Claim(ClaimResult.NEEDS_RECONCILIATION, null);
            case FAILED, PROCESSING -> repository.reclaim(messageId, attemptId, now, leaseUntil) == 1
                    ? new Claim(ClaimResult.CLAIMED, attemptId)
                    : new Claim(ClaimResult.IN_PROGRESS, null);
        };
    }

    /** Phase 3. Records the verdict of {@code attemptId}, and only of that attempt. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean conclude(UUID messageId, UUID attemptId, DeliveryStatus status, String error) {
        if (status == DeliveryStatus.PROCESSING) {
            throw new IllegalArgumentException("PROCESSING is not a conclusion");
        }
        return repository.conclude(messageId, attemptId, status, Instant.now(), error) == 1;
    }

    @Transactional(readOnly = true)
    public long countUnknown() {
        return repository.countByStatus(DeliveryStatus.UNKNOWN);
    }
}
