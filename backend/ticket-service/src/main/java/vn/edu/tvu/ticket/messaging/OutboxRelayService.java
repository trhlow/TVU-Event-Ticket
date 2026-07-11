package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.UUID;

import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OutboxRelayService {

    private final OutboxClaimService claimService;
    private final RabbitTemplate rabbitTemplate;
    private final String workerId;

    public OutboxRelayService(OutboxClaimService claimService, RabbitTemplate rabbitTemplate) {
        this.claimService = claimService;
        this.rabbitTemplate = rabbitTemplate;
        this.workerId = workerId();
    }

    @Scheduled(fixedDelayString = "${tvu.ticket.outbox.relay-delay:5000}")
    public void relayPendingMessages() {
        claimService.claim(workerId).forEach(this::publish);
    }

    private void publish(OutboxMessage message) {
        try {
            rabbitTemplate.convertAndSend(
                    TicketRabbitConfig.EXCHANGE,
                    message.getRoutingKey(),
                    message.getPayload(),
                    amqpMessage -> {
                        var properties = amqpMessage.getMessageProperties();
                        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                        properties.setMessageId(message.getMessageId().toString());
                        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                        return amqpMessage;
                    });
            claimService.markSent(message.getId());
        } catch (RuntimeException ex) {
            claimService.markRetryable(message.getId(), ex.getMessage());
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
