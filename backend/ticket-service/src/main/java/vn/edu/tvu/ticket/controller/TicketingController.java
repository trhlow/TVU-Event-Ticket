package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.ticket.dto.request.CheckInRequest;
import vn.edu.tvu.ticket.dto.response.AttendeeResponse;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.ticket.dto.response.ClubDashboardResponse;
import vn.edu.tvu.ticket.dto.response.TicketResponse;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.service.DashboardService;
import vn.edu.tvu.ticket.service.TicketingService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Ticketing", description = "Availability, check-in, dashboards and event attendee operations")
public class TicketingController {

    private final TicketingService service;
    private final DashboardService dashboardService;

    public TicketingController(TicketingService service, DashboardService dashboardService) {
        this.service = service;
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/ticketing/events/{eventId}/availability")
    @Operation(summary = "Get remaining capacity for an event")
    public AvailabilityResponse availability(@PathVariable UUID eventId) {
        return service.availability(eventId);
    }

    @GetMapping("/api/ticketing/events/availability")
    @Operation(summary = "Get remaining capacity for multiple events")
    public Map<UUID, AvailabilityResponse> availabilityBatch(@RequestParam List<UUID> ids) {
        return service.availability(ids);
    }

    @PostMapping({"/api/ticketing/check-in", "/api/tickets/check-in"})
    @Operation(summary = "Verify a signed QR payload and check a ticket in once")
    public TicketResponse checkIn(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CheckInRequest request) {
        return service.checkIn(CurrentUser.from(jwt), request.qrPayload());
    }

    @GetMapping("/api/ticketing/events/{eventId}/attendees")
    @Operation(summary = "List attendees for the organizer's event")
    public List<AttendeeResponse> attendees(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        return service.attendees(CurrentUser.from(jwt), eventId);
    }

    @GetMapping(value = "/api/ticketing/events/{eventId}/attendees.csv", produces = "text/csv")
    @Operation(summary = "Export attendees as UTF-8 CSV")
    public ResponseEntity<byte[]> attendeesCsv(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        var body = service.attendeesCsv(CurrentUser.from(jwt), eventId).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=attendees-" + eventId + ".csv")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }

    @GetMapping("/api/ticketing/dashboard/club")
    @Operation(summary = "Get the organizer's club-wide reservation and check-in KPIs")
    public ClubDashboardResponse dashboardClub(@AuthenticationPrincipal Jwt jwt) {
        return dashboardService.clubDashboard(CurrentUser.from(jwt));
    }
}
