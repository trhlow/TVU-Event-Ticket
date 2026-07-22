package vn.edu.tvu.ticket.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import vn.edu.tvu.notification.support.AbstractRabbitIntegrationTest;
import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.OutboxStatus;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A message the broker will never accept must eventually stop being retried.
 *
 * <p>{@code findClaimable} takes the 50 oldest claimable rows, and a permanently failing row returns to
 * {@code NEW} immediately with no backoff. Fifty such rows therefore occupy every slot of every batch
 * forever, and no newer message is ever published again — silent, total loss of ticket-delivery mail with
 * the relay reporting no error anywhere.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.rabbitmq.listener.simple.auto-startup=false",
        "spring.task.scheduling.enabled=false",
        "tvu.ticket.outbox.max-attempts=3",
        "tvu.ticket.outbox.retry-backoff=30s"})
class OutboxRetryExhaustionTest extends AbstractRabbitIntegrationTest {

    @Autowired OutboxMessageRepository repository;
    @Autowired OutboxClaimService claimService;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    /** Simulates the backoff window elapsing, so the loop exercises retries rather than the clock. */
    private void expireBackoff() {
        jdbcTemplate.update("UPDATE outbox_messages SET next_attempt_at = now() - interval '1 minute' "
                + "WHERE next_attempt_at IS NOT NULL");
    }

    @Test
    void repeatedlyFailingMessageIsRetiredAndStopsBeingClaimed() {
        var saved = repository.saveAndFlush(OutboxMessage.pending(
                "reservation", UUID.randomUUID(), "reservation.approved", "{\"poison\":true}"));

        for (int attempt = 1; attempt <= 3; attempt++) {
            var claimed = claimService.claim("worker-1");
            assertThat(claimed).as("attempt %d should still claim the message", attempt)
                    .extracting(OutboxMessage::getId).contains(saved.getId());
            claimService.markRetryable(saved.getId(), "worker-1", "broker rejected the payload");
            expireBackoff();
        }

        var retired = repository.findById(saved.getId()).orElseThrow();
        assertThat(retired.getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(retired.getAttempts()).isEqualTo(3);

        assertThat(claimService.claim("worker-1"))
                .as("a retired message must never be claimed again, or it blocks the batch forever")
                .extracting(OutboxMessage::getId)
                .doesNotContain(saved.getId());
    }

    @Test
    void retryIsDelayedByBackoffRatherThanRequeuedImmediately() {
        var saved = repository.saveAndFlush(OutboxMessage.pending(
                "reservation", UUID.randomUUID(), "reservation.approved", "{\"transient\":true}"));

        claimService.claim("worker-1");
        claimService.markRetryable(saved.getId(), "worker-1", "transient broker error");

        var requeued = repository.findById(saved.getId()).orElseThrow();
        assertThat(requeued.getStatus()).isEqualTo(OutboxStatus.NEW);
        assertThat(requeued.getNextAttemptAt())
                .as("without a backoff the row is re-claimed every relay tick, hammering a broker that "
                        + "just failed")
                .isNotNull()
                .isAfter(Instant.now());

        assertThat(claimService.claim("worker-1"))
                .extracting(OutboxMessage::getId)
                .doesNotContain(saved.getId());
    }
}
