package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.util.JSONObjectUtils;

import java.text.ParseException;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@Profile("prod")
public class RestMicrosoftJwkSetClient implements MicrosoftJwkSetClient {

    private final MicrosoftIdentityProperties properties;
    private final RestClient restClient;

    public RestMicrosoftJwkSetClient(MicrosoftIdentityProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder.build();
    }

    @Override
    public JWKSet fetch() {
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
