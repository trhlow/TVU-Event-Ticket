package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.dto.response.AuditLogResponse;
import vn.edu.tvu.auth.dto.response.PageResponse;
import vn.edu.tvu.auth.messaging.AuditEventMessage;
import vn.edu.tvu.auth.repository.AuditLogRepository;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditLogService {

    public static final Map<String, String> AUDIT_SORT_FIELDS = Map.of(
            "createdAt", "a.createdAt",
            "action", "a.action");

    public static final String DEFAULT_AUDIT_SORT = "createdAt,desc";

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

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(UUID actorId, String action, Instant from, Instant to,
            Pageable pageable) {
        return PageResponse.from(auditLogRepository.search(actorId, trimToNull(action), from, to, pageable)
                .map(row -> new AuditLogResponse(row.getId(), row.getActorId(), row.getActorEmail(),
                        row.getAction(), row.getTargetType(), row.getTargetId(), row.getDetail(),
                        row.getCreatedAt())));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        var trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
