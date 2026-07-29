package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.domain.DeliveryStatus;
import vn.edu.tvu.notification.repository.DeliveryLedgerRepository;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Component;

@Component
public class NotificationMetrics {

    private final Counter delivered;
    private final Counter duplicates;
    private final Counter failures;
    private final Counter deadLetters;
    private final Counter unknowns;
    private final Counter awaitingReconciliation;

    public NotificationMetrics(MeterRegistry meterRegistry, DeliveryLedgerRepository ledgerRepository) {
        delivered = counter(meterRegistry, "notification.messages.delivered");
        duplicates = counter(meterRegistry, "notification.messages.duplicate");
        failures = counter(meterRegistry, "notification.messages.failed");
        deadLetters = counter(meterRegistry, "notification.messages.dlq");
        unknowns = counter(meterRegistry, "notification.ledger.unknown");
        awaitingReconciliation = counter(meterRegistry, "notification.messages.awaiting_reconciliation");

        // Two metrics, because they answer different questions and one cannot do both.
        //
        // The gauge reads the database, so it reports the CURRENT backlog: it survives a restart and
        // it falls back to zero once the rows are worked off, which makes it safe to alert on with
        // `> 0`. A counter cannot do that — `..._total > 0` stays red for ever after the first
        // incident and resets to zero on restart while the backlog is still sitting in the table.
        //
        // The counter answers the other question: is anything NEW going unknown right now, even
        // while an older backlog is still being cleared. Alert on increase(...[5m]) > 0.
        Gauge.builder("notification.ledger.unknown.current",
                        () -> ledgerRepository.countByStatus(DeliveryStatus.UNKNOWN))
                .description("Delivery ledger rows currently awaiting manual reconciliation")
                .register(meterRegistry);
    }

    /** One or more messages ended in a state where nobody can say whether the email arrived. */
    public void unknown(int count) {
        unknowns.increment(count);
    }

    public void unknown() {
        unknown(1);
    }

    /** A message was skipped because an earlier attempt left it UNKNOWN. */
    public void awaitingReconciliation() {
        awaitingReconciliation.increment();
    }

    public void delivered() {
        delivered.increment();
    }

    public void duplicate() {
        duplicates.increment();
    }

    public void failed() {
        failures.increment();
    }

    public void deadLetter() {
        deadLetters.increment();
    }

    private Counter counter(MeterRegistry meterRegistry, String name) {
        return Counter.builder(name).register(meterRegistry);
    }
}
