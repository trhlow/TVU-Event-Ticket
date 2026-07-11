package vn.edu.tvu.ticket.client;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.ticket.event-client")
public record EventClientProperties(String baseUrl, Duration timeout) {

    public EventClientProperties {
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "http://localhost:8081";
        }
        if (timeout == null) {
            timeout = Duration.ofSeconds(3);
        }
    }
}
