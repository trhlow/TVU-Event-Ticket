package vn.edu.tvu.shared.audit;

import java.util.UUID;

/**
 * Writes an entry to the audit log.
 *
 * <p>This used to be a RabbitMQ round trip: the event and ticket features published to the
 * {@code tvu.events} exchange and the auth feature consumed from the {@code audit.log} queue bound to
 * it. All three were already the same JVM, so the broker was carrying messages from a process to
 * itself — and buying real weakness for it. The publish sat outside the caller's transaction, so an
 * event could commit while its audit entry was silently dropped (the publisher logged a warning and
 * moved on), and the consumer needed a {@code message_id} uniqueness check to survive redelivery.
 *
 * <p>A direct call closes both holes: the audit row commits or rolls back with the change it
 * describes. The trade is real and deliberate — audit failure now fails the operation instead of
 * being swallowed. For an audit log that is the safer direction.
 *
 * <p>The interface lives here rather than in {@code auth} so that {@code event} and {@code ticket}
 * depend on the capability, not on the feature that happens to implement it.
 */
public interface AuditRecorder {

    void recordAudit(UUID actorId, String action, String targetType, UUID targetId, String detail);
}
