package vn.edu.tvu.auth.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

/**
 * The validator exists because a property file is the weakest layer of Spring's resolution order.
 * These tests are written from that angle: not "does it read the file", but "does an override get
 * past it".
 */
class ProductionDocumentationValidatorTest {

    private static final String[] ALL = {
        "springdoc.api-docs.enabled",
        "springdoc.swagger-ui.enabled",
        "spring.web.resources.add-mappings"
    };

    private static MockEnvironment allDisabled() {
        var environment = new MockEnvironment();
        for (var property : ALL) {
            environment.setProperty(property, "false");
        }
        return environment;
    }

    @Test
    @DisplayName("starts when every documentation switch is off")
    void acceptsFullyDisabledDocumentation() {
        assertThatCode(() -> new ProductionDocumentationValidator(allDisabled())).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "{0}=true refuses startup")
    @DisplayName("one override is enough to stop production from starting")
    @ValueSource(strings = {
        "springdoc.api-docs.enabled",
        "springdoc.swagger-ui.enabled",
        "spring.web.resources.add-mappings"
    })
    void rejectsAnySingleOverride(String property) {
        var environment = allDisabled();
        environment.setProperty(property, "true");

        assertThatIllegalStateException()
                .isThrownBy(() -> new ProductionDocumentationValidator(environment))
                .withMessageContaining(property)
                .as("the message must name the property and the environment variable, or whoever hits"
                        + " this at deploy time has to go reading source to find the override");
    }

    @ParameterizedTest(name = "{0} absent refuses startup")
    @DisplayName("absence is not permission — each of these defaults to true in the framework")
    @ValueSource(strings = {
        "springdoc.api-docs.enabled",
        "springdoc.swagger-ui.enabled",
        "spring.web.resources.add-mappings"
    })
    void rejectsAnyMissingProperty(String property) {
        var environment = allDisabled();
        environment.getPropertySources().replace("mockProperties", strip(environment, property));

        assertThatIllegalStateException()
                .isThrownBy(() -> new ProductionDocumentationValidator(environment));
    }

    private static org.springframework.core.env.PropertySource<?> strip(MockEnvironment environment,
            String omitted) {
        var properties = new java.util.Properties();
        for (var property : ALL) {
            if (!property.equals(omitted)) {
                properties.setProperty(property, environment.getProperty(property));
            }
        }
        return new org.springframework.core.env.PropertiesPropertySource("mockProperties", properties);
    }
}
