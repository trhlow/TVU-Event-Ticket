package vn.edu.tvu.monolith.security;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
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
    /** Package-private so the eviction test can observe that elapsed windows are actually dropped. */
    final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicLong purgedWindow = new java.util.concurrent.atomic.AtomicLong(-1);

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
        return !isLoginLike(request.getRequestURI())
                && !"/api/reservations".equals(request.getRequestURI());
    }

    private boolean isLoginLike(String uri) {
        return "/api/auth/login".equals(uri)
                || "/api/auth/otp/request".equals(uri)
                || "/api/auth/otp/verify".equals(uri)
                // The endpoint that trades a device cookie for a JWT. It was the one sensitive flow
                // left uncovered, despite being the cheapest to hammer: no code, no password, just a
                // cookie guess per request.
                || "/api/auth/session/refresh".equals(uri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        var now = clock.millis();
        var windowStart = now - now % WINDOW_MILLIS;
        var limit = isLoginLike(request.getRequestURI()) ? LOGIN_LIMIT : RESERVATION_LIMIT;
        purgeElapsedWindows(windowStart);
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

    /**
     * Drops counters whose window has elapsed. Runs at most once per window: the CAS makes the first
     * request of a new window pay the sweep and every later request in that window skip it, so the cost
     * is one pass per minute rather than one per request.
     */
    private void purgeElapsedWindows(long windowStart) {
        var previous = purgedWindow.get();
        if (previous != windowStart && purgedWindow.compareAndSet(previous, windowStart)) {
            windows.values().removeIf(window -> window.windowStart() != windowStart);
        }
    }

    /**
     * X-Forwarded-For is only evidence when our own reverse proxy set it. Caddy replaces the header with
     * the real peer ({@code header_up X-Forwarded-For {remote_host}}) and reaches the application over the
     * container network, so the header is honoured for a loopback or private-range peer and ignored for
     * anyone else. Without that check, an application reachable on a public port lets every caller mint a
     * fresh counter by varying the header, which removes the limit exactly where it is the only guard.
     */
    private String clientAddress(HttpServletRequest request) {
        var forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank() && isTrustedProxy(request.getRemoteAddr())) {
            // The proxy sends one address; a comma only appears if something upstream appended, in which
            // case the left-most entry is still the closest thing to the originating client.
            var first = forwarded.split(",", 2)[0].trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        return request.getRemoteAddr();
    }

    private boolean isTrustedProxy(String remoteAddress) {
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return false;
        }
        try {
            var address = InetAddress.getByName(remoteAddress);
            return address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress();
        } catch (UnknownHostException ex) {
            return false;
        }
    }

    private record Window(long windowStart, int count) {
    }
}
