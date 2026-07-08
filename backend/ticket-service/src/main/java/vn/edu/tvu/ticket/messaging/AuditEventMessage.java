package vn.edu.tvu.ticket.messaging;

import java.util.UUID;

public record AuditEventMessage(
        UUID actorId,
        String action,
        String targetType,
        UUID targetId,
        String detail,
        String occurredAt) {
}
