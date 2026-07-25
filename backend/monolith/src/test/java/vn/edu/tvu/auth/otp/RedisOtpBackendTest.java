package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class RedisOtpBackendTest {

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);

    private static LettuceConnectionFactory connectionFactory;
    private static StringRedisTemplate template;
    private static RedisOtpBackend backend;

    @BeforeAll
    static void setUp() {
        connectionFactory = new LettuceConnectionFactory(REDIS.getHost(), REDIS.getMappedPort(6379));
        connectionFactory.afterPropertiesSet();
        template = new StringRedisTemplate(connectionFactory);
        template.afterPropertiesSet();
        backend = new RedisOtpBackend(template);
    }

    @AfterAll
    static void tearDown() {
        if (connectionFactory != null) {
            connectionFactory.destroy();
        }
    }

    @Test
    void putIfAbsent_onlyLetsTheFirstCallerThrough() {
        var key = "otp:cooldown:" + java.util.UUID.randomUUID();

        assertThat(backend.putIfAbsent(key, Duration.ofSeconds(60))).isTrue();
        assertThat(backend.putIfAbsent(key, Duration.ofSeconds(60))).isFalse();
    }

    /**
     * A counter without an expiry never resets, and because admin sign-in has no password fallback that
     * would bar the address from ever receiving a code again. The TTL must therefore exist from the moment
     * the key does.
     */
    @Test
    void increment_leavesTheCounterCarryingAnExpiry() {
        var key = "otp:daily:" + java.util.UUID.randomUUID();

        backend.increment(key, Duration.ofHours(24));

        assertThat(template.getExpire(key, TimeUnit.SECONDS))
                .as("a counter that outlives its window locks the address out for good")
                .isGreaterThan(0);
    }

    @Test
    void increment_doesNotPushTheWindowForwardOnEveryCall() {
        var key = "otp:daily:" + java.util.UUID.randomUUID();
        backend.increment(key, Duration.ofSeconds(100));
        var afterFirst = template.getExpire(key, TimeUnit.SECONDS);

        backend.increment(key, Duration.ofSeconds(100));

        assertThat(template.getExpire(key, TimeUnit.SECONDS))
                .as("a refreshed TTL would turn the daily cap into a window that never resets")
                .isLessThanOrEqualTo(afterFirst);
    }

    @Test
    void increment_countsUpFromOne() {
        var key = "otp:daily:" + java.util.UUID.randomUUID();

        assertThat(backend.increment(key, Duration.ofHours(24))).isEqualTo(1L);
        assertThat(backend.increment(key, Duration.ofHours(24))).isEqualTo(2L);
    }
}
