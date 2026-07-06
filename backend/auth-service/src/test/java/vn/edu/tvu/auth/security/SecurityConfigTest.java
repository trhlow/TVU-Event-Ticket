package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.controller.AdminController;
import vn.edu.tvu.auth.controller.AuthController;
import vn.edu.tvu.auth.controller.WellKnownController;
import vn.edu.tvu.auth.domain.UserRole;
import vn.edu.tvu.auth.service.AdminManagementService;
import vn.edu.tvu.auth.service.AuthApplicationService;
import vn.edu.tvu.auth.service.InternalJwtService;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

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

    @MockBean
    private AuthApplicationService authApplicationService;

    @MockBean
    private AuthCookieService authCookieService;

    @MockBean
    private AdminManagementService adminManagementService;

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
