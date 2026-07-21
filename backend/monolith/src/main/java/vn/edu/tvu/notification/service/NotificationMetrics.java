package vn.edu.tvu.notification.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.stereotype.Component;

@Component
public class NotificationMetrics {

    private final Counter delivered;
    private final Counter duplicates;
    private final Counter failures;
    private final Counter deadLetters;

    public NotificationMetrics(MeterRegistry meterRegistry) {
        delivered = counter(meterRegistry, "notification.messages.delivered");
        duplicates = counter(meterRegistry, "notification.messages.duplicate");
        failures = counter(meterRegistry, "notification.messages.failed");
        deadLetters = counter(meterRegistry, "notification.messages.dlq");
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
