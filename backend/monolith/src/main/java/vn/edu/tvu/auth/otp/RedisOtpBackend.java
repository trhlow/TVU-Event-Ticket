package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import java.util.List;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class RedisOtpBackend implements OtpStore.Backend {

    /**
     * Compare, count and consume in one round trip.
     *
     * <p>A Lua script rather than MULTI/EXEC: the value has to be read before the comparison can be
     * made, and a GET before MULTI is outside the transaction, so two requests could both read the
     * same entry and both act on it. WATCH plus a retry loop would also work but is more moving
     * parts for the same guarantee. Redis runs a script to completion without interleaving.
     *
     * <p>On a wrong guess the original expiry is read and reapplied, so repeated failures cannot
     * keep a code alive past its ten minutes.
     */
    private static final DefaultRedisScript<String> CONSUME = new DefaultRedisScript<>("""
            local value = redis.call('GET', KEYS[1])
            if not value then
              return 'EXPIRED'
            end
            local separator = string.find(value, ':', 1, true)
            local storedDigest = string.sub(value, 1, separator - 1)
            local attempts = tonumber(string.sub(value, separator + 1))
            if storedDigest == ARGV[1] then
              redis.call('DEL', KEYS[1])
              return 'OK'
            end
            attempts = attempts + 1
            if attempts >= tonumber(ARGV[2]) then
              redis.call('DEL', KEYS[1])
            else
              local remaining = redis.call('PTTL', KEYS[1])
              redis.call('SET', KEYS[1], storedDigest .. ':' .. attempts)
              if remaining > 0 then
                redis.call('PEXPIRE', KEYS[1], remaining)
              end
            end
            return 'INVALID'
            """, String.class);

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
        redisTemplate.opsForValue().set(key, entry.digest() + ":" + entry.attempts(), ttl);
    }

    @Override
    public OtpStore.Result consume(String key, String digest, int maxAttempts) {
        var outcome = redisTemplate.execute(CONSUME, List.of(key), digest, String.valueOf(maxAttempts));
        return outcome == null ? OtpStore.Result.EXPIRED : OtpStore.Result.valueOf(outcome);
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
