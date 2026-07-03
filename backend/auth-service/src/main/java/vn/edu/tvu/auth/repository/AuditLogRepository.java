package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    Optional<AuditLog> findByMessageId(UUID messageId);

    long countByMessageId(UUID messageId);
}
