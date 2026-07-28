package vn.edu.tvu.notification.repository;

import vn.edu.tvu.notification.domain.DeliveryLedgerEntry;
import vn.edu.tvu.notification.domain.DeliveryStatus;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryLedgerRepository extends JpaRepository<DeliveryLedgerEntry, UUID> {

    /**
     * Takes over an abandoned or retryable row for a fresh attempt.
     *
     * <p>Conditional on the row being retryable <em>or</em> its lease having expired, so two workers
     * racing on the same message cannot both claim it: the first UPDATE wins and the second matches
     * no rows. A DELIVERED or UNKNOWN row is never re-claimed here — the first must not be sent
     * again, and the second is a human decision.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update DeliveryLedgerEntry e
               set e.status = vn.edu.tvu.notification.domain.DeliveryStatus.PROCESSING,
                   e.attemptId = :attemptId,
                   e.attemptNo = e.attemptNo + 1,
                   e.startedAt = :now,
                   e.leaseUntil = :leaseUntil,
                   e.concludedAt = null
             where e.messageId = :messageId
               and (e.status = vn.edu.tvu.notification.domain.DeliveryStatus.FAILED
                    or (e.status = vn.edu.tvu.notification.domain.DeliveryStatus.PROCESSING
                        and e.leaseUntil < :now))
            """)
    int reclaim(@Param("messageId") UUID messageId, @Param("attemptId") UUID attemptId,
                @Param("now") Instant now, @Param("leaseUntil") Instant leaseUntil);

    /**
     * Records the verdict of one specific attempt.
     *
     * <p>Matching on {@code attemptId} is what stops a stalled attempt, returning after the
     * reconciler has already given up on it, from stamping DELIVERED over an UNKNOWN a human is
     * investigating.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update DeliveryLedgerEntry e
               set e.status = :status, e.concludedAt = :now, e.lastError = :error
             where e.messageId = :messageId and e.attemptId = :attemptId
               and e.status = vn.edu.tvu.notification.domain.DeliveryStatus.PROCESSING
            """)
    int conclude(@Param("messageId") UUID messageId, @Param("attemptId") UUID attemptId,
                 @Param("status") DeliveryStatus status, @Param("now") Instant now,
                 @Param("error") String error);

    /**
     * The reconciler: the only writer of UNKNOWN. A claim whose lease ran out belongs to a worker
     * that is gone, and nobody can say whether its message reached the provider.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update DeliveryLedgerEntry e
               set e.status = vn.edu.tvu.notification.domain.DeliveryStatus.UNKNOWN,
                   e.concludedAt = :now,
                   e.lastError = 'lease expired; the worker did not report an outcome'
             where e.status = vn.edu.tvu.notification.domain.DeliveryStatus.PROCESSING
               and e.leaseUntil < :now
            """)
    int markExpiredClaimsUnknown(@Param("now") Instant now);

    long countByStatus(DeliveryStatus status);
}
