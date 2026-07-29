package vn.edu.tvu.monolith;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * Reads application-prod.yml directly rather than booting a context, because what matters
 * here is the shipped file itself: these settings are deliberate, easily-reverted trade-offs
 * and the reasoning lives in the assertions below.
 */
class ProductionHealthConfigTest {

    private static PropertySource<?> productionProperties() throws IOException {
        var sources = new YamlPropertySourceLoader()
                .load("application-prod", new ClassPathResource("application-prod.yml"));
        assertThat(sources).hasSize(1);
        return sources.getFirst();
    }

    @Test
    @DisplayName("mail health indicator is on, so a broken SMTP shows up before an admin needs to log in")
    void mailHealthIndicatorIsEnabled() throws IOException {
        assertThat(productionProperties().getProperty("management.health.mail.enabled"))
                .as("EMAIL_OTP is the only way an admin can sign in; if SMTP is broken and nothing"
                        + " reports it, the first person to find out is an admin who is already locked out")
                .isEqualTo(true);
    }

    @Test
    @DisplayName("readiness stays db,redis,rabbit — mail must not gate traffic")
    void readinessGroupExcludesMail() throws IOException {
        assertThat(productionProperties().getProperty("management.endpoint.health.group.readiness.include"))
                .as("Adding mail here would take the whole site out of rotation the moment SMTP"
                        + " wobbles, even though students browsing events need no email at all")
                .isEqualTo("db,redis,rabbit");
    }

    @Test
    @DisplayName("OpenAPI document is off in production, so the endpoint does not exist to be exposed")
    void apiDocsDisabledInProduction() throws IOException {
        assertThat(productionProperties().getProperty("springdoc.api-docs.enabled"))
                .as("Caddy not routing /v3/api-docs and the container not publishing a port are"
                        + " properties of the environment: one stray `ports:` line added while debugging"
                        + " undoes both. This default ships with the artifact instead. It guards the"
                        + " shipped file only — an environment variable can still override it, which is"
                        + " what smoke-test.sh checks against the running application")
                .isEqualTo(false);
    }

    @Test
    @DisplayName("Swagger UI is off in production — its bundle is the part that carries CVEs")
    void swaggerUiDisabledInProduction() throws IOException {
        assertThat(productionProperties().getProperty("springdoc.swagger-ui.enabled"))
                .as("The swagger-ui webjar is third-party JavaScript shipped inside our jar; it is"
                        + " what forced the DOMPurify pin. Production has no reason to serve it")
                .isEqualTo(false);
    }
}
