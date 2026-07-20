package vn.edu.tvu.event.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.edu.tvu.auth.security.CookieCsrfFilter;
import vn.edu.tvu.auth.security.SecurityConfig;
import vn.edu.tvu.event.service.EventService;
import vn.edu.tvu.testsupport.AuthSecurityTestConfiguration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EventController.class)
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class})
class EventControllerSecurityTest {
    @Autowired MockMvc mockMvc;
    @MockitoBean EventService eventService;
    @MockitoBean JwtDecoder jwtDecoder;

    @Test
    void publicListingDoesNotRequireAuthentication() throws Exception {
        when(eventService.listPublic()).thenReturn(List.of());
        mockMvc.perform(get("/api/events")).andExpect(status().isOk());
    }

    @Test
    void organizerListingRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/events/mine")).andExpect(status().isUnauthorized());
    }

    @Test
    void studentCannotCreateEvent() throws Exception {
        mockMvc.perform(post("/api/events")
                        .with(jwt().authorities(() -> "ROLE_SINH_VIEN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isForbidden());
    }

    @Test
    void organizerCanCreateEventAndClubClaimReachesService() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID clubId = UUID.randomUUID();
        mockMvc.perform(post("/api/events")
                        .with(jwt().jwt(builder -> builder.subject(userId.toString())
                                .claim("club_id", clubId.toString()))
                                .authorities(() -> "ROLE_ORGANIZER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isCreated());
        verify(eventService).create(any(), any());
    }

    @Test
    void eventsStatsRequiresSuperAdminNotPublicOrOrganizer() throws Exception {
        mockMvc.perform(get("/api/events/stats")).andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/events/stats").with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());

        when(eventService.stats()).thenReturn(
                new vn.edu.tvu.event.dto.response.EventStatsResponse(0, java.util.Map.of()));
        mockMvc.perform(get("/api/events/stats").with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isOk());
    }

    private String validRequest() {
        return """
                {"title":"Open Day","description":"Demo","capacity":100,
                 "registrationOpenAt":"2026-08-01T00:00:00Z",
                 "registrationCloseAt":"2026-08-02T00:00:00Z",
                 "startAt":"2026-08-03T00:00:00Z","endAt":"2026-08-03T04:00:00Z",
                 "location":"TVU"}
                """;
    }
}
