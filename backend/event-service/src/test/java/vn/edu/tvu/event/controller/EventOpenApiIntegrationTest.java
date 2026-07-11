package vn.edu.tvu.event.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import vn.edu.tvu.event.support.AbstractPostgresIntegrationTest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class EventOpenApiIntegrationTest extends AbstractPostgresIntegrationTest {
    @LocalServerPort int port;

    @Test
    void exposesEventCrudAndStatusOperationsInOpenApi() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs")).build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("/api/events")
                .contains("/api/events/{eventId}")
                .contains("/api/events/{eventId}/status")
                .contains("/api/events/mine");
    }
}
