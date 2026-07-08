package vn.edu.tvu.ticket.messaging;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.OutboxStatus;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;

import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxRelayService {

    private final OutboxMessageRepository outboxRepository;
    private final RabbitTemplate rabbitTemplate;

    public OutboxRelayService(OutboxMessageRepository outboxRepository, RabbitTemplate rabbitTemplate) {
        this.outboxRepository = outboxRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    @Scheduled(fixedDelayString = "${tvu.ticket.outbox.relay-delay:5000}")
    @Transactional
    public void relayPendingMessages() {
        outboxRepository.findTop50ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING)
                .forEach(this::publish);
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
                        return amqpMessage;
                    });
            message.markPublished();
        } catch (RuntimeException ex) {
            message.markFailed();
        }
    }
}
