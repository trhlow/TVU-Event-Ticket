package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

class ClubStatsServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-22T10:00:00Z");

    private final ClubRepository clubRepository = Mockito.mock(ClubRepository.class);
    private final EventRepository eventRepository = Mockito.mock(EventRepository.class);
    private final TicketRepository ticketRepository = Mockito.mock(TicketRepository.class);
    private final UserRepository userRepository = Mockito.mock(UserRepository.class);

    private ClubStatsService service;

    @BeforeEach
    void setUp() {
        service = new ClubStatsService(clubRepository, eventRepository, ticketRepository, userRepository,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    /**
     * The three aggregate queries omit clubs that have no rows. If the composer only walked those
     * results, an inactive club would vanish from the listing — and inactive clubs are precisely what a
     * super-admin is looking for.
     */
    @Test
    void clubWithNoActivityAppearsWithZerosRatherThanVanishing() {
        var club = club("Quiet Club");
        when(clubRepository.findAll(any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(club), PageRequest.of(0, 20), 1));
        when(eventRepository.countByClubAndStatus(anyCollection())).thenReturn(List.of());
        when(ticketRepository.totalsByClub(anyCollection())).thenReturn(List.of());
        when(userRepository.countOrganizersByClub(anyCollection())).thenReturn(List.of());

        var page = service.summaries(PageRequest.of(0, 20));

        assertThat(page.getContent()).hasSize(1);
        var summary = page.getContent().get(0);
        assertThat(summary.clubName()).isEqualTo("Quiet Club");
        assertThat(summary.totalEvents()).isZero();
        assertThat(summary.ticketsIssued()).isZero();
        assertThat(summary.organizers()).isZero();
        assertThat(summary.checkInRate())
                .as("no tickets means no rate; 0.0 would read as 'nobody showed up'")
                .isNull();
    }

    /**
     * `group by date` returns only dates that have rows. Passing that straight through leaves holes, and
     * a line chart joins the points on either side of a hole into a straight line — a quiet week is
     * rendered as steady activity with nothing to signal the gap.
     */
    @Test
    void dailySeriesAlwaysHasThirtyPointsIncludingSilentDays() {
        var club = club("Busy Club");
        when(clubRepository.findById(club.getId())).thenReturn(java.util.Optional.of(club));
        when(eventRepository.countByClubAndStatus(anyCollection())).thenReturn(List.of());
        when(ticketRepository.totalsByClub(anyCollection())).thenReturn(List.of());
        when(userRepository.countOrganizersByClub(anyCollection())).thenReturn(List.of());
        when(ticketRepository.issuedPerDay(any(), any()))
                .thenReturn(List.of(dailyCount(LocalDate.of(2026, 7, 20), 5L)));
        when(ticketRepository.checkedInPerDay(any(), any())).thenReturn(List.of());

        var detail = service.detail(club.getId());

        assertThat(detail.last30Days()).hasSize(30);
        assertThat(detail.last30Days().get(0).date()).isEqualTo(LocalDate.of(2026, 6, 23));
        assertThat(detail.last30Days().get(29).date()).isEqualTo(LocalDate.of(2026, 7, 22));
        assertThat(detail.last30Days())
                .filteredOn(point -> point.date().equals(LocalDate.of(2026, 7, 20)))
                .singleElement()
                .satisfies(point -> assertThat(point.ticketsIssued()).isEqualTo(5L));
        assertThat(detail.last30Days())
                .filteredOn(point -> point.date().equals(LocalDate.of(2026, 7, 21)))
                .singleElement()
                .satisfies(point -> assertThat(point.ticketsIssued()).isZero());
    }

    private Club club(String name) {
        var club = Mockito.mock(Club.class);
        when(club.getId()).thenReturn(UUID.randomUUID());
        when(club.getName()).thenReturn(name);
        return club;
    }

    private vn.edu.tvu.ticket.repository.DailyCount dailyCount(LocalDate day, long total) {
        return new vn.edu.tvu.ticket.repository.DailyCount() {
            @Override public LocalDate getDay() { return day; }
            @Override public long getTotal() { return total; }
        };
    }
}
