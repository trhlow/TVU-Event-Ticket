package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class RedisOtpBackend implements OtpStore.Backend {

    private final StringRedisTemplate redisTemplate;

    public RedisOtpBackend(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public boolean putIfAbsent(String key, Duration ttl) {
        return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(key, "1", ttl));
    }

    @Override
    public long increment(String key, Duration ttl) {
        var count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            // Only the counter that created the key sets its expiry, so a busy day cannot keep pushing the
            // window forward and turn the daily cap into a rolling one that never resets.
            redisTemplate.expire(key, ttl);
        }
        return count == null ? 0L : count;
    }

    @Override
    public void put(String key, OtpStore.Entry entry, Duration ttl) {
        redisTemplate.opsForValue().set(key, entry.code() + ":" + entry.attempts(), ttl);
    }

    @Override
    public OtpStore.Entry get(String key) {
        var value = redisTemplate.opsForValue().get(key);
        if (value == null) {
            return null;
        }
        var separator = value.lastIndexOf(':');
        return new OtpStore.Entry(value.substring(0, separator),
                Integer.parseInt(value.substring(separator + 1)));
    }

    @Override
    public void remove(String key) {
        redisTemplate.delete(key);
    }

    @Override
    public Duration timeToLive(String key) {
        var seconds = redisTemplate.getExpire(key, TimeUnit.SECONDS);
        // A missing or non-expiring key falls back to a fresh window rather than a value the API cannot
        // represent as a positive TTL.
        return seconds == null || seconds < 0 ? OtpStore.TTL : Duration.ofSeconds(seconds);
    }
}
