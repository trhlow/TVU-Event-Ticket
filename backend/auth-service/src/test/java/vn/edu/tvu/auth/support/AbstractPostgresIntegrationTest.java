package vn.edu.tvu.auth.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Reusable base for integration tests needing a real Postgres. The {@code @ServiceConnection}
 * container wires Spring's datasource automatically (no manual @DynamicPropertySource). The
 * container is static so it is shared across test classes that extend this base.
 */
@Testcontainers
public abstract class AbstractPostgresIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
}
