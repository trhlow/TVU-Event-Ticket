package vn.edu.tvu.monolith;

import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;
import vn.edu.tvu.MonolithApplication;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
 * assumed. Only the OpenAPI document serves: {@code /v3/api-docs} answers 200. The Swagger UI page
 * never rendered in this application even when its dependency was present, so the project moved to
 * springdoc's api starter and the UI paths are gone everywhere — including
 * {@code /v3/api-docs/swagger-config}, which the ui starter registered and which now answers 401
 * like any other absent path.
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

    @ParameterizedTest(name = "{0} is not served anywhere")
    @DisplayName("the UI paths are gone in every profile, not only production")
    @ValueSource(strings = {
        "/v3/api-docs/swagger-config",
        "/swagger-ui.html",
        "/swagger-ui/index.html",
        "/webjars/swagger-ui/index.html"
    })
    void swaggerUiPathsAreGoneEverywhere(String path) throws Exception {
        assertThat(get(path).statusCode())
                .as("%s belonged to the ui starter. Keeping this asserted means re-adding that"
                        + " dependency shows up as a failing test rather than as a quietly larger"
                        + " artifact", path)
                .isIn(401, 404);
    }
}
