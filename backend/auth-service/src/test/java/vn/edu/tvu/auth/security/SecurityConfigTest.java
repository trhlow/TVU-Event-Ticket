package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.controller.AdminController;
import vn.edu.tvu.auth.controller.AuthController;
import vn.edu.tvu.auth.controller.WellKnownController;
import vn.edu.tvu.auth.domain.UserRole;
import vn.edu.tvu.auth.service.AdminManagementService;
import vn.edu.tvu.auth.service.AuditLogService;
import vn.edu.tvu.auth.service.AuthApplicationService;
import vn.edu.tvu.auth.service.InternalJwtService;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({WellKnownController.class, AuthController.class, AdminController.class})
@Import({SecurityConfig.class, SecurityConfigTest.TestBeans.class})
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private InternalJwtService jwtService;

    @Autowired
    private RsaKeyManager keyManager;

    @MockitoBean
    private AuthApplicationService authApplicationService;

    @MockitoBean
    private AuthCookieService authCookieService;

    @MockitoBean
    private AdminManagementService adminManagementService;

    @MockitoBean
    private AuditLogService auditLogService;

    @Test
    void wellKnownEndpointsArePublic() throws Exception {
        mockMvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk());
    }

    @Test
    void meRequiresJwt() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meRejectsJwtWithWrongIssuer() throws Exception {
        var wrongIssuerJwt = new InternalJwtService(
                new JwtProperties("http://wrong-issuer", Duration.ofMinutes(15), "test-key", null, null),
                keyManager);
        var token = wrongIssuerJwt.mint(new JwtSubject(UUID.randomUUID(), "student@example.com",
                UserRole.SINH_VIEN, null, null)).value();

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminRouteRejectsStudentRole() throws Exception {
        var token = token(UserRole.SINH_VIEN);

        mockMvc.perform(get("/api/admin/clubs")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminRouteAllowsSuperAdminRole() throws Exception {
        when(adminManagementService.listClubs()).thenReturn(List.of());
        var token = token(UserRole.SUPER_ADMIN);

        mockMvc.perform(get("/api/admin/clubs")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void adminStatsRouteRequiresSuperAdmin() throws Exception {
        var studentToken = token(UserRole.SINH_VIEN);
        mockMvc.perform(get("/api/admin/stats")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        when(adminManagementService.stats()).thenReturn(
                new vn.edu.tvu.auth.dto.response.AdminStatsResponse(0, 0, java.util.Map.of()));
        var adminToken = token(UserRole.SUPER_ADMIN);
        mockMvc.perform(get("/api/admin/stats")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    @Test
    void auditLogRouteRejectsStudentRole() throws Exception {
        var token = token(UserRole.SINH_VIEN);

        mockMvc.perform(get("/api/admin/audit-log")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void auditLogRouteAllowsSuperAdminRole() throws Exception {
        when(auditLogService.search(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any()))
                .thenReturn(new vn.edu.tvu.auth.dto.response.PageResponse<>(List.of(), 0, 20, 0, 0));
        var token = token(UserRole.SUPER_ADMIN);

        mockMvc.perform(get("/api/admin/audit-log")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content").isArray())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.page").value(0))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.size").value(20))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.totalElements").value(0))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.totalPages").value(0));
    }

    @Test
    void auditLogRouteRejectsOversizedPageSize() throws Exception {
        var token = token(UserRole.SUPER_ADMIN);

        mockMvc.perform(get("/api/admin/audit-log")
                        .param("size", "101")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void auditLogRouteRejectsUnknownSortField() throws Exception {
        var token = token(UserRole.SUPER_ADMIN);

        mockMvc.perform(get("/api/admin/audit-log")
                        .param("sort", "notAField,asc")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void auditLogRouteBindsFromAndToDateTimeParams() throws Exception {
        when(auditLogService.search(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.eq(java.time.Instant.parse("2026-01-01T00:00:00Z")),
                org.mockito.ArgumentMatchers.eq(java.time.Instant.parse("2026-02-01T00:00:00Z")),
                org.mockito.ArgumentMatchers.any()))
                .thenReturn(new vn.edu.tvu.auth.dto.response.PageResponse<>(List.of(), 0, 20, 0, 0));
        var token = token(UserRole.SUPER_ADMIN);

        mockMvc.perform(get("/api/admin/audit-log")
                        .param("from", "2026-01-01T00:00:00Z")
                        .param("to", "2026-02-01T00:00:00Z")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private String token(UserRole role) {
        return jwtService.mint(new JwtSubject(UUID.randomUUID(), role.name().toLowerCase() + "@example.com", role,
                null, null)).value();
    }

    @TestConfiguration
    static class TestBeans {

        @Bean
        JwtProperties jwtProperties() {
            return new JwtProperties("http://localhost:8084", Duration.ofMinutes(15), "test-key", null, null);
        }

        @Bean
        RsaKeyManager rsaKeyManager(JwtProperties properties) {
            return RsaKeyManager.generate(properties.keyId());
        }

        @Bean
        InternalJwtService internalJwtService(JwtProperties properties, RsaKeyManager keyManager) {
            return new InternalJwtService(properties, keyManager);
        }
    }
}
