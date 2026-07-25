package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.UUID;

public class OtpStore {

    static final Duration TTL = Duration.ofMinutes(10);
    static final Duration COOLDOWN = Duration.ofSeconds(60);
    static final Duration DAILY_WINDOW = Duration.ofHours(24);

    private final Backend backend;
    private final int maxAttempts;
    private final int maxSendsPerDay;

    public OtpStore(Backend backend, int maxAttempts, int maxSendsPerDay) {
        this.backend = backend;
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

    public void save(UUID userId, String code) {
        backend.put(key(userId), new Entry(code, 0), TTL);
    }

    /**
     * A consumed, expired and never-issued code are all reported as EXPIRED. The caller turns every
     * outcome into the same 401, so the distinction never reaches a client.
     */
    public Result verify(UUID userId, String code) {
        var key = key(userId);
        var entry = backend.get(key);
        if (entry == null) {
            return Result.EXPIRED;
        }
        if (entry.code().equals(code)) {
            backend.remove(key);
            return Result.OK;
        }
        var attempts = entry.attempts() + 1;
        if (attempts >= maxAttempts) {
            backend.remove(key);
        } else {
            backend.put(key, new Entry(entry.code(), attempts), backend.timeToLive(key));
        }
        return Result.INVALID;
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

    public record Entry(String code, int attempts) {
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

        Entry get(String key);

        void remove(String key);

        Duration timeToLive(String key);
    }
}
