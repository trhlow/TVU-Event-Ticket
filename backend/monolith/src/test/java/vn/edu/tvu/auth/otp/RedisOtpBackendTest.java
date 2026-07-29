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

    @Test
    void consume_letsExactlyOneOfTwoConcurrentCorrectCodesThrough() throws Exception {
        // The race H2 is about: read-then-write in Java let two requests carrying the same correct
        // code both observe an unconsumed entry and both succeed, so one code logged in twice.
        var key = "otp:concurrent-" + java.util.UUID.randomUUID();
        var digest = new OtpDigest("test-pepper").of("123456");
        backend.put(key, new OtpStore.Entry(digest, 0), Duration.ofMinutes(10));

        var start = new java.util.concurrent.CountDownLatch(1);
        var results = java.util.Collections.synchronizedList(new java.util.ArrayList<OtpStore.Result>());
        var threads = new java.util.ArrayList<Thread>();
        for (int i = 0; i < 2; i++) {
            var thread = new Thread(() -> {
                try {
                    start.await();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    return;
                }
                results.add(backend.consume(key, digest, 5));
            });
            thread.start();
            threads.add(thread);
        }
        start.countDown();
        for (var thread : threads) {
            thread.join(java.util.concurrent.TimeUnit.SECONDS.toMillis(10));
        }

        assertThat(results).containsExactlyInAnyOrder(OtpStore.Result.OK, OtpStore.Result.EXPIRED);
    }

    @Test
    void consume_countsConcurrentWrongGuessesWithoutLosingAny() throws Exception {
        // Read-then-write also let simultaneous wrong guesses each read the same counter and write
        // back the same value, so the cap could be walked past.
        var key = "otp:attempts-" + java.util.UUID.randomUUID();
        var digester = new OtpDigest("test-pepper");
        backend.put(key, new OtpStore.Entry(digester.of("123456"), 0), Duration.ofMinutes(10));

        var start = new java.util.concurrent.CountDownLatch(1);
        var threads = new java.util.ArrayList<Thread>();
        for (int i = 0; i < 4; i++) {
            var thread = new Thread(() -> {
                try {
                    start.await();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    return;
                }
                backend.consume(key, digester.of("000000"), 5);
            });
            thread.start();
            threads.add(thread);
        }
        start.countDown();
        for (var thread : threads) {
            thread.join(java.util.concurrent.TimeUnit.SECONDS.toMillis(10));
        }

        assertThat(backend.get(key).attempts()).isEqualTo(4);
    }

    @Test
    void consume_doesNotExtendTheCodesLifetimeOnAWrongGuess() throws Exception {
        // Otherwise an attacker keeps a code alive indefinitely by guessing wrong at intervals.
        var key = "otp:ttl-" + java.util.UUID.randomUUID();
        var digester = new OtpDigest("test-pepper");
        backend.put(key, new OtpStore.Entry(digester.of("123456"), 0), Duration.ofSeconds(60));
        Thread.sleep(1100);

        backend.consume(key, digester.of("000000"), 5);

        var remaining = template.getExpire(key, TimeUnit.SECONDS);
        assertThat(remaining).isLessThan(60L).isGreaterThan(0L);
    }

    @Test
    void consume_reportsExpiredForAnUnknownKey() {
        assertThat(backend.consume("otp:missing-" + java.util.UUID.randomUUID(), "digest", 5))
                .isEqualTo(OtpStore.Result.EXPIRED);
    }
}
