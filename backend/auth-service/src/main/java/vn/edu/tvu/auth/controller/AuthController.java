package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.request.UpdateProfileRequest;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.dto.response.LoginResponse;
import vn.edu.tvu.auth.security.AuthCookieService;
import vn.edu.tvu.auth.service.AuthApplicationService;
import vn.edu.tvu.auth.service.LoginResult;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Login, current profile, profile completion, and logout")
public class AuthController {

    private final AuthApplicationService authService;
    private final AuthCookieService cookieService;

    public AuthController(AuthApplicationService authService, AuthCookieService cookieService) {
        this.authService = authService;
        this.cookieService = cookieService;
    }

    @PostMapping("/login")
    @Operation(summary = "Login with external identity credential")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return withSession(authService.login(request));
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile")
    public AuthProfileResponse me(@AuthenticationPrincipal Jwt jwt) {
        return authService.me(UUID.fromString(jwt.getSubject()));
    }

    @PatchMapping("/me/profile")
    @Operation(summary = "Complete or update student profile and re-issue JWT")
    public ResponseEntity<LoginResponse> updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest request) {
        return withSession(authService.updateProfile(UUID.fromString(jwt.getSubject()), request));
    }

    @PostMapping("/logout")
    @Operation(summary = "Clear auth and CSRF cookies")
    public ResponseEntity<LogoutResponse> logout() {
        var headers = new HttpHeaders();
        cookieService.logoutCookies().forEach(cookie -> headers.add(HttpHeaders.SET_COOKIE, cookie));
        return ResponseEntity.ok()
                .headers(headers)
                .body(new LogoutResponse("LOGGED_OUT"));
    }

    private ResponseEntity<LoginResponse> withSession(LoginResult result) {
        var headers = new HttpHeaders();
        cookieService.loginCookies(result.jwt(), result.csrfToken())
                .forEach(cookie -> headers.add(HttpHeaders.SET_COOKIE, cookie));
        return ResponseEntity.ok()
                .headers(headers)
                .body(new LoginResponse(result.profile()));
    }

    public record LogoutResponse(String code) {
    }
}
