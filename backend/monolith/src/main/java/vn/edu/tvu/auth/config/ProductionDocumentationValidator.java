package vn.edu.tvu.auth.config;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Refuses to start production if anything re-enables the API documentation.
 *
 * <p>The settings live in {@code application-prod.yml} and a test asserts that file still contains
 * them, but a property file is only the lowest layer of Spring's resolution order: an environment
 * variable such as {@code SPRING_WEB_RESOURCES_ADD_MAPPINGS=true} — exactly the shape Docker
 * Compose {@code env_file} produces — overrides it silently. Nothing in the build would notice,
 * and the smoke test cannot see it either: {@code /webjars/**} answers 401 to an unauthenticated
 * caller whether the mapping exists or not, so re-enabling it looks identical from outside.
 *
 * <p>This reads the <em>effective</em> value instead, after every property source has had its say,
 * and fails startup rather than serving a Swagger UI nobody meant to publish. Absence counts as
 * enabled, because that is what each of these framework defaults means.
 *
 * <p>Lives in a {@code @Profile("prod")} bean for the same reason as
 * {@link ProductionSecretsValidator}: development and test contexts legitimately serve the
 * documentation, and this check must not reach them.
 */
@Component
@Profile("prod")
public class ProductionDocumentationValidator {

    /** Each of these defaults to true in the framework, so a missing value is a failure, not a pass. */
    private static final Map<String, String> MUST_BE_FALSE = new LinkedHashMap<>(Map.of(
            "springdoc.api-docs.enabled",
            "serves the OpenAPI document describing every endpoint, including administrative ones",
            "springdoc.swagger-ui.enabled",
            "serves the Swagger UI bundle, third-party JavaScript that has carried CVEs",
            "spring.web.resources.add-mappings",
            "maps /webjars/** onto the classpath, which is how a re-added swagger-ui webjar would serve again"));

    public ProductionDocumentationValidator(Environment environment) {
        MUST_BE_FALSE.forEach((property, consequence) -> {
            if (environment.getProperty(property, Boolean.class, true)) {
                throw new IllegalStateException(property + " must be false in production; it " + consequence
                        + ". application-prod.yml sets it, so a true value here means something overrode "
                        + "that file — check the environment for "
                        + property.toUpperCase().replace('.', '_').replace('-', '_'));
            }
        });
    }
}
