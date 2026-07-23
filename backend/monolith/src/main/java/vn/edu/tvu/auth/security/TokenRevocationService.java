package vn.edu.tvu.auth.security;

import java.time.Duration;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Revokes already-issued internal JWTs before they expire on their own. The tokens are stateless, so
 * locking an account cannot invalidate them at the source; instead the account's user id is recorded in
 * Redis and every request checks against it ({@link RevokedTokenValidator}).
 *
 * <p>The revocation entry lives for exactly one JWT TTL: any token still valid at the moment of revocation
 * was minted at most one TTL ago, so an entry that survives one TTL from now outlasts every token it must
 * block, and then expires by itself — no unbounded growth, no sweep job.
 */
@Component
public class TokenRevocationService {

    private final StringRedisTemplate redisTemplate;
    private final Duration ttl;

    public TokenRevocationService(StringRedisTemplate redisTemplate, JwtProperties jwtProperties) {
        this.redisTemplate = redisTemplate;
        this.ttl = jwtProperties.ttl();
    }

    public void revoke(UUID userId) {
        redisTemplate.opsForValue().set(key(userId.toString()), "1", ttl);
    }

    public boolean isRevoked(String subject) {
        return subject != null && Boolean.TRUE.equals(redisTemplate.hasKey(key(subject)));
    }

    private String key(String subject) {
        return "auth:revoked:" + subject;
    }
}
