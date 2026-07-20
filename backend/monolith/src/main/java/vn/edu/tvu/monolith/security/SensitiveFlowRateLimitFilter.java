package vn.edu.tvu.monolith.security;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("prod")
@Order(10)
public class SensitiveFlowRateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MILLIS = 60_000L;
    private static final int LOGIN_LIMIT = 10;
    private static final int RESERVATION_LIMIT = 20;

    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public SensitiveFlowRateLimitFilter() {
        this(Clock.systemUTC());
    }

    SensitiveFlowRateLimitFilter(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!HttpMethod.POST.matches(request.getMethod())) {
            return true;
        }
        return !"/api/auth/login".equals(request.getRequestURI())
                && !"/api/reservations".equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        var now = clock.millis();
        var windowStart = now - now % WINDOW_MILLIS;
        var limit = "/api/auth/login".equals(request.getRequestURI()) ? LOGIN_LIMIT : RESERVATION_LIMIT;
        var key = request.getRequestURI() + ':' + clientAddress(request);
        var next = windows.compute(key, (ignored, current) -> current == null || current.windowStart() != windowStart
                ? new Window(windowStart, 1)
                : new Window(current.windowStart(), current.count() + 1));

        if (next.count() > limit) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.setHeader("Retry-After", Long.toString((windowStart + WINDOW_MILLIS - now + 999) / 1000));
            response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private String clientAddress(HttpServletRequest request) {
        var forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.trim();
        }
        return request.getRemoteAddr();
    }

    private record Window(long windowStart, int count) {
    }
}
