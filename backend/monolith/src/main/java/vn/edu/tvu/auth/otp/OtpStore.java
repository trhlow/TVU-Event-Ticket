package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.UUID;

public class OtpStore {

    static final Duration TTL = Duration.ofMinutes(10);

    private final Backend backend;
    private final int maxAttempts;

    public OtpStore(Backend backend, int maxAttempts) {
        this.backend = backend;
        this.maxAttempts = maxAttempts;
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

        void put(String key, Entry entry, Duration ttl);

        Entry get(String key);

        void remove(String key);

        Duration timeToLive(String key);
    }
}
