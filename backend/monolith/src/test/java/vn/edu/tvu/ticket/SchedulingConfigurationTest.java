package vn.edu.tvu.ticket;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the one property migrate.sh depends on: the migration process must not schedule anything.
 *
 * <p>Written after a real production incident, not as a precaution. Scheduling was enabled for every
 * process that booted this application, so the Flyway-only run kept a non-daemon
 * {@code "scheduling-1"} thread alive and never exited -- the deploy hung at "Started
 * MonolithApplication" -- while that same thread ran the outbox relay and both reconcilers against
 * the production database for 8.7 days beside the real application.
 *
 * <p>Fast enough to run on every build precisely because it does not need a database: the question
 * is whether the annotation is gated, and that is answerable from the context alone.
 */
class SchedulingConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(SchedulingConfiguration.class);

    @Test
    @DisplayName("the migration profile schedules nothing, so the Flyway process can exit")
    void migrationProfileDisablesScheduling() {
        contextRunner
                .withPropertyValues("spring.profiles.active=prod,monolith,migration")
                .run(context -> assertThat(context)
                        .as("@EnableScheduling must not take effect under the migration profile: its "
                            + "scheduler threads are not daemon threads, so the migration JVM would "
                            + "never exit and deploy.sh would hang forever")
                        .doesNotHaveBean(ScheduledAnnotationBeanPostProcessor.class));
    }

    @Test
    @DisplayName("every other profile still schedules, so the background jobs really run")
    void normalProfilesKeepScheduling() {
        contextRunner
                .withPropertyValues("spring.profiles.active=prod,monolith")
                .run(context -> assertThat(context)
                        .as("gating scheduling must not switch off the outbox relay, the delivery "
                            + "reconciler or the counter reconciliation in the running application")
                        .hasSingleBean(ScheduledAnnotationBeanPostProcessor.class));
    }
}
