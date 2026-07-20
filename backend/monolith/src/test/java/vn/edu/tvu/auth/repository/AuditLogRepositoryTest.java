package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AuditLogRepositoryTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void searchJoinsActorEmailAndKeepsEntriesWithoutAMatchingUser() {
        var actor = userRepository.saveAndFlush(actor("admin@example.com"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(UUID.randomUUID(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));

        var page = auditLogRepository.search(null, null, null, null,
                PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "a.createdAt")));

        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting(AuditLogRepository.AuditLogEntryProjection::getActorEmail)
                .containsExactlyInAnyOrder("admin@example.com", null);
    }

    @Test
    void searchFiltersByActorActionAndTimeWindow() {
        var actor = userRepository.saveAndFlush(actor("admin2@example.com"));
        var other = userRepository.saveAndFlush(actor("admin3@example.com"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.organizer.lock", "user",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(other.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        var pageable = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "a.createdAt"));

        assertThat(auditLogRepository.search(actor.getId(), null, null, null, pageable).getTotalElements())
                .isEqualTo(2);
        assertThat(auditLogRepository.search(null, "auth.organizer.lock", null, null, pageable)
                .getTotalElements()).isEqualTo(1);
        assertThat(auditLogRepository.search(null, null, Instant.now().plusSeconds(60), null, pageable)
                .getTotalElements()).isZero();
        assertThat(auditLogRepository.search(null, null, null, Instant.now().plusSeconds(60), pageable)
                .getTotalElements()).isEqualTo(3);
    }

    private static User actor(String email) {
        return User.superAdmin("ext-" + email, email, "Audit Actor");
    }
}
