package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.repository.DeliveryLedgerRepository;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only writer of UNKNOWN for abandoned claims.
 *
 * <p>A worker killed between handing the message to SMTP and committing the result leaves its row
 * at PROCESSING and writes nothing further — it cannot, it is gone. PostgreSQL has no way to learn
 * whether the provider took that message, so the row cannot simply be resolved one way or another.
 * What can be said is that the claim was abandoned, and that is what this turns into UNKNOWN.
 *
 * <p>UNKNOWN is a destination, not a retry queue: nothing here sends anything. A person checks the
 * provider's logs and decides, because an automatic retry of a message the provider may already
 * have delivered gives a student a second ticket.
 */
@Component
public class DeliveryReconciler {

    private static final Logger LOGGER = LoggerFactory.getLogger(DeliveryReconciler.class);

    private final DeliveryLedgerRepository repository;
    private final NotificationMetrics metrics;

    public DeliveryReconciler(DeliveryLedgerRepository repository, NotificationMetrics metrics) {
        this.repository = repository;
        this.metrics = metrics;
    }

    @Scheduled(fixedDelayString = "${tvu.notification.reconcile-delay:60000}")
    @Transactional
    public void markAbandonedClaimsUnknown() {
        var promoted = repository.markExpiredClaimsUnknown(Instant.now());
        if (promoted > 0) {
            metrics.unknown(promoted);
            LOGGER.error("{} delivery claim(s) expired without an outcome and are now UNKNOWN. "
                    + "Each one needs checking against the provider's logs before anyone can say "
                    + "whether that ticket email arrived.", promoted);
        }
    }
}
