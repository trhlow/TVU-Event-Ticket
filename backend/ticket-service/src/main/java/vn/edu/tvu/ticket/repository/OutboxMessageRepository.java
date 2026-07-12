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
            WHERE status = 'NEW' OR (status = 'PROCESSING' AND locked_until < :now)
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 50
            """, nativeQuery = true)
    List<OutboxMessage> findClaimable(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update OutboxMessage m set m.status = vn.edu.tvu.ticket.domain.OutboxStatus.SENT,
                m.sentAt = :sentAt, m.lockedAt = null, m.lockedBy = null, m.lockedUntil = null
            where m.id = :id and m.status = vn.edu.tvu.ticket.domain.OutboxStatus.PROCESSING
                and m.lockedBy = :workerId
            """)
    int markSentIfOwned(@Param("id") UUID id, @Param("workerId") String workerId,
            @Param("sentAt") Instant sentAt);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update OutboxMessage m set m.status = vn.edu.tvu.ticket.domain.OutboxStatus.NEW,
                m.attempts = m.attempts + 1, m.lastError = :error,
                m.lockedAt = null, m.lockedBy = null, m.lockedUntil = null
            where m.id = :id and m.status = vn.edu.tvu.ticket.domain.OutboxStatus.PROCESSING
                and m.lockedBy = :workerId
            """)
    int markRetryableIfOwned(@Param("id") UUID id, @Param("workerId") String workerId,
            @Param("error") String error);
}
