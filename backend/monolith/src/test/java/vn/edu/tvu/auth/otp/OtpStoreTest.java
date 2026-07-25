package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OtpStoreTest {

    private final InMemoryOtpBackend backend = new InMemoryOtpBackend();
    private final OtpStore store = new OtpStore(backend, 5, 10);

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

    @Test
    void acquireSendSlot_refusesASecondSendInsideTheCooldown() {
        var userId = UUID.randomUUID();

        assertThat(store.acquireSendSlot(userId)).isTrue();

        assertThat(store.acquireSendSlot(userId))
                .as("a resend inside the cooldown must not cost another mail")
                .isFalse();
    }

    @Test
    void acquireSendSlot_letsTheNextSendThroughOnceTheCooldownElapses() {
        var userId = UUID.randomUUID();
        store.acquireSendSlot(userId);

        backend.elapseCooldowns();

        assertThat(store.acquireSendSlot(userId)).isTrue();
    }

    /**
     * The cooldown alone only paces one attacker; the daily cap is what bounds the total mail a single
     * address can be made to send, which is the SMTP quota the whole admin sign-in depends on.
     */
    @Test
    void acquireSendSlot_stopsOnceTheDailyCapIsReached() {
        var userId = UUID.randomUUID();
        for (var sent = 0; sent < 10; sent++) {
            assertThat(store.acquireSendSlot(userId)).isTrue();
            backend.elapseCooldowns();
        }

        assertThat(store.acquireSendSlot(userId))
                .as("the eleventh send in a day is refused even outside the cooldown")
                .isFalse();
    }

    @Test
    void acquireSendSlot_countsEachAddressSeparately() {
        var first = UUID.randomUUID();
        var second = UUID.randomUUID();

        assertThat(store.acquireSendSlot(first)).isTrue();

        assertThat(store.acquireSendSlot(second))
                .as("one address being throttled must not lock every other admin out")
                .isTrue();
    }

    /** Exercises the store's rules without Redis. */
    private static final class InMemoryOtpBackend implements OtpStore.Backend {

        private final Map<String, OtpStore.Entry> entries = new HashMap<>();
        private final Set<String> markers = new HashSet<>();
        private final Map<String, Long> counters = new HashMap<>();

        /** Stands in for the cooldown key's TTL expiring in Redis. */
        void elapseCooldowns() {
            markers.clear();
        }

        @Override
        public boolean putIfAbsent(String key, Duration ttl) {
            return markers.add(key);
        }

        @Override
        public long increment(String key, Duration ttl) {
            return counters.merge(key, 1L, Long::sum);
        }

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
