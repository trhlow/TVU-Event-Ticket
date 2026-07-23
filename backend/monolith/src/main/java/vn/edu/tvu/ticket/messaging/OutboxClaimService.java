package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxClaimService {

    private static final Duration LEASE = Duration.ofMinutes(1);
    private static final Duration MAX_BACKOFF = Duration.ofMinutes(10);

    private final OutboxMessageRepository repository;
    private final int maxAttempts;
    private final Duration baseBackoff;

    public OutboxClaimService(OutboxMessageRepository repository,
            @Value("${tvu.ticket.outbox.max-attempts:8}") int maxAttempts,
            @Value("${tvu.ticket.outbox.retry-backoff:10s}") Duration baseBackoff) {
        this.repository = repository;
        this.maxAttempts = maxAttempts;
        this.baseBackoff = baseBackoff;
    }

    @Transactional
    public List<OutboxMessage> claim(String workerId) {
        var now = Instant.now();
        var messages = repository.findClaimable(now);
        messages.forEach(message -> message.markProcessing(workerId, now, now.plus(LEASE)));
        return repository.saveAllAndFlush(messages);
    }

    @Transactional
    public boolean markSent(UUID id, String workerId) {
        return repository.markSentIfOwned(id, workerId, Instant.now()) == 1;
    }

    /**
     * Requeues the message with exponential backoff, or retires it to {@code FAILED} once the attempt
     * ceiling is reached. Retiring matters as much as the backoff: {@code findClaimable} is a bounded
     * batch of the oldest claimable rows, so rows that can never succeed must leave the queue or they
     * permanently displace rows that could.
     */
    @Transactional
    public boolean markRetryable(UUID id, String workerId, String error) {
        var current = repository.findById(id).map(OutboxMessage::getAttempts).orElse(0);
        if (current + 1 >= maxAttempts) {
            return repository.markFailedIfOwned(id, workerId, error) == 1;
        }
        return repository.markRetryableIfOwned(id, workerId, error, Instant.now().plus(backoff(current + 1))) == 1;
    }

    private Duration backoff(int attempts) {
        var doubled = baseBackoff.multipliedBy(1L << Math.min(attempts - 1, 16));
        return doubled.compareTo(MAX_BACKOFF) > 0 ? MAX_BACKOFF : doubled;
    }
}
