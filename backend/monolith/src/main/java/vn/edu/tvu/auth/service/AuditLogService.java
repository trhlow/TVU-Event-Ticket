package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.dto.response.AuditLogResponse;
import vn.edu.tvu.shared.audit.AuditRecorder;
import vn.edu.tvu.shared.web.PageResponse;
import vn.edu.tvu.auth.repository.AuditLogRepository;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditLogService implements AuditRecorder {

    public static final Map<String, String> AUDIT_SORT_FIELDS = Map.of(
            "createdAt", "a.createdAt",
            "action", "a.action");

    public static final String DEFAULT_AUDIT_SORT = "createdAt,desc";

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * Joins the caller's transaction ({@code REQUIRED} is the default), which is the whole point of
     * recording in-process: the audit row and the change it describes commit together or not at all.
     */
    @Override
    @Transactional
    public void recordAudit(UUID actorId, String action, String targetType, UUID targetId, String detail) {
        auditLogRepository.save(AuditLog.local(actorId, action, targetType, targetId, detail));
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
