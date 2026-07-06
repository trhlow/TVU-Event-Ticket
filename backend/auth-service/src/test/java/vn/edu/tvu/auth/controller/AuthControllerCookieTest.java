package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.domain.UserRole;
import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.security.AuthCookieProperties;
import vn.edu.tvu.auth.security.AuthCookieService;
import vn.edu.tvu.auth.security.JwtToken;
import vn.edu.tvu.auth.service.AuthApplicationService;
import vn.edu.tvu.auth.service.LoginResult;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthControllerCookieTest {

    @Test
    void login_setsHttpOnlyJwtCookieAndReadableXsrfCookie() {
        var appService = mock(AuthApplicationService.class);
        var controller = new AuthController(appService, new AuthCookieService(new AuthCookieProperties(
                "TVU_AUTH",
                "XSRF-TOKEN",
                false,
                "Lax",
                "/",
                Duration.ofMinutes(15))));
        var profile = new AuthProfileResponse(
                UUID.randomUUID(),
                "student@example.com",
                "Student",
                UserRole.SINH_VIEN,
                null,
                null,
                null,
                false);
        var jwt = new JwtToken("jwt-value", "jti-value", Instant.now().plusSeconds(900));
        when(appService.login(new LoginRequest("student@example.com", null)))
                .thenReturn(new LoginResult(profile, jwt, "csrf-value"));

        var response = controller.login(new LoginRequest("student@example.com", null));

        var cookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(2);
        assertThat(cookies.get(0))
                .contains("TVU_AUTH=jwt-value")
                .contains("HttpOnly")
                .contains("SameSite=Lax");
        assertThat(cookies.get(1))
                .contains("XSRF-TOKEN=csrf-value")
                .doesNotContain("HttpOnly")
                .contains("SameSite=Lax");
        assertThat(response.getBody().profile()).isEqualTo(profile);
    }

    @Test
    void logout_expiresJwtAndXsrfCookies() {
        var appService = mock(AuthApplicationService.class);
        var controller = new AuthController(appService, new AuthCookieService(new AuthCookieProperties(
                "TVU_AUTH",
                "XSRF-TOKEN",
                false,
                "Lax",
                "/",
                Duration.ofMinutes(15))));

        var response = controller.logout();

        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE))
                .hasSize(2)
                .allSatisfy(cookie -> assertThat(cookie).contains("Max-Age=0"));
        assertThat(response.getBody()).isEqualTo(new AuthController.LogoutResponse("LOGGED_OUT"));
    }
}
