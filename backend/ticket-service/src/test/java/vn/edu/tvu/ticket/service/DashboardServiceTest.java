package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock ReservationRepository reservationRepository;
    @Mock TicketRepository ticketRepository;

    private DashboardService dashboardService() {
        return new DashboardService(reservationRepository, ticketRepository);
    }

    @Test
    void clubDashboardComputesCheckInRateAndZeroFillsThirtyDayWindow() {
        var clubId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING)).thenReturn(3L);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED)).thenReturn(10L);
        when(ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN)).thenReturn(4L);
        var today = LocalDate.now(java.time.ZoneOffset.UTC);
        var row = mockRow(today, 2L);
        when(reservationRepository.countDailyRegistrationsByClub(eq(clubId), any(Instant.class)))
                .thenReturn(List.of(row));

        var response = dashboardService().clubDashboard(actor);

        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.pending()).isEqualTo(3);
        assertThat(response.approved()).isEqualTo(10);
        assertThat(response.checkedIn()).isEqualTo(4);
        assertThat(response.checkInRate()).isEqualTo(0.4);
        assertThat(response.registrationsByDay()).hasSize(30);
        assertThat(response.registrationsByDay().getLast().date()).isEqualTo(today);
        assertThat(response.registrationsByDay().getLast().count()).isEqualTo(2);
        assertThat(response.registrationsByDay().getFirst().date()).isEqualTo(today.minusDays(29));
        assertThat(response.registrationsByDay().getFirst().count()).isZero();
    }

    @Test
    void clubDashboardReturnsNullCheckInRateWhenNoApprovals() {
        var clubId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING)).thenReturn(0L);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED)).thenReturn(0L);
        when(ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN)).thenReturn(0L);
        when(reservationRepository.countDailyRegistrationsByClub(eq(clubId), any(Instant.class)))
                .thenReturn(List.of());

        var response = dashboardService().clubDashboard(actor);

        assertThat(response.checkInRate()).isNull();
    }

    @Test
    void clubDashboardRejectsNonOrganizer() {
        var actor = new CurrentUser(UUID.randomUUID(), "student@example.com", UserRole.SINH_VIEN, null, "110122001");

        assertThatThrownBy(() -> dashboardService().clubDashboard(actor))
                .isInstanceOf(ResponseStatusException.class);
    }

    private ReservationRepository.DailyRegistrationCountProjection mockRow(LocalDate day, long count) {
        return new ReservationRepository.DailyRegistrationCountProjection() {
            @Override public LocalDate getDay() { return day; }
            @Override public long getCount() { return count; }
        };
    }
}
