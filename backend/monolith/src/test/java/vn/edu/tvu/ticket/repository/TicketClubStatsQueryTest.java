package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.support.AbstractPostgresIntegrationTest;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TicketClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired TicketRepository repository;
    @Autowired ReservationRepository reservationRepository;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    @Test
    void totalsByClubCountIssuedAndCheckedInSeparatelyPerClub() {
        var clubA = UUID.randomUUID();
        var clubB = UUID.randomUUID();
        save(clubA, TicketStatus.VALID, Instant.now(), null);
        save(clubA, TicketStatus.CHECKED_IN, Instant.now(), Instant.now());
        save(clubA, TicketStatus.CHECKED_IN, Instant.now(), Instant.now());
        save(clubB, TicketStatus.VALID, Instant.now(), null);

        var totals = repository.totalsByClub(List.of(clubA, clubB));

        assertThat(totals)
                .extracting(ClubTicketTotals::getClubId, ClubTicketTotals::getIssued,
                        ClubTicketTotals::getCheckedIn)
                .containsExactlyInAnyOrder(tuple(clubA, 3L, 2L), tuple(clubB, 1L, 0L));
    }

    /**
     * A club with no tickets must simply be absent from this result — the service supplies the zeros.
     * If the query were ever changed to an inner join against clubs it would hide inactive clubs, which
     * are exactly the ones a super-admin is looking for.
     */
    @Test
    void totalsByClubOmitsClubsWithNoTickets() {
        var empty = UUID.randomUUID();

        assertThat(repository.totalsByClub(List.of(empty))).isEmpty();
    }

    @Test
    void perDaySeriesUseIssuedAtAndCheckedInAtIndependently() {
        var club = UUID.randomUUID();
        var today = Instant.now().truncatedTo(ChronoUnit.DAYS).plusSeconds(43200);
        var threeDaysAgo = today.minus(3, ChronoUnit.DAYS);
        // Issued three days ago, checked in today: the two series must place it on different days.
        save(club, TicketStatus.CHECKED_IN, threeDaysAgo, today);
        save(club, TicketStatus.VALID, today, null);

        var from = today.minus(30, ChronoUnit.DAYS);
        var issued = repository.issuedPerDay(club, from);
        var checkedIn = repository.checkedInPerDay(club, from);

        assertThat(issued)
                .extracting(DailyCount::getDay, DailyCount::getTotal)
                .containsExactlyInAnyOrder(
                        tuple(threeDaysAgo.atZone(ZoneOffset.UTC).toLocalDate(), 1L),
                        tuple(today.atZone(ZoneOffset.UTC).toLocalDate(), 1L));
        assertThat(checkedIn)
                .extracting(DailyCount::getDay, DailyCount::getTotal)
                .containsExactly(tuple(today.atZone(ZoneOffset.UTC).toLocalDate(), 1L));
    }

    /**
     * A ticket has a foreign key to reservations, so the reservation must exist and be approved first.
     * Ticket exposes no check-in mutator and no way to set issuedAt — check-in goes through the
     * repository's conditional UPDATE in production — so the row's timestamps and status are set with
     * SQL here rather than by adding a test-only method to the entity or repository.
     */
    private void save(UUID clubId, TicketStatus status, Instant issuedAt, Instant checkedInAt) {
        var reservation = Reservation.pending(UUID.randomUUID(), clubId, UUID.randomUUID(),
                "student@example.com", "110122001", UUID.randomUUID().toString());
        reservation.approve(UUID.randomUUID());
        reservationRepository.saveAndFlush(reservation);
        var ticket = repository.saveAndFlush(Ticket.issue(reservation));
        jdbcTemplate.update("update tickets set status = ?, issued_at = ?, checked_in_at = ? where id = ?",
                status.name(),
                java.sql.Timestamp.from(issuedAt),
                checkedInAt == null ? null : java.sql.Timestamp.from(checkedInAt),
                ticket.getId());
    }
}
