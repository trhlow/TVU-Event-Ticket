package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
        userRepository.saveAndFlush(User.emailOtpOrganizer("o1@tvu.edu.vn", "O1", clubA));
        userRepository.saveAndFlush(User.emailOtpOrganizer("o2@tvu.edu.vn", "O2", clubA));
        userRepository.saveAndFlush(User.emailOtpOrganizer("o3@tvu.edu.vn", "O3", clubB));

        var counts = userRepository.countOrganizersByClub(List.of(clubA.getId(), clubB.getId()));

        assertThat(counts)
                .extracting(ClubMemberCount::getClubId, ClubMemberCount::getTotal)
                .containsExactlyInAnyOrder(tuple(clubA.getId(), 2L), tuple(clubB.getId(), 1L));
    }

    /**
     * The counting test above used to seed a SUPER_ADMIN inside a club, because the column allowed it
     * and a legacy or hand-edited row could look like that. V13 (chk_users_club_by_role) forbids the
     * shape outright now, so the guarantee moved from "the query filters it out" to "the row cannot
     * exist" — asserted here, in its own transaction, because a constraint violation aborts the
     * surrounding one and every later statement in it.
     */
    @Test
    void aNonOrganizerCannotBePlacedInAClubAtAll() {
        var club = clubRepository.saveAndFlush(new Club("Club C", "third"));

        assertThatThrownBy(() -> insertNonOrganizerInClub(club.getId(), "SUPER_ADMIN", "admin@tvu.edu.vn"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insertNonOrganizerInClub(java.util.UUID clubId, String role, String email) {
        jdbcTemplate.update("""
                INSERT INTO users (id, ext_subject, email, display_name, role, club_id, auth_method)
                VALUES (?, NULL, ?, 'Not an organizer', ?, ?, 'EMAIL_OTP')
                """, java.util.UUID.randomUUID(), email, role, clubId);
    }
}
