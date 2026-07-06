package vn.edu.tvu.auth.messaging;

import java.time.Instant;
import java.util.UUID;

public record AuditEventMessage(
        UUID actorId,
        String action,
        String targetType,
        UUID targetId,
        String detail,
        Instant occurredAt) {
}
