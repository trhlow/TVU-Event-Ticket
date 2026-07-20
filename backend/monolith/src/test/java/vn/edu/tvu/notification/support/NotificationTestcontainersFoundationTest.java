package vn.edu.tvu.notification.support;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import vn.edu.tvu.MonolithApplication;
import org.springframework.data.redis.connection.RedisConnectionFactory;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = MonolithApplication.class, properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class NotificationTestcontainersFoundationTest extends AbstractRabbitIntegrationTest {

    @Autowired ConnectionFactory rabbitConnectionFactory;
    @Autowired RedisConnectionFactory redisConnectionFactory;

    @Test
    void wiresRealRabbitMqAndRedisThroughServiceConnections() {
        assertThat(RABBITMQ.isRunning()).isTrue();
        assertThat(REDIS.isRunning()).isTrue();
        assertThat(rabbitConnectionFactory.createConnection().isOpen()).isTrue();
        assertThat(redisConnectionFactory.getConnection().ping()).isEqualTo("PONG");
    }
}
