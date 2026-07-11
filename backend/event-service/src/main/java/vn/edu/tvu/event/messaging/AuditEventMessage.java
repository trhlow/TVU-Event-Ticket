package vn.edu.tvu.event.messaging;

import java.time.Instant;
import java.util.UUID;

public record AuditEventMessage(UUID actorId, String action, String targetType,
                                UUID targetId, String detail, Instant occurredAt) {}
