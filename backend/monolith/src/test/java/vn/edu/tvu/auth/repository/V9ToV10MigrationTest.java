package vn.edu.tvu.auth.repository;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Migrates a database that already holds data, rather than an empty one.
 *
 * <p>Every other migration test here runs against a fresh schema, which proves the SQL is valid but
 * not that it survives contact with existing rows. V10 is the one that rewrites data: it moves
 * organisers and super admins onto the emailed-code path and drops their Entra subjects. If that
 * ever stopped working, the symptom would not be a failed deploy — it would be admin accounts still
 * reachable from the Microsoft login, which is the exact hole H3 exists to close.
 *
 * <p>Relevant beyond the first deploy: staging refreshes and any future import into production both
 * migrate a populated database.
 */
@Testcontainers(disabledWithoutDocker = true)
class V9ToV10MigrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18.4-alpine");

    private static DataSource dataSource() {
        var ds = new PGSimpleDataSource();
        ds.setUrl(POSTGRES.getJdbcUrl());
        ds.setUser(POSTGRES.getUsername());
        ds.setPassword(POSTGRES.getPassword());
        return ds;
    }

    private static Flyway flyway(DataSource ds, String target) {
        var config = Flyway.configure().dataSource(ds).locations("classpath:db/migration");
        if (target != null) {
            config = config.target(org.flywaydb.core.api.MigrationVersion.fromVersion(target));
        }
        return config.load();
    }

    @Test
    @DisplayName("an admin carrying an Entra subject at V9 loses it, and moves to the code path")
    void migratingAPopulatedDatabaseRewritesAdminIdentities() {
        var ds = dataSource();
        var jdbc = new JdbcTemplate(ds);

        // Stop at V9: the shape production was in before the auth work started.
        flyway(ds, "9").migrate();

        var clubId = java.util.UUID.randomUUID();
        jdbc.update("INSERT INTO clubs (id, name, status) VALUES (?, 'CLB Tin hoc', 'ACTIVE')", clubId);
        var adminId = java.util.UUID.randomUUID();
        var studentId = java.util.UUID.randomUUID();
        // At V9 there is no auth_method column and ext_subject is NOT NULL, so an organiser
        // legitimately carried a subject — that is precisely the row V10 has to rewrite.
        jdbc.update("""
                INSERT INTO users (id, ext_subject, email, display_name, role, club_id, status,
                                   mssv_status, version)
                VALUES (?, 'entra:admin-subject', 'admin@tvu.edu.vn', 'Admin', 'ORGANIZER', ?,
                        'ACTIVE', 'UNVERIFIED', 0)
                """, adminId, clubId);
        jdbc.update("""
                INSERT INTO users (id, ext_subject, email, display_name, role, club_id, status,
                                   mssv_status, version)
                VALUES (?, 'entra:student-subject', 'student@tvu.edu.vn', 'Student', 'SINH_VIEN', NULL,
                        'ACTIVE', 'UNVERIFIED', 0)
                """, studentId);

        // Everything from V10 to the latest version, against that data.
        flyway(ds, null).migrate();

        var admin = jdbc.queryForMap("SELECT ext_subject, auth_method FROM users WHERE id = ?", adminId);
        assertThat(admin.get("ext_subject"))
                .as("an admin keeping its Entra subject is reachable from the Microsoft login")
                .isNull();
        assertThat(admin.get("auth_method")).isEqualTo("EMAIL_OTP");

        var student = jdbc.queryForMap("SELECT ext_subject, auth_method FROM users WHERE id = ?", studentId);
        assertThat(student.get("ext_subject")).isEqualTo("entra:student-subject");
        assertThat(student.get("auth_method")).isEqualTo("MICROSOFT");
    }

    @Test
    @DisplayName("the partial unique index still allows many NULL subjects but no duplicate real one")
    void partialUniqueIndexBehavesOnMigratedData() {
        var ds = dataSource();
        var jdbc = new JdbcTemplate(ds);
        flyway(ds, null).migrate();

        // Several admins, all with a NULL subject: the partial index must not treat NULLs as equal.
        for (int i = 0; i < 3; i++) {
            jdbc.update("""
                    INSERT INTO users (id, ext_subject, auth_method, email, display_name, role,
                                       club_id, status, mssv_status, version, auth_version)
                    VALUES (?, NULL, 'EMAIL_OTP', ?, 'Admin', 'SUPER_ADMIN', NULL, 'ACTIVE',
                            'UNVERIFIED', 0, 0)
                    """, java.util.UUID.randomUUID(), "admin" + i + "@tvu.edu.vn");
        }

        var admins = jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE ext_subject IS NULL AND role = 'SUPER_ADMIN'", Integer.class);
        assertThat(admins).isGreaterThanOrEqualTo(3);
    }
}
