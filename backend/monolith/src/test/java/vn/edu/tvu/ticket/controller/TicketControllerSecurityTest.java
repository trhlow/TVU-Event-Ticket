package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.auth.security.CookieCsrfFilter;
import vn.edu.tvu.auth.security.SecurityConfig;
import vn.edu.tvu.testsupport.AuthSecurityTestConfiguration;
import vn.edu.tvu.ticket.service.DashboardService;
import vn.edu.tvu.ticket.service.TicketQrService;
import vn.edu.tvu.ticket.service.TicketReservationService;
import vn.edu.tvu.ticket.service.TicketingService;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({ReservationController.class, TicketingController.class})
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class})
class TicketControllerSecurityTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean TicketReservationService reservationService;
    @MockitoBean TicketingService ticketingService;
    @MockitoBean DashboardService dashboardService;
    @MockitoBean TicketQrService ticketQrService;
    @MockitoBean JwtDecoder jwtDecoder;

    /**
     * The QR fallback is the only student-facing route under {@code /api/tickets}, and SecurityConfig
     * claims that whole prefix for ORGANIZER. Without a rule stated ahead of it, every student asking
     * for their own check-in code gets 403 — on the page they open precisely because their email never
     * arrived. The ordering is invisible in the service test, which never goes through the filter chain.
     */
    @Test
    void aStudentCanReachTheirOwnQrCodeDespiteTheOrganizerOnlyTicketsPrefix() throws Exception {
        var ticketId = UUID.randomUUID();
        when(ticketQrService.issueFor(any(), any()))
                .thenReturn(new vn.edu.tvu.ticket.dto.response.TicketQrResponse(
                        "payload", java.time.Instant.parse("2026-09-01T10:00:00Z")));

        mockMvc.perform(get("/api/tickets/{id}/qr", ticketId)
                        .with(jwt().jwt(builder -> builder.subject(UUID.randomUUID().toString()))
                                .authorities(() -> "ROLE_SINH_VIEN")))
                .andExpect(status().isOk());
    }

    /**
     * And an organizer must not. Ownership is enforced in the service, but stating it at the filter
     * chain too means an organizer token never reaches the code that mints a student's credential.
     */
    @Test
    void anOrganizerCannotAskForAStudentsQrCode() throws Exception {
        mockMvc.perform(get("/api/tickets/{id}/qr", UUID.randomUUID())
                        .with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());

        verify(ticketQrService, org.mockito.Mockito.never()).issueFor(any(), any());
    }

    @Test
    void anAnonymousCallerCannotAskForAQrCode() throws Exception {
        mockMvc.perform(get("/api/tickets/{id}/qr", UUID.randomUUID()))
                .andExpect(status().isUnauthorized());

        verify(ticketQrService, org.mockito.Mockito.never()).issueFor(any(), any());
    }

    /**
     * The public event listing fetches remaining-ticket counts for many events in one call. The single-event
     * matcher uses {@code /events/*&#47;availability}, and {@code *} spans exactly one path segment, so it does
     * not cover the zero-segment batch route. Anonymous access has to be asserted separately or the batch
     * route silently falls through to the ORGANIZER rule.
     */
    /**
     * A super-admin manages club accounts and reads cross-club statistics; it never operates inside a
     * club's scope. The service layer already refuses ({@code requireOrganizer}), so both the old and new
     * configuration answer 403 — what changes is where. Asserting the service is never reached is the only
     * way to pin that down, and it matters: letting the request through to the service means every future
     * club-scoped endpoint has to remember to re-check, instead of the rule being stated once.
     */
    @Test
    void superAdminIsRejectedBeforeReachingClubScopedTicketing() throws Exception {
        mockMvc.perform(post("/api/ticketing/check-in")
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrPayload\":\"signed-payload\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/ticketing/events/{id}/dashboard", UUID.randomUUID())
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isForbidden());

        verify(ticketingService, org.mockito.Mockito.never()).checkIn(any(), anyString());
        verify(dashboardService, org.mockito.Mockito.never()).eventDashboard(any(), any());
    }

    @Test
    void superAdminStillReadsCrossClubStatistics() throws Exception {
        when(dashboardService.ticketStats())
                .thenReturn(new vn.edu.tvu.ticket.dto.response.TicketStatsResponse(0L, 0L, null));

        mockMvc.perform(get("/api/ticketing/stats").with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void batchAvailabilityIsPublic() throws Exception {
        var ids = List.of(UUID.randomUUID(), UUID.randomUUID());
        when(ticketingService.availability(anyList())).thenReturn(java.util.Map.of());

        mockMvc.perform(get("/api/ticketing/events/availability")
                        .param("ids", ids.get(0).toString(), ids.get(1).toString()))
                .andExpect(status().isOk());
    }

    @Test
    void availabilityIsPublicButCheckInRequiresOrganizer() throws Exception {
        var eventId = UUID.randomUUID();
        mockMvc.perform(get("/api/ticketing/events/{eventId}/availability", eventId))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/ticketing/check-in")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrPayload\":\"signed-value\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/ticketing/check-in")
                        .with(studentJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrPayload\":\"signed-value\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void studentCanSubmitButCannotReadOrganizerAttendees() throws Exception {
        var eventId = UUID.randomUUID();
        mockMvc.perform(post("/api/reservations")
                        .with(studentJwt())
                        .header("Idempotency-Key", "idem-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventId\":\"" + eventId + "\"}"))
                .andExpect(status().isCreated());
        verify(reservationService).submit(any(), any(), anyString());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .with(studentJwt()))
                .andExpect(status().isForbidden());
    }

    @Test
    void organizerCanCheckInAndReadAttendeesWithClubClaim() throws Exception {
        var eventId = UUID.randomUUID();
        when(ticketingService.attendees(any(), any(), any(), any(), any()))
                .thenReturn(new vn.edu.tvu.shared.web.PageResponse<>(List.of(), 0, 20, 0, 0));

        mockMvc.perform(post("/api/ticketing/check-in")
                        .with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrPayload\":\"signed-value\"}"))
                .andExpect(status().isOk());
        verify(ticketingService).checkIn(any(), anyString());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .with(organizerJwt()))
                .andExpect(status().isOk());
    }

    @Test
    void attendeesRejectsOversizedPageAndUnknownSortField() throws Exception {
        var eventId = UUID.randomUUID();
        when(ticketingService.attendees(any(), any(), any(), any(), any()))
                .thenReturn(new vn.edu.tvu.shared.web.PageResponse<>(List.of(), 0, 20, 0, 0));

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("size", "101")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("sort", "studentPassword")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("size", "100")
                        .param("sort", "studentEmail,asc")
                        .with(organizerJwt()))
                .andExpect(status().isOk());
    }

    @Test
    void attendeesRejectsInvalidStatusValue() throws Exception {
        var eventId = UUID.randomUUID();

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("status", "BOGUS")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees.csv", eventId)
                        .param("status", "BOGUS")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void approvePostCompatibilityRouteRequiresOrganizer() throws Exception {
        var reservationId = UUID.randomUUID();
        mockMvc.perform(post("/api/reservations/{reservationId}/approve", reservationId)
                        .with(studentJwt()))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/reservations/{reservationId}/approve", reservationId)
                        .with(organizerJwt()))
                .andExpect(status().isOk());
        verify(reservationService).approve(any(), any());
    }

    @Test
    void clubDashboardRequiresOrganizerAndStatsRequiresSuperAdmin() throws Exception {
        when(dashboardService.clubDashboard(any())).thenReturn(
                new vn.edu.tvu.ticket.dto.response.ClubDashboardResponse(
                        java.util.UUID.randomUUID(), 0, 0, 0, null, List.of()));

        mockMvc.perform(get("/api/ticketing/dashboard/club").with(studentJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/dashboard/club").with(organizerJwt()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/ticketing/stats").with(organizerJwt()))
                .andExpect(status().isForbidden());
    }

    @Test
    void eventDashboardRequiresOrganizer() throws Exception {
        var eventId = UUID.randomUUID();
        when(dashboardService.eventDashboard(any(), any())).thenReturn(
                new vn.edu.tvu.ticket.dto.response.EventDashboardResponse(
                        eventId, UUID.randomUUID(), 50, 30, 20, 5L, 0.25));

        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId).with(studentJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId).with(organizerJwt()))
                .andExpect(status().isOk());
    }

    @Test
    void ticketStatsRequiresSuperAdminRole() throws Exception {
        when(dashboardService.ticketStats()).thenReturn(
                new vn.edu.tvu.ticket.dto.response.TicketStatsResponse(0, 0, null));

        mockMvc.perform(get("/api/ticketing/stats").with(organizerJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/stats").with(superAdminJwt()))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor studentJwt() {
        return jwt().jwt(builder -> builder.subject(UUID.randomUUID().toString())
                .claim("email", "student@example.com")
                .claim("roles", List.of("SINH_VIEN"))
                .claim("mssv", "110122001"))
                .authorities(() -> "ROLE_SINH_VIEN");
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor organizerJwt() {
        return jwt().jwt(builder -> builder.subject(UUID.randomUUID().toString())
                .claim("email", "organizer@example.com")
                .claim("roles", List.of("ORGANIZER"))
                .claim("club_id", UUID.randomUUID().toString()))
                .authorities(() -> "ROLE_ORGANIZER");
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor superAdminJwt() {
        return jwt().jwt(builder -> builder.subject(UUID.randomUUID().toString())
                .claim("email", "admin@example.com")
                .claim("roles", List.of("SUPER_ADMIN")))
                .authorities(() -> "ROLE_SUPER_ADMIN");
    }
}
