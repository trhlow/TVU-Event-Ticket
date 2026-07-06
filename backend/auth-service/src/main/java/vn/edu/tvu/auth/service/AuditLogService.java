package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.messaging.AuditEventMessage;
import vn.edu.tvu.auth.repository.AuditLogRepository;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional
    public void recordLocal(UUID actorId, String action, String targetType, UUID targetId, String detail) {
        auditLogRepository.save(AuditLog.local(actorId, action, targetType, targetId, detail));
    }

    @Transactional
    public void recordMessage(UUID messageId, AuditEventMessage event) {
        if (auditLogRepository.countByMessageId(messageId) > 0) {
            return;
        }
        auditLogRepository.save(AuditLog.fromMessage(
                messageId,
                event.actorId(),
                event.action(),
                event.targetType(),
                event.targetId(),
                event.detail()));
    }
}
