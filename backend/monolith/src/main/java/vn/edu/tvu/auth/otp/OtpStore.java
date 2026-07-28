package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.UUID;

public class OtpStore {

    static final Duration TTL = Duration.ofMinutes(10);
    static final Duration COOLDOWN = Duration.ofSeconds(60);
    static final Duration DAILY_WINDOW = Duration.ofHours(24);

    private final Backend backend;
    private final OtpDigest digest;
    private final int maxAttempts;
    private final int maxSendsPerDay;

    public OtpStore(Backend backend, OtpDigest digest, int maxAttempts, int maxSendsPerDay) {
        this.backend = backend;
        this.digest = digest;
        this.maxAttempts = maxAttempts;
        this.maxSendsPerDay = maxSendsPerDay;
    }

    /**
     * Decides whether this address may cost another mail. Sign-in here has no password fallback, so the
     * provider's send quota is the whole admin entrance: the cooldown paces one caller and the daily cap
     * bounds what any number of them can spend against a single address.
     *
     * <p>Both counters are keyed by user, so throttling one address never locks another admin out.
     */
    public boolean acquireSendSlot(UUID userId) {
        if (!backend.putIfAbsent(cooldownKey(userId), COOLDOWN)) {
            return false;
        }
        return backend.increment(dailyKey(userId), DAILY_WINDOW) <= maxSendsPerDay;
    }

    /** Stores only the digest of the code; the code itself is never written anywhere. */
    public void save(UUID userId, String code) {
        backend.put(key(userId), new Entry(digest.of(code), 0), TTL);
    }

    /**
     * A consumed, expired and never-issued code are all reported as EXPIRED. The caller turns every
     * outcome into the same 401, so the distinction never reaches a client.
     *
     * <p>The whole check — compare, count the failure, consume or expire — happens in one atomic
     * step inside the backend. Read-then-write in Java let two requests carrying the same correct
     * code both succeed, and let concurrent wrong guesses each read the same attempt count and write
     * back the same increment, so the cap could be walked past.
     */
    public Result verify(UUID userId, String code) {
        return backend.consume(key(userId), digest.of(code), maxAttempts);
    }

    private String key(UUID userId) {
        return "otp:" + userId;
    }

    private String cooldownKey(UUID userId) {
        return "otp:cooldown:" + userId;
    }

    private String dailyKey(UUID userId) {
        return "otp:daily:" + userId;
    }

    public enum Result {
        OK,
        INVALID,
        EXPIRED
    }

    /** @param digest the HMAC of the code, never the code itself. */
    public record Entry(String digest, int attempts) {
    }

    /**
     * Narrow seam so the rules above are tested without Redis. The counter shares the code's key, so it
     * expires with the code rather than outliving it.
     */
    public interface Backend {

        /** Sets the key only if it is absent, returning whether this caller won it. */
        boolean putIfAbsent(String key, Duration ttl);

        /** Increments the key, applying the TTL when the counter is first created. */
        long increment(String key, Duration ttl);

        void put(String key, Entry entry, Duration ttl);

        /**
         * Compares the presented digest with the stored one and applies the consequence — consume on
         * a match, otherwise count the failure and destroy the code once the cap is reached — as a
         * single atomic operation.
         *
         * <p>Implementations must preserve the code's original expiry across failed attempts. Writing
         * the entry back with a fresh TTL would let an attacker keep a code alive indefinitely by
         * guessing wrong at intervals.
         */
        Result consume(String key, String digest, int maxAttempts);

        Entry get(String key);

        void remove(String key);

        Duration timeToLive(String key);
    }
}
