package vn.edu.tvu.notification.listener;

import vn.edu.tvu.notification.service.NotificationMetrics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

@Component
@Lazy(false)
public class NotificationDeadLetterListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationDeadLetterListener.class);

    private final NotificationMetrics metrics;

    public NotificationDeadLetterListener(NotificationMetrics metrics) {
        this.metrics = metrics;
    }

    @RabbitListener(queues = "${tvu.notification.rabbit.dead-letter-queue}")
    public void consume(Message message) {
        metrics.deadLetter();
        var properties = message.getMessageProperties();
        LOGGER.warn("Notification message reached DLQ: messageId={}, routingKey={}",
                properties.getMessageId(), properties.getReceivedRoutingKey());
    }
}
