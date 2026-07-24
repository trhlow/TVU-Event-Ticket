package vn.edu.tvu.ticket.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Reusable base for ticket-module integration tests needing a real Postgres.
 *
 * <p>{@code @DirtiesContext} is load-bearing, not hygiene. JUnit's Testcontainers extension stops a
 * static {@code @Container} after each test class and starts it again for the next one, and the restarted
 * container gets a new mapped port. Without closing the context in between, the second class reuses the
 * cached context whose Hikari pool still points at the old port and every test dies on a 30-second
 * connection timeout. This only bites once a second class extends this base — which is why it stayed
 * hidden while {@code TicketRepositoryTest} was the only one. The auth module's equivalent base carries
 * the same annotation for the same reason.
 */
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class AbstractPostgresIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18.4-alpine");
}
