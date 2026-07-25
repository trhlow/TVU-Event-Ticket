package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.util.JSONObjectUtils;

import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.context.annotation.Profile;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@Profile("prod")
public class RestMicrosoftJwkSetClient implements MicrosoftJwkSetClient {

    /**
     * Microsoft rotates signing keys on the order of weeks, so a short cache is safe and an unknown key id
     * forces a refresh anyway. Without it every single login blocks on an outbound HTTPS call to
     * login.microsoftonline.com, which makes that endpoint's latency and availability our own.
     */
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final MicrosoftIdentityProperties properties;
    private final RestClient restClient;
    private final AtomicReference<CachedJwkSet> cached = new AtomicReference<>();

    public RestMicrosoftJwkSetClient(MicrosoftIdentityProperties properties) {
        this.properties = properties;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public JWKSet fetch(boolean forceRefresh) {
        var current = cached.get();
        if (!forceRefresh && current != null && current.fetchedAt().plus(CACHE_TTL).isAfter(Instant.now())) {
            return current.jwkSet();
        }
        var fresh = fetchFromMicrosoft();
        cached.set(new CachedJwkSet(fresh, Instant.now()));
        return fresh;
    }

    private record CachedJwkSet(JWKSet jwkSet, Instant fetchedAt) {}

    private JWKSet fetchFromMicrosoft() {
        try {
            var body = restClient.get()
                    .uri(properties.jwksUri())
                    .retrieve()
                    .body(String.class);
            return JWKSet.parse(JSONObjectUtils.parse(body));
        } catch (ParseException ex) {
            throw new IllegalStateException("Invalid Microsoft JWKS response", ex);
        }
    }
}
