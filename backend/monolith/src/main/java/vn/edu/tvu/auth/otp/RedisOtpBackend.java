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
        // SET NX EX creates the counter and its expiry in one command. Incrementing first and expiring
        // afterwards would leave an immortal counter behind if the process died between the two, and a
        // daily cap that never resets bars that address from ever receiving a code again. Only creation
        // carries the TTL, so later increments cannot push the window forward into a cap that never lapses.
        redisTemplate.opsForValue().setIfAbsent(key, "0", ttl);
        var count = redisTemplate.opsForValue().increment(key);
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
