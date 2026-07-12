package vn.edu.tvu.gateway.security;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

@Component
public class SignedCsrfGlobalFilter implements GlobalFilter, Ordered {

    static final String CSRF_COOKIE = "XSRF-TOKEN";
    static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final String HMAC_SHA256 = "HmacSHA256";

    private final byte[] signingSecret;

    public SignedCsrfGlobalFilter(GatewayCsrfProperties properties) {
        this.signingSecret = properties.signingSecret().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!requiresProtection(exchange)) {
            return chain.filter(exchange);
        }
        return ReactiveSecurityContextHolder.getContext()
                .map(context -> context.getAuthentication())
                .filter(JwtAuthenticationToken.class::isInstance)
                .cast(JwtAuthenticationToken.class)
                .map(authentication -> valid(exchange, authentication))
                .defaultIfEmpty(false)
                .flatMap(valid -> valid ? chain.filter(exchange) : forbidden(exchange));
    }

    private boolean requiresProtection(ServerWebExchange exchange) {
        var method = exchange.getRequest().getMethod();
        if (method == null || method == HttpMethod.GET || method == HttpMethod.HEAD
                || method == HttpMethod.OPTIONS) {
            return false;
        }
        return !(method == HttpMethod.POST && "/api/auth/login".equals(exchange.getRequest().getPath().value()));
    }

    private boolean valid(ServerWebExchange exchange, JwtAuthenticationToken authentication) {
        var cookie = exchange.getRequest().getCookies().getFirst(CSRF_COOKIE);
        var header = exchange.getRequest().getHeaders().getFirst(CSRF_HEADER);
        var jwt = authentication.getToken();
        if (cookie == null || header == null || jwt.getId() == null || jwt.getExpiresAt() == null
                || jwt.getExpiresAt().isBefore(Instant.now())) {
            return false;
        }
        try {
            var cookieBytes = Base64.getUrlDecoder().decode(cookie.getValue());
            var headerBytes = Base64.getUrlDecoder().decode(header);
            var expected = sign(jwt.getId(), jwt.getExpiresAt());
            return MessageDigest.isEqual(cookieBytes, headerBytes)
                    && MessageDigest.isEqual(cookieBytes, expected);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private byte[] sign(String jti, Instant expiresAt) {
        try {
            var mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(signingSecret, HMAC_SHA256));
            return mac.doFinal((jti + expiresAt.getEpochSecond()).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to verify CSRF token", ex);
        }
    }

    private Mono<Void> forbidden(ServerWebExchange exchange) {
        var response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        var body = "{\"timestamp\":\"" + Instant.now() + "\",\"status\":403,"
                + "\"code\":\"CSRF_INVALID\",\"message\":\"CSRF token is missing or invalid\","
                + "\"path\":\"" + exchange.getRequest().getPath().value() + "\",\"fieldErrors\":null}";
        var buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 50;
    }
}
