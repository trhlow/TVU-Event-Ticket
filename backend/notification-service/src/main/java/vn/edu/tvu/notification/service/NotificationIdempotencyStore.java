package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationIdempotencyProperties;

import java.util.List;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class NotificationIdempotencyStore {

    private static final DefaultRedisScript<Long> RELEASE_LOCK = new DefaultRedisScript<>(
            """
            if redis.call('get', KEYS[1]) == ARGV[1] then
              return redis.call('del', KEYS[1])
            end
            return 0
            """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final NotificationIdempotencyProperties properties;

    public NotificationIdempotencyStore(
            StringRedisTemplate redisTemplate,
            NotificationIdempotencyProperties properties) {
        this.redisTemplate = redisTemplate;
        this.properties = properties;
    }

    public Claim claim(UUID messageId) {
        if (Boolean.TRUE.equals(redisTemplate.hasKey(doneKey(messageId)))) {
            return Claim.alreadyDone(messageId);
        }
        var owner = UUID.randomUUID().toString();
        if (!Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(lockKey(messageId), owner, properties.lockTtl()))) {
            return Claim.locked(messageId);
        }
        if (Boolean.TRUE.equals(redisTemplate.hasKey(doneKey(messageId)))) {
            release(Claim.acquired(messageId, owner));
            return Claim.alreadyDone(messageId);
        }
        return Claim.acquired(messageId, owner);
    }

    public void markDone(UUID messageId) {
        redisTemplate.opsForValue().set(doneKey(messageId), "1", properties.doneTtl());
    }

    public void release(Claim claim) {
        if (claim.owner() != null) {
            redisTemplate.execute(RELEASE_LOCK, List.of(lockKey(claim.messageId())), claim.owner());
        }
    }

    private String doneKey(UUID messageId) {
        return "notification:done:" + messageId;
    }

    private String lockKey(UUID messageId) {
        return "notification:lock:" + messageId;
    }

    public record Claim(Status status, UUID messageId, String owner) {

        public static Claim acquired(UUID messageId, String owner) {
            return new Claim(Status.ACQUIRED, messageId, owner);
        }

        public static Claim alreadyDone(UUID messageId) {
            return new Claim(Status.ALREADY_DONE, messageId, null);
        }

        public static Claim locked(UUID messageId) {
            return new Claim(Status.LOCKED, messageId, null);
        }
    }

    public enum Status {
        ACQUIRED,
        ALREADY_DONE,
        LOCKED
    }
}
