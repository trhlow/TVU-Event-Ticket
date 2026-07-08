package vn.edu.tvu.ticket.service;

import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class RedisTicketCounterService implements TicketCounterService {

    private static final String KEY_PREFIX = "ticket:remaining:";

    private final StringRedisTemplate redisTemplate;

    public RedisTicketCounterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void initialize(UUID eventId, int remainingTickets) {
        redisTemplate.opsForValue().set(key(eventId), Integer.toString(remainingTickets));
    }

    @Override
    public boolean tryReserve(UUID eventId) {
        Long remaining = redisTemplate.opsForValue().decrement(key(eventId));
        if (remaining == null) {
            return false;
        }
        if (remaining < 0) {
            release(eventId);
            return false;
        }
        return true;
    }

    @Override
    public void release(UUID eventId) {
        redisTemplate.opsForValue().increment(key(eventId));
    }

    private String key(UUID eventId) {
        return KEY_PREFIX + eventId;
    }
}
