package vn.edu.tvu.notification.service;

import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;
import vn.edu.tvu.notification.config.NotificationIdempotencyProperties;
import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.notification.repository.DeliveryLedgerRepository;
import vn.edu.tvu.notification.service.DeliveryLedger.ClaimResult;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The delivery protocol against a real PostgreSQL, including the failpoint the checklist requires.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({DeliveryLedger.class, DeliveryReconciler.class, NotificationMetrics.class,
        DeliveryLedgerIntegrationTest.Config.class})
// No surrounding transaction. The protocol under test deliberately commits each phase separately
// (REQUIRES_NEW), so a test-managed transaction would hold row locks that those independent
// transactions then block on for ever — the test would hang rather than fail. Each test uses fresh
// message ids and the table is cleared below.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DeliveryLedgerIntegrationTest extends AbstractPostgresIntegrationTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        NotificationIdempotencyProperties idempotencyProperties() {
            return new NotificationIdempotencyProperties(Duration.ofMinutes(2), Duration.ofMinutes(5));
        }
    }

    @Autowired
    private DeliveryLedger ledger;

    @Autowired
    private DeliveryReconciler reconciler;

    @Autowired
    private DeliveryLedgerRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    @org.junit.jupiter.api.AfterEach
    void clearLedger() {
        jdbc.update("DELETE FROM notification_delivery_ledger");
    }

    @Test
    @DisplayName("phase 1 commits PROCESSING before anything is sent")
    void claimRecordsProcessing() {
        var messageId = UUID.randomUUID();

        var claim = ledger.claim(messageId);

        assertThat(claim.result()).isEqualTo(ClaimResult.CLAIMED);
        assertThat(repository.findById(messageId)).hasValueSatisfying(entry -> {
            assertThat(entry.getStatus()).isEqualTo(DeliveryStatus.PROCESSING);
            assertThat(entry.getAttemptNo()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("a second worker cannot claim a message whose lease is still live")
    void aLiveClaimBlocksAnotherWorker() {
        var messageId = UUID.randomUUID();
        ledger.claim(messageId);

        assertThat(ledger.claim(messageId).result()).isEqualTo(ClaimResult.IN_PROGRESS);
    }

    @Test
    void deliveredMessagesAreNeverSentAgain() {
        var messageId = UUID.randomUUID();
        var claim = ledger.claim(messageId);
        ledger.conclude(messageId, claim.attemptId(), DeliveryStatus.DELIVERED, null);

        assertThat(ledger.claim(messageId).result()).isEqualTo(ClaimResult.ALREADY_DELIVERED);
    }

    @Test
    void failedMessagesAreClaimedAgainWithAnIncrementedAttempt() {
        var messageId = UUID.randomUUID();
        var first = ledger.claim(messageId);
        ledger.conclude(messageId, first.attemptId(), DeliveryStatus.FAILED, "authentication failed");

        var second = ledger.claim(messageId);

        assertThat(second.result()).isEqualTo(ClaimResult.CLAIMED);
        assertThat(second.attemptId()).isNotEqualTo(first.attemptId());
        assertThat(repository.findById(messageId)).hasValueSatisfying(entry ->
                assertThat(entry.getAttemptNo()).isEqualTo(2));
    }

    @Test
    @DisplayName("an attempt that returns late cannot overwrite the verdict of the attempt that replaced it")
    void aStaleAttemptCannotConclude() {
        var messageId = UUID.randomUUID();
        var stale = ledger.claim(messageId);
        expireLease(messageId);
        var current = ledger.claim(messageId);

        var staleWon = ledger.conclude(messageId, stale.attemptId(), DeliveryStatus.DELIVERED, null);

        assertThat(staleWon).isFalse();
        assertThat(repository.findById(messageId)).hasValueSatisfying(entry -> {
            assertThat(entry.getStatus()).isEqualTo(DeliveryStatus.PROCESSING);
            assertThat(entry.getAttemptId()).isEqualTo(current.attemptId());
        });
    }

    @Test
    @DisplayName("failpoint: a worker killed after SMTP accepted but before it could commit")
    void failpoint_killedWorkerLeavesProcessingThenReconcilerMarksUnknown() {
        // Phase 1 of the assertion. Claiming commits, the send happens, and then the process dies —
        // simulated here by simply never calling conclude(), which is exactly what a killed worker
        // does. It CANNOT write UNKNOWN about itself; there is nothing left running to write it.
        var messageId = UUID.randomUUID();
        ledger.claim(messageId);

        assertThat(repository.findById(messageId)).hasValueSatisfying(entry ->
                assertThat(entry.getStatus()).isEqualTo(DeliveryStatus.PROCESSING));

        // Time passes and the lease runs out.
        expireLease(messageId);

        // Phase 2. Only now, and only from another process, does the row become UNKNOWN.
        reconciler.markAbandonedClaimsUnknown();

        assertThat(repository.findById(messageId)).hasValueSatisfying(entry -> {
            assertThat(entry.getStatus()).isEqualTo(DeliveryStatus.UNKNOWN);
            assertThat(entry.getConcludedAt()).isNotNull();
            // Not retried, and not counted as a new attempt: nobody sent anything.
            assertThat(entry.getAttemptNo()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("an UNKNOWN message is never claimed again automatically")
    void unknownMessagesWaitForAHuman() {
        var messageId = UUID.randomUUID();
        ledger.claim(messageId);
        expireLease(messageId);
        reconciler.markAbandonedClaimsUnknown();

        // Automatic retry here is what would hand a student a second ticket.
        assertThat(ledger.claim(messageId).result()).isEqualTo(ClaimResult.NEEDS_RECONCILIATION);
        assertThat(ledger.countUnknown()).isEqualTo(1);
    }

    @Test
    @DisplayName("the reconciler leaves live claims alone")
    void reconcilerIgnoresLiveClaims() {
        var messageId = UUID.randomUUID();
        ledger.claim(messageId);

        reconciler.markAbandonedClaimsUnknown();

        assertThat(repository.findById(messageId)).hasValueSatisfying(entry ->
                assertThat(entry.getStatus()).isEqualTo(DeliveryStatus.PROCESSING));
    }

    /** Stands in for the passage of time, so the test does not have to wait out a real lease. */
    private void expireLease(UUID messageId) {
        jdbc.update("UPDATE notification_delivery_ledger SET lease_until = ? WHERE message_id = ?",
                java.sql.Timestamp.from(Instant.now().minusSeconds(60)), messageId);
    }
}
