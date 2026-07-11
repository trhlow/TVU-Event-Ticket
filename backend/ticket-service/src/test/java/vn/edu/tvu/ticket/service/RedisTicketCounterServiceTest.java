package vn.edu.tvu.ticket.service;

import java.util.ArrayList;
import java.util.concurrent.Executors;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class RedisTicketCounterServiceTest {

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);

    private static LettuceConnectionFactory connectionFactory;
    private static RedisTicketCounterService service;

    @BeforeAll
    static void setUp() {
        connectionFactory = new LettuceConnectionFactory(REDIS.getHost(), REDIS.getMappedPort(6379));
        connectionFactory.afterPropertiesSet();
        var template = new StringRedisTemplate(connectionFactory);
        template.afterPropertiesSet();
        service = new RedisTicketCounterService(template);
    }

    @AfterAll
    static void tearDown() {
        connectionFactory.destroy();
    }

    @Test
    void concurrentReserveNeverOverbooksOrStoresNegativeValue() throws Exception {
        var eventId = UUID.randomUUID();
        service.seedIfMissing(eventId, 10);
        try (var executor = Executors.newFixedThreadPool(12)) {
            var tasks = new ArrayList<java.util.concurrent.Callable<Boolean>>();
            for (int i = 0; i < 50; i++) {
                tasks.add(() -> service.tryReserve(eventId));
            }
            var successes = executor.invokeAll(tasks).stream().filter(future -> {
                try {
                    return future.get();
                } catch (Exception ex) {
                    throw new RuntimeException(ex);
                }
            }).count();
            assertThat(successes).isEqualTo(10);
            assertThat(service.remaining(eventId)).isZero();
        }
    }

    @Test
    void missingCounterCanBeReseededWithoutOverwritingLiveValue() {
        var eventId = UUID.randomUUID();
        service.seedIfMissing(eventId, 3);
        service.seedIfMissing(eventId, 99);
        assertThat(service.remaining(eventId)).isEqualTo(3);
    }
}
