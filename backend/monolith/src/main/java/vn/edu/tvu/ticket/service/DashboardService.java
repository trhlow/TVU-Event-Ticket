package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.ClubDashboardResponse;
import vn.edu.tvu.ticket.dto.response.EventDashboardResponse;
import vn.edu.tvu.ticket.dto.response.TicketStatsResponse;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class DashboardService {

    private static final int WINDOW_DAYS = 30;

    private final ReservationRepository reservationRepository;
    private final TicketRepository ticketRepository;
    private final TicketInventoryRepository inventoryRepository;
    private final TicketingService ticketingService;

    public DashboardService(ReservationRepository reservationRepository, TicketRepository ticketRepository,
            TicketInventoryRepository inventoryRepository, TicketingService ticketingService) {
        this.reservationRepository = reservationRepository;
        this.ticketRepository = ticketRepository;
        this.inventoryRepository = inventoryRepository;
        this.ticketingService = ticketingService;
    }

    public ClubDashboardResponse clubDashboard(CurrentUser actor) {
        requireOrganizer(actor);
        var clubId = actor.clubId();
        var pending = reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING);
        var approved = reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED);
        var checkedIn = ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN);
        Double checkInRate = approved == 0 ? null : (double) checkedIn / approved;
        return new ClubDashboardResponse(clubId, pending, approved, checkedIn, checkInRate,
                registrationsByDay(clubId));
    }

    public TicketStatsResponse ticketStats() {
        var issued = ticketRepository.count();
        var checkedIn = ticketRepository.countByStatus(TicketStatus.CHECKED_IN);
        Double checkInRate = issued == 0 ? null : (double) checkedIn / issued;
        return new TicketStatsResponse(issued, checkedIn, checkInRate);
    }

    public EventDashboardResponse eventDashboard(CurrentUser actor, UUID eventId) {
        requireOrganizer(actor);
        var inventory = inventoryRepository.findByEventId(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event ticketing not found"));
        if (!inventory.getClubId().equals(actor.clubId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Event is outside organizer club scope");
        }
        var availability = ticketingService.availability(eventId);
        var approved = inventory.getApprovedCount();
        var checkedIn = ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN);
        Double checkInRate = approved == 0 ? null : (double) checkedIn / approved;
        return new EventDashboardResponse(eventId, inventory.getClubId(), availability.totalCapacity(),
                availability.remaining(), approved, checkedIn, checkInRate);
    }

    private void requireOrganizer(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER || actor.clubId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer club scope is required");
        }
    }

    private List<ClubDashboardResponse.DailyRegistrationCount> registrationsByDay(UUID clubId) {
        var today = LocalDate.now(ZoneOffset.UTC);
        var windowStart = today.minusDays(WINDOW_DAYS - 1L);
        var since = windowStart.atStartOfDay(ZoneOffset.UTC).toInstant();
        Map<LocalDate, Long> countsByDay = new HashMap<>();
        reservationRepository.countDailyRegistrationsByClub(clubId, since)
                .forEach(row -> countsByDay.put(row.getDay(), row.getCount()));
        var series = new ArrayList<ClubDashboardResponse.DailyRegistrationCount>(WINDOW_DAYS);
        for (var day = windowStart; !day.isAfter(today); day = day.plusDays(1)) {
            series.add(new ClubDashboardResponse.DailyRegistrationCount(day, countsByDay.getOrDefault(day, 0L)));
        }
        return series;
    }
}
