package vn.edu.tvu.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One row per notification message: what happened to that ticket email, in the same database as
 * the outbox that produced it.
 */
@Entity
@Table(name = "notification_delivery_ledger")
public class DeliveryLedgerEntry {

    @Id
    @Column(name = "message_id", nullable = false)
    private UUID messageId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DeliveryStatus status;

    /**
     * Identifies the attempt currently in flight. The concluding update matches on it, so an attempt
     * that stalled and came back late cannot overwrite the verdict of the attempt that replaced it.
     */
    @Column(name = "attempt_id", nullable = false)
    private UUID attemptId;

    @Column(name = "attempt_no", nullable = false)
    private int attemptNo;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "lease_until", nullable = false)
    private Instant leaseUntil;

    @Column(name = "concluded_at")
    private Instant concludedAt;

    @Column(name = "last_error")
    private String lastError;

    protected DeliveryLedgerEntry() {
    }

    public DeliveryLedgerEntry(UUID messageId, UUID attemptId, Instant startedAt, Instant leaseUntil) {
        this.messageId = messageId;
        this.status = DeliveryStatus.PROCESSING;
        this.attemptId = attemptId;
        this.attemptNo = 1;
        this.startedAt = startedAt;
        this.leaseUntil = leaseUntil;
    }

    public UUID getMessageId() {
        return messageId;
    }

    public DeliveryStatus getStatus() {
        return status;
    }

    public UUID getAttemptId() {
        return attemptId;
    }

    public int getAttemptNo() {
        return attemptNo;
    }

    public Instant getLeaseUntil() {
        return leaseUntil;
    }

    public Instant getConcludedAt() {
        return concludedAt;
    }

    public String getLastError() {
        return lastError;
    }
}
