package vn.edu.tvu.gateway.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class JwtRelayGlobalFilterTest {
    @Test
    void relaysAuthenticatedJwtAsBearerHeader() {
        Jwt jwt = new Jwt("signed-token", Instant.now(), Instant.now().plusSeconds(60),
                Map.of("alg", "RS256"), Map.of("sub", "user"));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/events/mine"));
        var filter = new JwtRelayGlobalFilter();
        var captured = new ServerWebExchangeHolder();

        filter.filter(exchange, forwarded -> {
            captured.exchange = forwarded;
            return Mono.empty();
        }).contextWrite(ReactiveSecurityContextHolder.withAuthentication(new JwtAuthenticationToken(jwt))).block();

        assertThat(captured.exchange.getRequest().getHeaders().getFirst("Authorization"))
                .isEqualTo("Bearer signed-token");
    }

    private static final class ServerWebExchangeHolder {
        private org.springframework.web.server.ServerWebExchange exchange;
    }
}
