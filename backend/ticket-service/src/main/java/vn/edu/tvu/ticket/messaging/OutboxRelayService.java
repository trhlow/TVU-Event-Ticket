package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.UUID;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OutboxRelayService {

    private final OutboxClaimService claimService;
    private final ConfirmedRabbitPublisher publisher;
    private final String workerId;

    public OutboxRelayService(OutboxClaimService claimService, ConfirmedRabbitPublisher publisher) {
        this.claimService = claimService;
        this.publisher = publisher;
        this.workerId = workerId();
    }

    @Scheduled(fixedDelayString = "${tvu.ticket.outbox.relay-delay:5000}")
    public void relayPendingMessages() {
        claimService.claim(workerId).forEach(this::publish);
    }

    private void publish(OutboxMessage message) {
        try {
            publisher.publish(message);
            claimService.markSent(message.getId(), workerId);
        } catch (RuntimeException ex) {
            claimService.markRetryable(message.getId(), workerId, ex.getMessage());
        }
    }

    private String workerId() {
        try {
            return InetAddress.getLocalHost().getHostName() + ":" + UUID.randomUUID();
        } catch (UnknownHostException ex) {
            return "ticket-service:" + UUID.randomUUID();
        }
    }
}
