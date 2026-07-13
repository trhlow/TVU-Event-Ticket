package vn.edu.tvu.gateway;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks")
class GatewayRoutingIntegrationTest {

    @LocalServerPort int port;

    @Autowired RouteDefinitionLocator routeDefinitions;

    @MockitoBean ReactiveJwtDecoder jwtDecoder;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
        var studentJwt = new Jwt("student-token", Instant.now(), Instant.now().plusSeconds(300),
                Map.of("alg", "RS256"), Map.of("sub", "student", "roles", List.of("SINH_VIEN")));
        when(jwtDecoder.decode("student-token")).thenReturn(Mono.just(studentJwt));
    }

    @Test
    void corsAllowsConfiguredOriginWithCredentialsAndRejectsForeignOrigin() {
        client.options().uri("/api/events")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name())
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Content-Type,X-XSRF-TOKEN")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173")
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");

        client.options().uri("/api/events")
                .header(HttpHeaders.ORIGIN, "https://foreign.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, HttpMethod.GET.name())
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
    }

    @Test
    void mutatingEventRouteRequiresOrganizerRole() {
        client.post().uri("/api/events")
                .header(HttpHeaders.AUTHORIZATION, "Bearer student-token")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void routesAllRequiredPrefixesToTheirOwningServices() {
        var routes = routeDefinitions.getRouteDefinitions().collectList().block();

        assertThat(routes).isNotNull();
        assertRoute(routes, "auth-service", "/api/auth/**", "/api/admin/**", "/.well-known/**");
        assertRoute(routes, "event-service", "/api/events/**");
        assertRoute(routes, "ticket-service", "/api/tickets/**", "/api/reservations/**", "/api/ticketing/**");
    }

    private void assertRoute(
            List<org.springframework.cloud.gateway.route.RouteDefinition> routes,
            String routeId,
            String... expectedPaths) {
        var route = routes.stream().filter(candidate -> routeId.equals(candidate.getId())).findFirst().orElseThrow();
        var configuredPaths = route.getPredicates().stream()
                .flatMap(predicate -> predicate.getArgs().values().stream())
                .toList();
        assertThat(configuredPaths).contains(expectedPaths);
    }
}
