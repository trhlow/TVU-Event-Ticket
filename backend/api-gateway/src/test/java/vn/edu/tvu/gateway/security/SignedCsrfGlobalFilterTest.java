package vn.edu.tvu.gateway.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

class SignedCsrfGlobalFilterTest {

    private static final String SECRET = "test-csrf-secret";
    private final SignedCsrfGlobalFilter filter =
            new SignedCsrfGlobalFilter(new GatewayCsrfProperties(SECRET));

    @Test
    void acceptsSignedTokenBoundToCurrentJwt() throws Exception {
        var jwt = jwt("jti-current", Instant.now().plusSeconds(300));
        var token = sign(jwt.getId(), jwt.getExpiresAt());
        var exchange = exchange("/api/events", token, token);
        var invoked = new AtomicBoolean();

        filter.filter(exchange, forwarded -> {
            invoked.set(true);
            return Mono.empty();
        }).contextWrite(ReactiveSecurityContextHolder.withAuthentication(new JwtAuthenticationToken(jwt))).block();

        assertThat(invoked).isTrue();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void rejectsMissingMismatchedInvalidAndJwtBoundTokens() throws Exception {
        var jwt = jwt("jti-current", Instant.now().plusSeconds(300));
        var valid = sign(jwt.getId(), jwt.getExpiresAt());
        var anotherJwtToken = sign("jti-other", jwt.getExpiresAt());

        assertRejected(exchange("/api/events", null, valid), jwt);
        assertRejected(exchange("/api/events", valid, "different"), jwt);
        assertRejected(exchange("/api/events", valid, valid.substring(1)), jwt);
        assertRejected(exchange("/api/events", anotherJwtToken, anotherJwtToken), jwt);
    }

    @Test
    void exemptsSafeMethodsAndLogin() {
        var getInvoked = new AtomicBoolean();
        var getExchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/events"));
        filter.filter(getExchange, forwarded -> {
            getInvoked.set(true);
            return Mono.empty();
        }).block();

        var loginInvoked = new AtomicBoolean();
        var loginExchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/auth/login"));
        filter.filter(loginExchange, forwarded -> {
            loginInvoked.set(true);
            return Mono.empty();
        }).block();

        assertThat(getInvoked).isTrue();
        assertThat(loginInvoked).isTrue();
    }

    private void assertRejected(MockServerWebExchange exchange, Jwt jwt) {
        var invoked = new AtomicBoolean();
        filter.filter(exchange, forwarded -> {
            invoked.set(true);
            return Mono.empty();
        }).contextWrite(ReactiveSecurityContextHolder.withAuthentication(new JwtAuthenticationToken(jwt))).block();

        assertThat(invoked).isFalse();
        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(403);
    }

    private MockServerWebExchange exchange(String path, String cookie, String header) {
        var request = MockServerHttpRequest.post(path);
        if (cookie != null) {
            request.cookie(new HttpCookie(SignedCsrfGlobalFilter.CSRF_COOKIE, cookie));
        }
        if (header != null) {
            request.header(SignedCsrfGlobalFilter.CSRF_HEADER, header);
        }
        return MockServerWebExchange.from(request);
    }

    private Jwt jwt(String jti, Instant expiresAt) {
        return new Jwt("token", Instant.now(), expiresAt, Map.of("alg", "RS256"),
                Map.of("sub", "user", "jti", jti));
    }

    private String sign(String jti, Instant expiresAt) throws Exception {
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        var bytes = mac.doFinal((jti + expiresAt.getEpochSecond()).getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
