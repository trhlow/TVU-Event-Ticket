package vn.edu.tvu.monolith;

import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;
import vn.edu.tvu.MonolithApplication;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The other half of {@link ProductionDocumentationDisabledIntegrationTest}: production must not
 * serve the documentation, and everywhere else must still serve what it serves today.
 *
 * <p>This exists because {@code /webjars/**} is now {@code denyAll()} in {@code SecurityConfig},
 * which is not profile-scoped, so it had to be shown that nothing outside production depended on
 * that path.
 *
 * <p>What "the documentation" means here is narrower than it sounds, and was measured rather than
 * assumed. Only the OpenAPI document serves: {@code /v3/api-docs} and its {@code swagger-config}
 * both answer 200. The Swagger UI <em>page</em> does not, and did not before this change either —
 * {@code /swagger-ui/index.html} and {@code /swagger-ui/swagger-ui.css} answer 401 in every
 * profile, which is a 404 forwarded to {@code /error} and refused there. So the webjar is packaged,
 * and was pinned to clear a CVE, for a UI this application never actually renders. Worth removing
 * outright, but that is a dependency change and not this commit's business.
 */
@SpringBootTest(classes = MonolithApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class DevelopmentDocumentationAvailableIntegrationTest extends AbstractPostgresIntegrationTest {

    @LocalServerPort int port;

    private HttpResponse<String> get(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    @DisplayName("the OpenAPI document still serves outside production, denyAll notwithstanding")
    void openApiDocumentIsStillAvailable() throws Exception {
        assertThat(get("/v3/api-docs").statusCode())
                .as("if this breaks, the denyAll on /webjars/** took the development documentation"
                        + " with it")
                .isEqualTo(200);
    }

    @Test
    @DisplayName("the UI's own config endpoint still answers outside production")
    void swaggerConfigurationIsStillReachable() throws Exception {
        var response = get("/v3/api-docs/swagger-config");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .as("an empty or error body means a client would render and then fail to find a spec")
                .contains("/v3/api-docs");
    }
}
