package vn.edu.tvu.ticket;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables the background jobs -- everywhere except the one-shot migration process.
 *
 * <p>{@code @EnableScheduling} used to sit on {@link TicketFeatureConfiguration}, where it applied
 * to every process that booted this application, including the {@code compose run --rm} that
 * migrate.sh uses to run Flyway. That had two consequences, both observed on the real VPS rather
 * than reasoned about:
 *
 * <ul>
 *   <li>Spring's default {@code ThreadPoolTaskScheduler} threads are NOT daemon threads, so the
 *       migration JVM never exited after Flyway finished. A thread dump showed exactly one
 *       application thread alive -- {@code "scheduling-1"} -- with {@code DestroyJavaVM} waiting on
 *       it. The deploy hung at "Started MonolithApplication" every time.
 *   <li>Worse than hanging: while it hung, it kept working. A leftover migration container ran for
 *       8.7 days accumulating 5 minutes of CPU, executing OutboxRelayService every 5 seconds,
 *       DeliveryReconciler every 60, and the counter reconciliation every 5 minutes -- a second
 *       relay against the production database, beside the real application's own.
 * </ul>
 *
 * <p>Turning off one offending thread at a time is what produced this bug: an earlier fix passed
 * {@code --spring.rabbitmq.listener.*.auto-startup=false} for the same reason, and scheduling was
 * simply the next non-daemon thread in line. This profile is the single place to say "this process
 * runs Flyway and exits, it does not do background work", so the next such component is covered
 * without another production incident to discover it.
 */
@Configuration
@Profile("!migration")
@EnableScheduling
public class SchedulingConfiguration {
}
