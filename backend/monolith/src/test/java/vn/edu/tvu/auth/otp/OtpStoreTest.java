package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OtpStoreTest {

    private final OtpStore store = new OtpStore(new InMemoryOtpBackend(), 5);

    @Test
    void verify_acceptsTheCodeOnce() {
        var userId = UUID.randomUUID();
        store.save(userId, "123456");

        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.OK);
        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.EXPIRED);
    }

    @Test
    void verify_destroysTheCodeAfterFiveWrongAttempts() {
        var userId = UUID.randomUUID();
        store.save(userId, "123456");

        for (var attempt = 0; attempt < 5; attempt++) {
            assertThat(store.verify(userId, "000000")).isEqualTo(OtpStore.Result.INVALID);
        }

        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.EXPIRED);
    }

    @Test
    void verify_reportsAnUnknownUserAsExpired() {
        assertThat(store.verify(UUID.randomUUID(), "123456")).isEqualTo(OtpStore.Result.EXPIRED);
    }

    /** Exercises the store's rules without Redis. */
    private static final class InMemoryOtpBackend implements OtpStore.Backend {

        private final Map<String, OtpStore.Entry> entries = new HashMap<>();

        @Override
        public void put(String key, OtpStore.Entry entry, Duration ttl) {
            entries.put(key, entry);
        }

        @Override
        public OtpStore.Entry get(String key) {
            return entries.get(key);
        }

        @Override
        public void remove(String key) {
            entries.remove(key);
        }

        @Override
        public Duration timeToLive(String key) {
            return OtpStore.TTL;
        }
    }
}
