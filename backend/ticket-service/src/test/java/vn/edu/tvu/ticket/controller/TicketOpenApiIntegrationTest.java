package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.ticket.support.AbstractPostgresIntegrationTest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.task.scheduling.enabled=false", "spring.rabbitmq.listener.simple.auto-startup=false"})
class TicketOpenApiIntegrationTest extends AbstractPostgresIntegrationTest {

    @LocalServerPort int port;

    @Test
    void exposesEveryEpic4Operation() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs")).build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("/api/reservations")
                .contains("/api/reservations/me")
                .contains("/api/reservations/{reservationId}/approve")
                .contains("/api/reservations/{reservationId}/reject")
                .contains("/api/ticketing/events/{eventId}/availability")
                .contains("/api/ticketing/events/availability")
                .contains("/api/ticketing/check-in")
                .contains("/api/ticketing/events/{eventId}/attendees")
                .contains("/api/ticketing/events/{eventId}/attendees.csv")
                .contains("/api/ticketing/events/{eventId}/dashboard")
                .contains("/api/ticketing/dashboard/club")
                .contains("/api/ticketing/stats");
    }
}
