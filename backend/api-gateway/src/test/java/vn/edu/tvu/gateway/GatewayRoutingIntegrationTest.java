package vn.edu.tvu.gateway;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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

    @Test
    void ticketingStatsRouteRejectsOrganizerButNotSuperAdmin() {
        stubJwt("organizer-stats-token", "organizer-stats", "ORGANIZER", UUID.randomUUID().toString());
        stubJwt("admin-stats-token", "admin-stats", "SUPER_ADMIN", null);

        client.get().uri("/api/ticketing/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer organizer-stats-token")
                .exchange()
                .expectStatus().isForbidden();

        client.get().uri("/api/ticketing/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer admin-stats-token")
                .exchange()
                .expectStatus().value(status -> assertThat(status).isNotEqualTo(403));
    }

    @Test
    void eventsStatsRouteRejectsAnonymousAndOrganizerButNotSuperAdmin() {
        stubJwt("organizer-events-stats-token", "organizer-events-stats", "ORGANIZER",
                UUID.randomUUID().toString());
        stubJwt("admin-events-stats-token", "admin-events-stats", "SUPER_ADMIN", null);

        client.get().uri("/api/events/stats")
                .exchange()
                .expectStatus().isUnauthorized();

        client.get().uri("/api/events/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer organizer-events-stats-token")
                .exchange()
                .expectStatus().isForbidden();

        client.get().uri("/api/events/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer admin-events-stats-token")
                .exchange()
                .expectStatus().value(status -> assertThat(status).isNotEqualTo(403));
    }

    private void stubJwt(String token, String subject, String role, String clubId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", subject);
        claims.put("roles", List.of(role));
        if (clubId != null) {
            claims.put("club_id", clubId);
        }
        var jwt = new Jwt(token, Instant.now(), Instant.now().plusSeconds(300), Map.of("alg", "RS256"), claims);
        when(jwtDecoder.decode(token)).thenReturn(Mono.just(jwt));
    }
}
