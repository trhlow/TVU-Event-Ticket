package vn.edu.tvu.monolith.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SensitiveFlowRateLimitFilterTest {

    @Test
    void rejectsTheEleventhLoginAttemptFromTheSameForwardedAddress() throws Exception {
        var filter = new SensitiveFlowRateLimitFilter(Clock.fixed(Instant.parse("2026-07-17T00:00:00Z"), ZoneOffset.UTC));

        for (var attempt = 0; attempt < 10; attempt++) {
            var response = send(filter, "/api/auth/login", "203.0.113.5");
            assertThat(response.getStatus()).isEqualTo(200);
        }

        var rejected = send(filter, "/api/auth/login", "203.0.113.5");

        assertThat(rejected.getStatus()).isEqualTo(429);
        assertThat(rejected.getHeader("Retry-After")).isEqualTo("60");
        assertThat(rejected.getContentAsString()).contains("RATE_LIMITED");
    }

    /**
     * The counter map is keyed by URI + client address and lives for the process lifetime. Entries whose
     * window has already elapsed can never be read again — they only ever get overwritten if that exact
     * client returns. On a public login endpoint the distinct-address population is unbounded, so without
     * eviction the map grows monotonically inside a 768 MB heap.
     */
    @Test
    void countersFromElapsedWindowsAreEvicted() throws Exception {
        var clock = new MutableClock(Instant.parse("2026-07-17T00:00:00Z"));
        var filter = new SensitiveFlowRateLimitFilter(clock);

        for (var i = 0; i < 500; i++) {
            send(filter, "/api/auth/login", "198.51.100." + i);
        }
        assertThat(filter.windows).hasSize(500);

        clock.advanceMinutes(2);
        send(filter, "/api/auth/login", "203.0.113.9");

        assertThat(filter.windows)
                .as("only the current window's counters are still reachable")
                .hasSize(1);
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advanceMinutes(int minutes) {
            instant = instant.plusSeconds(minutes * 60L);
        }

        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }

    @Test
    void doesNotThrottleAReadOnlyRequest() throws Exception {
        var filter = new SensitiveFlowRateLimitFilter(Clock.systemUTC());
        var request = new MockHttpServletRequest("GET", "/api/events");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    private MockHttpServletResponse send(SensitiveFlowRateLimitFilter filter, String path, String forwardedFor)
            throws Exception {
        var request = new MockHttpServletRequest("POST", path);
        request.addHeader("X-Forwarded-For", forwardedFor);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
