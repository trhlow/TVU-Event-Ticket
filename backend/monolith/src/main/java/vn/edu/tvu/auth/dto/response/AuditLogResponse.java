package vn.edu.tvu.auth.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * One audit entry. {@code actorEmail} is null when the entry was written by the system or its actor has since
 * been deleted; the actor id is retained either way.
 */
public record AuditLogResponse(UUID id, UUID actorId, String actorEmail, String action, String targetType,
        UUID targetId, String detail, Instant createdAt) {
}
