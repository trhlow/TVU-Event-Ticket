package vn.edu.tvu.notification.support;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class NotificationTestcontainersFoundationTest extends AbstractRabbitIntegrationTest {

    @Test
    void wiresRealRabbitMqThroughServiceConnection() {
        assertThat(RABBITMQ.isRunning()).isTrue();
    }
}
