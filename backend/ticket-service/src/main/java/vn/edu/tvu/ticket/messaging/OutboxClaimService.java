package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxClaimService {

    private static final Duration LEASE = Duration.ofMinutes(1);
    private final OutboxMessageRepository repository;

    public OutboxClaimService(OutboxMessageRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public List<OutboxMessage> claim(String workerId) {
        var now = Instant.now();
        var messages = repository.findClaimable(now);
        messages.forEach(message -> message.markProcessing(workerId, now, now.plus(LEASE)));
        return repository.saveAllAndFlush(messages);
    }

    @Transactional
    public void markSent(UUID id) {
        repository.findById(id).ifPresent(OutboxMessage::markSent);
    }

    @Transactional
    public void markRetryable(UUID id, String error) {
        repository.findById(id).ifPresent(message -> message.markRetryable(error));
    }
}
