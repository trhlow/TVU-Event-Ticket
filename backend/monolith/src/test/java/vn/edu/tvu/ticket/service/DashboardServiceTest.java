package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.shared.domain.UserRole;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
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
    @Mock TicketInventoryRepository inventoryRepository;
    @Mock TicketingService ticketingService;

    private DashboardService dashboardService() {
        return new DashboardService(reservationRepository, ticketRepository, inventoryRepository,
                ticketingService);
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

    @Test
    void eventDashboardCombinesInventoryCapacityWithLiveRemainingAndCheckIns() {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory(eventId, clubId, 50, 20)));
        when(ticketingService.availability(eventId))
                .thenReturn(new AvailabilityResponse(eventId, 50, 20, 30));
        when(ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN)).thenReturn(5L);

        var response = dashboardService().eventDashboard(actor, eventId);

        assertThat(response.eventId()).isEqualTo(eventId);
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.totalCapacity()).isEqualTo(50);
        assertThat(response.remaining()).isEqualTo(30);
        assertThat(response.approved()).isEqualTo(20);
        assertThat(response.checkedIn()).isEqualTo(5);
        assertThat(response.checkInRate()).isEqualTo(0.25);
    }

    @Test
    void eventDashboardReturnsNullCheckInRateWhenNothingApproved() {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory(eventId, clubId, 50, 0)));
        when(ticketingService.availability(eventId))
                .thenReturn(new AvailabilityResponse(eventId, 50, 0, 50));
        when(ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN)).thenReturn(0L);

        assertThat(dashboardService().eventDashboard(actor, eventId).checkInRate()).isNull();
    }

    @Test
    void eventDashboardRejectsEventOutsideOrganizerClub() {
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER,
                UUID.randomUUID(), null);
        when(inventoryRepository.findByEventId(eventId))
                .thenReturn(Optional.of(inventory(eventId, UUID.randomUUID(), 50, 1)));

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, eventId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void eventDashboardRejectsNonOrganizer() {
        var actor = new CurrentUser(UUID.randomUUID(), "student@example.com", UserRole.SINH_VIEN, null, "110122001");

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void eventDashboardReturns404WhenInventoryMissing() {
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER,
                UUID.randomUUID(), null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, eventId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    private static TicketInventory inventory(UUID eventId, UUID clubId, int capacity, int approvedCount) {
        var inventory = TicketInventory.create(eventId, clubId, capacity, "Demo event",
                Instant.parse("2026-07-02T09:00:00Z"), Instant.parse("2026-07-02T11:00:00Z"), "TVU Hall");
        for (var i = 0; i < approvedCount; i++) {
            inventory.reserveApprovedSlot();
        }
        return inventory;
    }

    private ReservationRepository.DailyRegistrationCountProjection mockRow(LocalDate day, long count) {
        return new ReservationRepository.DailyRegistrationCountProjection() {
            @Override public LocalDate getDay() { return day; }
            @Override public long getCount() { return count; }
        };
    }
}
