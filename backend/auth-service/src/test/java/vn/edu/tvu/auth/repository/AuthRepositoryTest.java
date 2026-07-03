package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.ClubStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserRole;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AuthRepositoryTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Test
    void clubRepositorySavesActiveClubAndFindsByName() {
        var saved = clubRepository.saveAndFlush(new Club("CLB Tin hoc", "Sinh hoat hoc thuat CNTT"));

        assertThat(clubRepository.findByName("CLB Tin hoc"))
                .isPresent()
                .hasValueSatisfying(club -> {
                    assertThat(club.getId()).isEqualTo(saved.getId());
                    assertThat(club.getStatus()).isEqualTo(ClubStatus.ACTIVE);
                    assertThat(club.getCreatedAt()).isNotNull();
                });
    }

    @Test
    void userRepositorySavesStudentProfileAndFindsByIdentity() {
        var student = User.student("msal-subject-1", "student@example.com", "Nguyen Van A");
        student.completeProfile("110122001", "DA21CNTT");

        userRepository.saveAndFlush(student);

        assertThat(userRepository.findByExtSubject("msal-subject-1"))
                .isPresent()
                .hasValueSatisfying(found -> {
                    assertThat(found.getEmail()).isEqualTo("student@example.com");
                    assertThat(found.getRole()).isEqualTo(UserRole.SINH_VIEN);
                    assertThat(found.getStatus()).isEqualTo(UserStatus.ACTIVE);
                    assertThat(found.getMssv()).isEqualTo("110122001");
                    assertThat(found.getUpdatedAt()).isNotNull();
                });
        assertThat(userRepository.existsByMssv("110122001")).isTrue();
    }

    @Test
    void userRepositoryPersistsOrganizerClubScope() {
        var club = clubRepository.saveAndFlush(new Club("CLB Truyen thong", "Truyen thong su kien"));
        var organizer = User.organizer("msal-organizer-1", "organizer@example.com", "Tran Thi B", club);

        userRepository.saveAndFlush(organizer);

        assertThat(userRepository.findByEmail("organizer@example.com"))
                .isPresent()
                .hasValueSatisfying(found -> {
                    assertThat(found.getRole()).isEqualTo(UserRole.ORGANIZER);
                    assertThat(found.getClub()).isNotNull();
                    assertThat(found.getClub().getId()).isEqualTo(club.getId());
                });
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void usersAllowManyIncompleteProfilesButRejectDuplicateMssv() {
        userRepository.saveAndFlush(User.student("msal-null-1", "null1@example.com", "Null One"));
        userRepository.saveAndFlush(User.student("msal-null-2", "null2@example.com", "Null Two"));

        var first = User.student("msal-mssv-1", "mssv1@example.com", "MSSV One");
        first.completeProfile("110122999", "DA21CNTT");
        userRepository.saveAndFlush(first);

        var duplicate = User.student("msal-mssv-2", "mssv2@example.com", "MSSV Two");
        duplicate.completeProfile("110122999", "DA21CNTT");

        assertThatThrownBy(() -> userRepository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(userRepository.count()).isEqualTo(3);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void auditLogAllowsLocalRowsButDeduplicatesMessageId() {
        var adminId = UUID.randomUUID();
        auditLogRepository.saveAndFlush(AuditLog.local(adminId, "club.create", "club", UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(adminId, "account.lock", "user", UUID.randomUUID(), "{}"));

        var messageId = UUID.randomUUID();
        var organizerId = UUID.randomUUID();
        auditLogRepository.saveAndFlush(AuditLog.fromMessage(
                messageId, organizerId, "event.create", "event", UUID.randomUUID(), "{\"title\":\"Demo\"}"));

        assertThatThrownBy(() -> auditLogRepository.saveAndFlush(AuditLog.fromMessage(
                messageId, organizerId, "event.create", "event", UUID.randomUUID(), "{\"title\":\"Demo\"}")))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(auditLogRepository.countByMessageId(messageId)).isEqualTo(1);
        assertThat(auditLogRepository.count()).isEqualTo(3);
    }
}
