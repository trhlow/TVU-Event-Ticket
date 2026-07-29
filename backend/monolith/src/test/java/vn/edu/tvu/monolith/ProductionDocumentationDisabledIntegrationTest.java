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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.web.servlet.handler.SimpleUrlHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Behavioural counterpart to {@link ProductionHealthConfigTest}, which only proves the shipped
 * YAML still says the right thing. This boots the application with the same settings production
 * documentation settings production uses — not the prod profile itself, which needs the full set of
 * production secrets to start — and asks the running server, so the claim "the documentation is not
 * served" rests on a response rather than on a property file.
 *
 * <p>The paths matter more than they look. Disabling springdoc removes its own handlers, but
 * Spring Boot separately maps {@code /webjars/**} onto {@code classpath:/META-INF/resources/webjars/},
 * and the swagger-ui webjar is still inside the jar — so {@code /webjars/swagger-ui/index.html}
 * reaches the same UI by another road, and webjars-locator-lite resolves the versionless form.
 * {@code spring.web.resources.add-mappings=false} is what closes that road.
 */
@SpringBootTest(classes = MonolithApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.rabbitmq.listener.simple.auto-startup=false",
            "springdoc.api-docs.enabled=false",
            "springdoc.swagger-ui.enabled=false",
            "spring.web.resources.add-mappings=false"
        })
class ProductionDocumentationDisabledIntegrationTest extends AbstractPostgresIntegrationTest {

    @LocalServerPort int port;

    @Autowired ApplicationContext context;

    @ParameterizedTest(name = "{0} is not served")
    @DisplayName("no route reaches the API documentation once production settings are applied")
    @ValueSource(strings = {
        "/v3/api-docs",
        "/v3/api-docs/swagger-config",
        "/swagger-ui/index.html",
        "/webjars/swagger-ui/index.html",
        "/webjars/swagger-ui/5.32.11/index.html"
    })
    void documentationPathsAreNotServed(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode())
                .as("%s must answer with a refusal, not content. An allowlist, not a blocklist: a 500"
                        + " does not serve the documentation either, but it is not evidence the route is"
                        + " closed and must not let a deploy go green", path)
                .isIn(401, 404);
    }

    /**
     * The check above cannot tell whether {@code /webjars/**} is gone or merely behind
     * authentication: an unauthenticated request gets 401 either way, because a 404 is forwarded to
     * {@code /error}, which {@code anyRequest().authenticated()} also covers. So assert the absence
     * where it is unambiguous — the resource handler table itself. Remove
     * {@code spring.web.resources.add-mappings=false} from this class and this test fails while the
     * HTTP ones stay green, which is precisely the gap it exists to cover.
     */
    @Test
    @DisplayName("no resource handler is mapped for /webjars/**, so the packaged UI has no second road")
    void noResourceHandlerServesWebjars() {
        // With add-mappings=false the bean resolves to null outright; with the default it is a
        // SimpleUrlHandlerMapping whose url map contains /webjars/**. Both shapes are handled so the
        // assertion states one thing: nothing serves that path.
        var mapping = context.getBean("resourceHandlerMapping");
        var servesWebjars = mapping instanceof SimpleUrlHandlerMapping urlMapping
                && urlMapping.getUrlMap().containsKey("/webjars/**");

        assertThat(servesWebjars)
                .as("Spring Boot maps /webjars/** onto classpath:/META-INF/resources/webjars/ by"
                        + " default, and swagger-ui is still packaged there; disabling springdoc does"
                        + " not touch that mapping")
                .isFalse();
    }
}
