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
 * here is the shipped file itself: these two settings are a deliberate, easily-reverted
 * trade-off and the reasoning lives in the assertions below.
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
}
