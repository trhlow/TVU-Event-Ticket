package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationIdempotencyProperties;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationIdempotencyStoreTest {

    @Mock StringRedisTemplate redisTemplate;
    @Mock ValueOperations<String, String> values;

    private NotificationIdempotencyStore store;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(values);
        store = new NotificationIdempotencyStore(redisTemplate,
                new NotificationIdempotencyProperties(Duration.ofDays(30), Duration.ofMinutes(2)));
    }

    @Test
    void acquiresLockThenMarksDoneForThirtyDays() {
        var messageId = UUID.randomUUID();
        when(redisTemplate.hasKey("notification:done:" + messageId)).thenReturn(false, false);
        when(values.setIfAbsent(eq("notification:lock:" + messageId), any(), eq(Duration.ofMinutes(2))))
                .thenReturn(true);

        var claim = store.claim(messageId);
        store.markDone(messageId);

        assertThat(claim.status()).isEqualTo(NotificationIdempotencyStore.Status.ACQUIRED);
        assertThat(claim.messageId()).isEqualTo(messageId);
        verify(values).set("notification:done:" + messageId, "1", Duration.ofDays(30));
    }

    @Test
    void returnsDuplicateOrLockedWithoutSending() {
        var doneId = UUID.randomUUID();
        var lockedId = UUID.randomUUID();
        when(redisTemplate.hasKey("notification:done:" + doneId)).thenReturn(true);
        when(redisTemplate.hasKey("notification:done:" + lockedId)).thenReturn(false);
        when(values.setIfAbsent(eq("notification:lock:" + lockedId), any(), any(Duration.class)))
                .thenReturn(false);

        assertThat(store.claim(doneId).status()).isEqualTo(NotificationIdempotencyStore.Status.ALREADY_DONE);
        assertThat(store.claim(lockedId).status()).isEqualTo(NotificationIdempotencyStore.Status.LOCKED);
    }
}
