package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class AuthOpenApiIntegrationTest extends AbstractPostgresIntegrationTest {

    @LocalServerPort int port;

    @Test
    void exposesEpic1AuthAndAdministrationOperationsWithoutAuthentication() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs")).build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("/api/auth/login")
                .contains("/api/auth/me")
                .contains("/api/auth/me/profile")
                .contains("/api/auth/logout")
                .contains("/api/admin/clubs")
                .contains("/api/admin/organizers")
                .contains("/api/admin/stats")
                .contains("/api/admin/audit-log")
                .contains("/.well-known/jwks.json");
    }
}
