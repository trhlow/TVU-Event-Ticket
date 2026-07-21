package vn.edu.tvu.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import tools.jackson.databind.ObjectMapper;

/** Verifies the CSRF token bound to the authenticated HttpOnly JWT cookie. */
@Component
public class CookieCsrfFilter extends OncePerRequestFilter {

    static final String CSRF_COOKIE = "XSRF-TOKEN";
    static final String CSRF_HEADER = "X-XSRF-TOKEN";
    static final String AUTH_COOKIE = "TVU_AUTH";
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final String signingSecret;

    @Autowired
    public CookieCsrfFilter(CsrfProperties properties) {
        this(properties.signingSecret());
    }

    public CookieCsrfFilter(String signingSecret) {
        this.signingSecret = signingSecret;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!requiresProtection(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        var jwt = authenticatedJwt();
        if (jwt == null || !valid(request, jwt)) {
            forbidden(response, request.getRequestURI());
            return;
        }
        filterChain.doFilter(request, response);
    }

    public static String sign(String signingSecret, String jti, Instant expiresAt) {
        try {
            var mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            var bytes = mac.doFinal((jti + expiresAt.getEpochSecond()).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to verify CSRF token", ex);
        }
    }

    private boolean requiresProtection(HttpServletRequest request) {
        var method = request.getMethod();
        if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method) || HttpMethod.OPTIONS.matches(method)) {
            return false;
        }
        if (HttpMethod.POST.matches(method) && "/api/auth/login".equals(request.getRequestURI())) {
            return false;
        }
        // CSRF is a browser-cookie concern. API clients authenticating with an
        // Authorization bearer token must retain their existing non-cookie API contract.
        return cookie(request, AUTH_COOKIE) != null;
    }

    private Jwt authenticatedJwt() {
        Authentication authentication = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken jwtAuthentication) {
            return jwtAuthentication.getToken();
        }
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            return jwt;
        }
        return null;
    }

    private boolean valid(HttpServletRequest request, Jwt jwt) {
        var cookie = cookie(request, CSRF_COOKIE);
        var header = request.getHeader(CSRF_HEADER);
        if (cookie == null || header == null || jwt.getId() == null || jwt.getExpiresAt() == null
                || jwt.getExpiresAt().isBefore(Instant.now())) {
            return false;
        }
        try {
            var cookieBytes = Base64.getUrlDecoder().decode(cookie.getValue());
            var headerBytes = Base64.getUrlDecoder().decode(header);
            var expected = Base64.getUrlDecoder().decode(sign(signingSecret, jwt.getId(), jwt.getExpiresAt()));
            return MessageDigest.isEqual(cookieBytes, headerBytes)
                    && MessageDigest.isEqual(cookieBytes, expected);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private Cookie cookie(HttpServletRequest request, String name) {
        var cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (var cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie;
            }
        }
        return null;
    }

    private void forbidden(HttpServletResponse response, String path) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpServletResponse.SC_FORBIDDEN);
        body.put("code", "CSRF_INVALID");
        body.put("message", "CSRF token is missing or invalid");
        body.put("path", path);
        body.put("fieldErrors", null);
        response.getWriter().write(OBJECT_MAPPER.writeValueAsString(body));
    }
}
