package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, UUID> {

    @Query(value = """
            SELECT * FROM outbox_messages
            WHERE (next_attempt_at IS NULL OR next_attempt_at <= :now)
              AND (status = 'NEW' OR (status = 'PROCESSING' AND locked_until < :now))
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 50
            """, nativeQuery = true)
    List<OutboxMessage> findClaimable(@Param("now") Instant now);

    long countByStatus(vn.edu.tvu.ticket.domain.OutboxStatus status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update OutboxMessage m set m.status = vn.edu.tvu.ticket.domain.OutboxStatus.SENT,
                m.sentAt = :sentAt, m.lockedAt = null, m.lockedBy = null, m.lockedUntil = null
            where m.id = :id and m.status = vn.edu.tvu.ticket.domain.OutboxStatus.PROCESSING
                and m.lockedBy = :workerId
            """)
    int markSentIfOwned(@Param("id") UUID id, @Param("workerId") String workerId,
            @Param("sentAt") Instant sentAt);

    /**
     * Requeues the row for a later attempt. {@code nextAttemptAt} is what stops a failing row from being
     * re-claimed on the very next relay tick; without it a broker that just rejected the message is
     * hammered every few seconds and the row keeps its place at the head of the batch.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update OutboxMessage m set m.status = vn.edu.tvu.ticket.domain.OutboxStatus.NEW,
                m.attempts = m.attempts + 1, m.lastError = :error, m.nextAttemptAt = :nextAttemptAt,
                m.lockedAt = null, m.lockedBy = null, m.lockedUntil = null
            where m.id = :id and m.status = vn.edu.tvu.ticket.domain.OutboxStatus.PROCESSING
                and m.lockedBy = :workerId
            """)
    int markRetryableIfOwned(@Param("id") UUID id, @Param("workerId") String workerId,
            @Param("error") String error, @Param("nextAttemptAt") Instant nextAttemptAt);

    /**
     * Terminal give-up. Kept separate from {@code markRetryableIfOwned} so the attempt ceiling is a single
     * explicit transition rather than a value some later query has to remember to filter on.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update OutboxMessage m set m.status = vn.edu.tvu.ticket.domain.OutboxStatus.FAILED,
                m.attempts = m.attempts + 1, m.lastError = :error,
                m.lockedAt = null, m.lockedBy = null, m.lockedUntil = null
            where m.id = :id and m.status = vn.edu.tvu.ticket.domain.OutboxStatus.PROCESSING
                and m.lockedBy = :workerId
            """)
    int markFailedIfOwned(@Param("id") UUID id, @Param("workerId") String workerId,
            @Param("error") String error);
}
