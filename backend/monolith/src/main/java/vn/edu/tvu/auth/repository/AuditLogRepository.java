package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    Optional<AuditLog> findByMessageId(UUID messageId);

    long countByMessageId(UUID messageId);

    @Query("""
            select a.id as id, a.actorId as actorId, u.email as actorEmail, a.action as action,
                   a.targetType as targetType, a.targetId as targetId, a.detail as detail,
                   a.createdAt as createdAt
            from AuditLog a left join User u on u.id = a.actorId
            where (:actorId is null or a.actorId = :actorId)
              and (:action is null or a.action = :action)
              and a.createdAt >= coalesce(:from, a.createdAt)
              and a.createdAt <= coalesce(:to, a.createdAt)
            """)
    Page<AuditLogEntryProjection> search(@Param("actorId") UUID actorId, @Param("action") String action,
            @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    interface AuditLogEntryProjection {
        UUID getId();
        UUID getActorId();
        String getActorEmail();
        String getAction();
        String getTargetType();
        UUID getTargetId();
        String getDetail();
        Instant getCreatedAt();
    }
}
