package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.security.CookieCsrfFilter;
import vn.edu.tvu.auth.security.SecurityConfig;
import vn.edu.tvu.testsupport.AuthSecurityTestConfiguration;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ClubStatsController.class)
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class})
class ClubStatsControllerSecurityTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean ClubStatsService service;
    @MockitoBean JwtDecoder jwtDecoder;

    @Test
    void superAdminCanReadTheClubStatsListing() throws Exception {
        when(service.summaries(any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/clubs/stats").with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isOk());
    }

    /**
     * Asserting non-invocation, not just the status: an organizer would also be refused deeper in the
     * stack, so a status-only assertion would pass whether or not the web layer actually holds.
     */
    @Test
    void organizerIsRejectedBeforeReachingTheService() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats").with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/clubs/{id}/stats", UUID.randomUUID())
                        .with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());

        verify(service, never()).summaries(any());
        verify(service, never()).detail(any());
    }

    @Test
    void anonymousIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats")).andExpect(status().isUnauthorized());
    }

    @Test
    void sortOutsideTheWhitelistIsRejected() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats")
                        .param("sort", "ticketsIssued,desc")
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownClubIdReturnsNotFoundNotServerError() throws Exception {
        var clubId = UUID.randomUUID();
        when(service.detail(clubId))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Club not found"));

        mockMvc.perform(get("/api/admin/clubs/{id}/stats", clubId)
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isNotFound());
    }
}
