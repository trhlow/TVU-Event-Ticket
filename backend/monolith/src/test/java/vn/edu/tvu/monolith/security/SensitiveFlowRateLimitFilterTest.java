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
