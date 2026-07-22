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
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class,
        vn.edu.tvu.auth.exception.GlobalExceptionHandler.class})
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
     * Asserting non-invocation, not just the status, so a refusal that happened after the service already
     * ran would be caught.
     *
     * <p>What this does NOT prove: which of the two authorisation layers refused. The class-level
     * {@code @PreAuthorize} and the {@code SecurityConfig} matcher produce the same status and the same
     * zero invocations, and deleting the matcher leaves this test green (verified by mutation). The
     * matcher is defence in depth against the annotation being dropped later; pinning it independently
     * would need a context without method security, which this slice cannot build because
     * {@code @EnableMethodSecurity} sits on {@code SecurityConfig} itself.
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

    /**
     * This controller sits in {@code vn.edu.tvu.monolith.stats}, which the feature advices for auth,
     * event, ticket and notification do not cover by package. Asserting {@code $.code} as well as the
     * status is the point: Spring's built-in resolver already answers 404 with no advice at all, but its
     * body has no {@code code} field, and {@code code} is the stable string the frontend switches on. A
     * status-only assertion would stay green while these routes silently returned a different error shape
     * from every other route in the API.
     */
    @Test
    void unknownClubIdReturnsNotFoundInTheSharedErrorShape() throws Exception {
        var clubId = UUID.randomUUID();
        when(service.detail(clubId))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Club not found"));

        mockMvc.perform(get("/api/admin/clubs/{id}/stats", clubId)
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.code").exists());
    }
}
