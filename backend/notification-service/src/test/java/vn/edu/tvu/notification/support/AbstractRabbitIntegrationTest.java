package vn.edu.tvu.notification.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
public abstract class AbstractRabbitIntegrationTest {

    @Container
    @ServiceConnection
    protected static final RabbitMQContainer RABBITMQ = new RabbitMQContainer("rabbitmq:4.1-management-alpine");

    @Container
    @ServiceConnection(name = "redis")
    protected static final GenericContainer<?> REDIS =
            new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
}
