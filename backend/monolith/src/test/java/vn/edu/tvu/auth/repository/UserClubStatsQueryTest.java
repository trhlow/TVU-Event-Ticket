package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    /** Only organizers count as club staff; students carry no club and must never inflate the figure. */
    @Test
    void countsOnlyOrganizersPerClub() {
        var clubA = clubRepository.saveAndFlush(new Club("Club A", "first"));
        var clubB = clubRepository.saveAndFlush(new Club("Club B", "second"));
        userRepository.saveAndFlush(User.organizer("ext-1", "o1@tvu.edu.vn", "O1", clubA));
        userRepository.saveAndFlush(User.organizer("ext-2", "o2@tvu.edu.vn", "O2", clubA));
        userRepository.saveAndFlush(User.organizer("ext-3", "o3@tvu.edu.vn", "O3", clubB));
        // Inserted with SQL on purpose: the entity API cannot produce this row (promoteToSuperAdmin
        // nulls the club), but the column allows it, so a legacy or hand-edited row can look like this.
        // Without it, every user in the fixture is an ORGANIZER and the role filter is never exercised —
        // deleting `u.role = ORGANIZER` from the query would leave this test green.
        insertNonOrganizerInClub(clubA.getId(), "SUPER_ADMIN", "admin@tvu.edu.vn");

        var counts = userRepository.countOrganizersByClub(List.of(clubA.getId(), clubB.getId()));

        assertThat(counts)
                .extracting(ClubMemberCount::getClubId, ClubMemberCount::getTotal)
                .containsExactlyInAnyOrder(tuple(clubA.getId(), 2L), tuple(clubB.getId(), 1L));
    }

    private void insertNonOrganizerInClub(java.util.UUID clubId, String role, String email) {
        jdbcTemplate.update("""
                INSERT INTO users (id, ext_subject, email, display_name, role, club_id, auth_method)
                VALUES (?, NULL, ?, 'Not an organizer', ?, ?, 'EMAIL_OTP')
                """, java.util.UUID.randomUUID(), email, role, clubId);
    }
}
