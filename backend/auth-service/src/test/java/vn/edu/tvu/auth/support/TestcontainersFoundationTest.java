package vn.edu.tvu.auth.support;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the Testcontainers foundation (T0.6): a @DataJpaTest runs against a real Postgres container
 * rather than an embedded DB. Real entities/migrations arrive in EPIC 1.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TestcontainersFoundationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private EntityManager entityManager;

    @Test
    void runsAgainstRealPostgresContainer() {
        Number one = (Number) entityManager.createNativeQuery("SELECT 1").getSingleResult();
        assertThat(one.intValue()).isEqualTo(1);
        assertThat(POSTGRES.isRunning()).isTrue();
    }
}
