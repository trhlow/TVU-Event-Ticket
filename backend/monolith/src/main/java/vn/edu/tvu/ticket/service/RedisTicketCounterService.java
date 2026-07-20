package vn.edu.tvu.ticket.service;

import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

@Service
public class RedisTicketCounterService implements TicketCounterService {

    private static final String KEY_PREFIX = "ticket:remaining:";
    private static final DefaultRedisScript<Long> RESERVE_SCRIPT = new DefaultRedisScript<>(
            "local current = tonumber(redis.call('GET', KEYS[1])); "
                    + "if not current or current <= 0 then return -1; end; "
                    + "return redis.call('DECR', KEYS[1]);",
            Long.class);

    private final StringRedisTemplate redisTemplate;

    public RedisTicketCounterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void seedIfMissing(UUID eventId, int remainingTickets) {
        redisTemplate.opsForValue().setIfAbsent(key(eventId), Integer.toString(Math.max(0, remainingTickets)));
    }

    @Override
    public boolean tryReserve(UUID eventId) {
        Long remaining = redisTemplate.execute(RESERVE_SCRIPT, java.util.List.of(key(eventId)));
        return remaining != null && remaining >= 0;
    }

    @Override
    public void release(UUID eventId) {
        redisTemplate.opsForValue().increment(key(eventId));
    }

    @Override
    public int remaining(UUID eventId) {
        var value = redisTemplate.opsForValue().get(key(eventId));
        return value == null ? -1 : Integer.parseInt(value);
    }

    private String key(UUID eventId) {
        return KEY_PREFIX + eventId;
    }
}
