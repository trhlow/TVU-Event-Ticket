package vn.edu.tvu.ticket.client;

import java.net.http.HttpClient;

import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
@Profile("!monolith")
public class EventClient implements EventLookup {

    private final RestClient restClient;

    public EventClient(EventClientProperties properties) {
        var httpClient = HttpClient.newBuilder().connectTimeout(properties.timeout()).build();
        var requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(properties.timeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    public EventSnapshot getOpenEvent(java.util.UUID eventId) {
        try {
            var snapshot = restClient.get()
                    .uri("/api/events/{eventId}", eventId)
                    .retrieve()
                    .body(EventSnapshot.class);
            if (snapshot == null) {
                throw unavailable();
            }
            return snapshot;
        } catch (HttpClientErrorException.NotFound ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found", ex);
        } catch (HttpClientErrorException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Event is not open for registration", ex);
        } catch (RestClientException ex) {
            throw unavailable();
        }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Event service is unavailable");
    }
}
