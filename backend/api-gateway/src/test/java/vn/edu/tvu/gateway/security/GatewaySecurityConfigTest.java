package vn.edu.tvu.gateway.security;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;

class GatewaySecurityConfigTest {

    private final GatewaySecurityConfig config = new GatewaySecurityConfig();

    @Test
    void bearerTokenConverterReadsJwtFromHttpOnlyCookie() {
        var converter = config.bearerTokenConverter(new GatewayAuthProperties("TVU_AUTH"));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/")
                .cookie(new HttpCookie("TVU_AUTH", "cookie-token")));

        var authentication = converter.convert(exchange).block();

        assertThat(authentication).isInstanceOf(BearerTokenAuthenticationToken.class);
        assertThat(((BearerTokenAuthenticationToken) authentication).getToken()).isEqualTo("cookie-token");
    }

    @Test
    void bearerTokenConverterPrefersAuthorizationHeader() {
        var converter = config.bearerTokenConverter(new GatewayAuthProperties("TVU_AUTH"));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/")
                .header("Authorization", "Bearer header-token")
                .cookie(new HttpCookie("TVU_AUTH", "cookie-token")));

        var authentication = converter.convert(exchange).block();

        assertThat(((BearerTokenAuthenticationToken) authentication).getToken()).isEqualTo("header-token");
    }

    @Test
    void jwtAuthenticationConverterMapsRolesClaimToSpringAuthorities() {
        var jwt = new Jwt(
                "token",
                Instant.now(),
                Instant.now().plusSeconds(60),
                Map.of("alg", "none"),
                Map.of("sub", "user-id", "roles", List.of("ORGANIZER")));

        var authentication = config.jwtAuthenticationConverter().convert(jwt).block();

        assertThat(authentication.getAuthorities())
                .extracting("authority")
                .containsExactly("ROLE_ORGANIZER");
    }
}
