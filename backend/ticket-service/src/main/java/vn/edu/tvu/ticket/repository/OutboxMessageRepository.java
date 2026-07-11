package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
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
}
