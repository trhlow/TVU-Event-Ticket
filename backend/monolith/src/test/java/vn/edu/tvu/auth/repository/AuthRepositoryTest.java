package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.ClubStatus;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
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

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    /**
     * V7 leaves {@code events.created_by} and {@code reservations.reviewed_by} unconstrained on purpose:
     * they are actor references, like {@code audit_log.actor_id}. So an organizer who has created events
     * and approved reservations is still deletable — the account goes, its historical actor references
     * simply point at an absent user. Before this was settled, those columns had foreign keys and the
     * delete raised {@link DataIntegrityViolationException}, which the auth advice turns into HTTP 500.
     */
    @Test
    void organizerWhoActedInTheSystemCanStillBeDeleted() {
        var club = clubRepository.saveAndFlush(new Club("CLB Su kien", "Ban to chuc su kien"));
        var organizer = userRepository.saveAndFlush(
                User.organizer("ext-org-1", "organizer@example.com", "Organizer One", club));
        var student = userRepository.saveAndFlush(
                User.student("ext-stu-1", "student@example.com", "Student One"));
        var eventId = UUID.randomUUID();
        jdbc.update("""
                insert into events (id, club_id, title, capacity, reg_open_at, reg_close_at, start_at,
                                    end_at, location, status, created_by, created_at, updated_at)
                values (?, ?, 'E', 10, now() - interval '1 day', now() + interval '1 day',
                        now() + interval '2 day', now() + interval '3 day', 'Hall', 'OPEN', ?, now(), now())
                """, eventId, club.getId(), organizer.getId());
        jdbc.update("""
                insert into reservations (id, event_id, club_id, student_id, student_email, student_mssv,
                                          status, idempotency_key, reviewed_by, event_title, event_start_at,
                                          event_end_at, event_location)
                values (?, ?, ?, ?, 'student@example.com', '110122001', 'APPROVED', 'idem-1', ?, 'E',
                        now() + interval '2 day', now() + interval '3 day', 'Hall')
                """, UUID.randomUUID(), eventId, club.getId(), student.getId(), organizer.getId());

        userRepository.delete(organizer);
        userRepository.flush();

        assertThat(userRepository.findById(organizer.getId())).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from events where created_by = ?",
                Integer.class, organizer.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from reservations where reviewed_by = ?",
                Integer.class, organizer.getId())).isEqualTo(1);
    }

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

    @Test
    void searchFiltersByOptionalRoleAndMssvStatus() {
        var verified = User.student("ext-search-v", "search-v@example.com", "Verified Student");
        verified.completeProfile("110900001", "DA21CNTT");
        verified.verifyMssv();
        userRepository.saveAndFlush(verified);
        var unverified = User.student("ext-search-u", "search-u@example.com", "Unverified Student");
        unverified.completeProfile("110900002", "DA21CNTT");
        userRepository.saveAndFlush(unverified);

        assertThat(userRepository.search(UserRole.SINH_VIEN, MssvStatus.UNVERIFIED))
                .extracting(User::getId).contains(unverified.getId()).doesNotContain(verified.getId());
        assertThat(userRepository.search(UserRole.SINH_VIEN, null))
                .extracting(User::getId).contains(verified.getId(), unverified.getId());
        assertThat(userRepository.search(null, null))
                .extracting(User::getId).contains(verified.getId(), unverified.getId());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void userRepositoryGroupsCountsByRole() {
        var club = clubRepository.saveAndFlush(new Club("CLB Stats " + UUID.randomUUID(), null));
        userRepository.saveAndFlush(User.student("ext-stats-1", "stats-student-1@example.com", "Student One"));
        userRepository.saveAndFlush(User.student("ext-stats-2", "stats-student-2@example.com", "Student Two"));
        userRepository.saveAndFlush(User.organizer("ext-stats-3", "stats-organizer@example.com", "Organizer One",
                club));

        var rows = userRepository.countGroupedByRole();

        var byRole = rows.stream().collect(java.util.stream.Collectors.toMap(
                UserRepository.UserRoleCountProjection::getRole,
                UserRepository.UserRoleCountProjection::getCount));
        assertThat(byRole.get(UserRole.SINH_VIEN)).isGreaterThanOrEqualTo(2L);
        assertThat(byRole.get(UserRole.ORGANIZER)).isGreaterThanOrEqualTo(1L);
    }
}
