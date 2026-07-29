package vn.edu.tvu.auth.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Exercises the V13 CHECK constraints against a real PostgreSQL.
 *
 * <p>Service-level tests cannot stand in for this. They prove the application does not *try* to
 * write a bad row; only the database can prove a bad row is *refused* — including rows written by
 * a future code path, a manual fix during an incident, or the break-glass SQL in OPERATIONS.md.
 *
 * <p>Every case states ext_subject explicitly. An earlier draft of the matrix left it unset in the
 * rejection cases, which would have passed even against a constraint that ignored the column.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserRoleInvariantConstraintTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    private UUID clubId;

    @BeforeEach
    void seedClub() {
        clubId = UUID.randomUUID();
        jdbc.update("INSERT INTO clubs (id, name, status) VALUES (?, ?, 'ACTIVE')",
                clubId, "Club " + clubId);
    }

    /** Inserts a users row, letting the database decide whether it is allowed. */
    private void insert(String role, String authMethod, String extSubject, UUID club,
                        String mssv, String mssvStatus, String classCode) {
        jdbc.update("""
                INSERT INTO users (id, ext_subject, auth_method, email, display_name, mssv,
                                   mssv_status, class_code, role, club_id, status, auth_version)
                VALUES (?, ?, ?, ?, 'Test User', ?, ?, ?, ?, ?, 'ACTIVE', 0)
                """,
                UUID.randomUUID(), extSubject, authMethod, UUID.randomUUID() + "@tvu.edu.vn",
                mssv, mssvStatus, classCode, role, club);
    }

    private void insertStudent(String extSubject) {
        insert("SINH_VIEN", "MICROSOFT", extSubject, null, null, "UNVERIFIED", null);
    }

    @Nested
    @DisplayName("identity by role (H3)")
    class IdentityByRole {

        @Test
        void allowsStudentOnMicrosoftWithASubject() {
            assertThatCode(() -> insertStudent("entra-" + UUID.randomUUID())).doesNotThrowAnyException();
        }

        @Test
        void allowsOrganiserOnEmailOtpWithoutASubject() {
            assertThatCode(() -> insert("ORGANIZER", "EMAIL_OTP", null, clubId, null, "UNVERIFIED", null))
                    .doesNotThrowAnyException();
        }

        @Test
        void allowsSuperAdminOnEmailOtpWithoutASubject() {
            assertThatCode(() -> insert("SUPER_ADMIN", "EMAIL_OTP", null, null, null, "UNVERIFIED", null))
                    .doesNotThrowAnyException();
        }

        @Test
        void rejectsStudentWithoutASubject() {
            assertThatThrownBy(() -> insert("SINH_VIEN", "MICROSOFT", null, null, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsStudentOnTheEmailOtpPathWithoutASubject() {
            assertThatThrownBy(() -> insert("SINH_VIEN", "EMAIL_OTP", null, null, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsStudentOnTheEmailOtpPathWithASubject() {
            assertThatThrownBy(() -> insert("SINH_VIEN", "EMAIL_OTP", "entra-x", null, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("rejects an admin that carries an Entra subject — the row Entra login could reach")
        void rejectsOrganiserWithASubject() {
            // This exact shape is what H3 defends against: an admin account reachable from the
            // Entra flow. The database must refuse it even if some code path tries.
            assertThatThrownBy(() -> insert("ORGANIZER", "EMAIL_OTP", "entra-x", clubId, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsOrganiserOnTheMicrosoftPath() {
            assertThatThrownBy(() -> insert("ORGANIZER", "MICROSOFT", "entra-x", clubId, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsSuperAdminOnTheMicrosoftPath() {
            assertThatThrownBy(() -> insert("SUPER_ADMIN", "MICROSOFT", "entra-x", null, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("blocks the UPDATE path too, not only INSERT")
        void rejectsTurningAStudentIntoASubjectlessRow() {
            // A CHECK that only ever ran on INSERT would leave the whole invariant bypassable by
            // updating a row after the fact.
            var subject = "entra-" + UUID.randomUUID();
            insertStudent(subject);

            assertThatThrownBy(() -> jdbc.update("UPDATE users SET ext_subject = NULL WHERE ext_subject = ?", subject))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Nested
    @DisplayName("role invariants (M8)")
    class RoleInvariants {

        @Test
        void rejectsOrganiserWithoutAClub() {
            assertThatThrownBy(() -> insert("ORGANIZER", "EMAIL_OTP", null, null, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsStudentAttachedToAClub() {
            assertThatThrownBy(() -> insert("SINH_VIEN", "MICROSOFT", "entra-x", clubId, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsSuperAdminAttachedToAClub() {
            assertThatThrownBy(() -> insert("SUPER_ADMIN", "EMAIL_OTP", null, clubId, null, "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("rejects mssv_status VERIFIED with no mssv to have verified")
        void rejectsVerifiedWithoutMssv() {
            assertThatThrownBy(() -> insert("SINH_VIEN", "MICROSOFT", "entra-x", null, null, "VERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void allowsVerifiedWhenTheMssvIsPresent() {
            assertThatCode(() -> insert("SINH_VIEN", "MICROSOFT", "entra-" + UUID.randomUUID(), null,
                    "110121" + (100 + (int) (Math.random() * 800)), "VERIFIED", "DA20TTA"))
                    .doesNotThrowAnyException();
        }

        @Test
        void rejectsOrganiserCarryingStudentFields() {
            assertThatThrownBy(() -> insert("ORGANIZER", "EMAIL_OTP", null, clubId, "110121001", "UNVERIFIED", null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void rejectsOrganiserCarryingAClassCode() {
            assertThatThrownBy(() -> insert("ORGANIZER", "EMAIL_OTP", null, clubId, null, "UNVERIFIED", "DA20TTA"))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Test
    @DisplayName("V13 is recorded in flyway_schema_history")
    void migrationApplied() {
        // Guards the ordering rule: V12 (H8) then V13 (H3/M8). Numbering them the other way round
        // would force an out-of-order migration on a database that already ran the later one.
        var versions = jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE version IN ('12', '13') ORDER BY version",
                String.class);

        assertThat(versions).containsExactly("12", "13");
    }
}
