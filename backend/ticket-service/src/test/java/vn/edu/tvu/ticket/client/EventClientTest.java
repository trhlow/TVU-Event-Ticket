package vn.edu.tvu.ticket.client;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EventClientTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void getOpenEventMapsAuthoritativeSnapshot() throws Exception {
        var eventId = UUID.randomUUID();
        start(exchange -> respond(exchange, 200, json(eventId)));

        var result = client(Duration.ofSeconds(1)).getOpenEvent(eventId);

        assertThat(result.id()).isEqualTo(eventId);
        assertThat(result.clubId()).isNotNull();
        assertThat(result.capacity()).isEqualTo(25);
        assertThat(result.status()).isEqualTo("OPEN");
    }

    @Test
    void getOpenEventMapsNotFoundAndServerFailure() throws Exception {
        var eventId = UUID.randomUUID();
        start(exchange -> respond(exchange, 404, "{}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(1)).getOpenEvent(eventId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
        server.stop(0);
        start(exchange -> respond(exchange, 500, "{}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(1)).getOpenEvent(eventId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void getOpenEventMapsReadTimeoutToServiceUnavailable() throws Exception {
        var eventId = UUID.randomUUID();
        start(exchange -> {
            try {
                Thread.sleep(250);
                respond(exchange, 200, json(eventId));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        });

        assertThatThrownBy(() -> client(Duration.ofMillis(50)).getOpenEvent(eventId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    private EventClient client(Duration timeout) {
        return new EventClient(new EventClientProperties("http://localhost:" + server.getAddress().getPort(), timeout));
    }

    private void start(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/api/events", handler);
        server.start();
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        var bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private String json(UUID eventId) {
        return """
                {"id":"%s","clubId":"%s","title":"Event","description":"Demo","capacity":25,
                 "registrationOpenAt":"2026-07-01T00:00:00Z","registrationCloseAt":"2026-07-20T00:00:00Z",
                 "startAt":"2026-07-21T00:00:00Z","endAt":"2026-07-21T02:00:00Z","location":"TVU",
                 "status":"OPEN","createdBy":"%s","createdAt":"2026-06-01T00:00:00Z",
                 "updatedAt":"2026-06-01T00:00:00Z"}
                """.formatted(eventId, UUID.randomUUID(), UUID.randomUUID());
    }
}
