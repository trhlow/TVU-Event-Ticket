package vn.edu.tvu.notification.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * {@code @DirtiesContext} is load-bearing here, mirroring the ticket and auth Postgres bases. JUnit's
 * Testcontainers extension stops the static {@code @Container}s after this class and the next class starts
 * fresh ones on new ports; without closing the context in between, the cached context's Rabbit listener,
 * Redis client and Hikari pool keep reconnecting to the stopped containers, flooding logs and forcing
 * Surefire to force-kill the fork. Dropping the context after the class stops those workers.
 */
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class AbstractRabbitIntegrationTest {

    @Container
    @ServiceConnection
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:18.4-alpine");

    @Container
    @ServiceConnection
    protected static final RabbitMQContainer RABBITMQ = new RabbitMQContainer("rabbitmq:4.1-management-alpine");

    @Container
    @ServiceConnection(name = "redis")
    protected static final GenericContainer<?> REDIS =
            new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
}
