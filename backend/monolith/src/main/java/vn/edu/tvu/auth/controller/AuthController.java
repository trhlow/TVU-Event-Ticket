package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.request.OtpRequest;
import vn.edu.tvu.auth.dto.request.OtpVerifyRequest;
import vn.edu.tvu.auth.dto.request.UpdateDisplayNameRequest;
import vn.edu.tvu.auth.dto.request.UpdateProfileRequest;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.dto.response.LoginResponse;
import vn.edu.tvu.auth.security.AuthCookieService;
import vn.edu.tvu.auth.service.AdminOtpService;
import vn.edu.tvu.auth.service.TrustedDeviceService;
import vn.edu.tvu.auth.service.AdminSession;
import vn.edu.tvu.auth.service.AuthApplicationService;
import vn.edu.tvu.auth.service.LoginResult;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Login, current profile, profile completion, and logout")
public class AuthController {

    private final AuthApplicationService authService;
    private final AdminOtpService adminOtpService;
    private final AuthCookieService cookieService;
    private final TrustedDeviceService trustedDeviceService;

    public AuthController(AuthApplicationService authService, AdminOtpService adminOtpService,
            AuthCookieService cookieService, TrustedDeviceService trustedDeviceService) {
        this.authService = authService;
        this.adminOtpService = adminOtpService;
        this.cookieService = cookieService;
        this.trustedDeviceService = trustedDeviceService;
    }

    @PostMapping("/login")
    @Operation(summary = "Login with external identity credential")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return withSession(authService.login(request));
    }

    @PostMapping("/otp/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Request an emailed sign-in code for an admin account")
    public void requestOtp(@Valid @RequestBody OtpRequest request) {
        adminOtpService.requestCode(request.email());
    }

    @PostMapping("/otp/verify")
    @Operation(summary = "Verify an emailed sign-in code and start a session")
    public ResponseEntity<LoginResponse> verifyOtp(@Valid @RequestBody OtpVerifyRequest request) {
        return withSession(adminOtpService.verify(request.email(), request.code(), request.rememberDevice()));
    }

    @PostMapping("/session/refresh")
    @Operation(summary = "Exchange a remembered-device cookie for a fresh session")
    public ResponseEntity<LoginResponse> refreshSession(
            @CookieValue(name = AuthCookieService.DEVICE_COOKIE, required = false) String deviceToken) {
        return withSession(adminOtpService.refresh(deviceToken));
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

    @PatchMapping("/me")
    @Operation(summary = "Update display name for organizer/admin accounts and re-issue JWT")
    public ResponseEntity<LoginResponse> updateDisplayName(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateDisplayNameRequest request) {
        return withSession(authService.updateDisplayName(UUID.fromString(jwt.getSubject()), request));
    }

    @PostMapping("/logout")
    @Operation(summary = "End this browser's session and clear its cookies")
    public ResponseEntity<LogoutResponse> logout(
            @CookieValue(name = "TVU_DEVICE", required = false) String deviceToken) {
        // This browser only. Signing every device out from here would make the dedicated
        // sign-out-all endpoint meaningless, and because logout is exempt from CSRF it would hand
        // anyone a way to sign a user out of all their devices from another site.
        trustedDeviceService.revokeActiveInFamilyOf(deviceToken);
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

    private ResponseEntity<LoginResponse> withSession(AdminSession session) {
        var headers = new HttpHeaders();
        cookieService.loginCookies(session.session().jwt(), session.session().csrfToken())
                .forEach(cookie -> headers.add(HttpHeaders.SET_COOKIE, cookie));
        if (session.deviceToken() != null) {
            headers.add(HttpHeaders.SET_COOKIE, cookieService.deviceCookie(session.deviceToken(), session.deviceExpiresAt()));
        }
        return ResponseEntity.ok()
                .headers(headers)
                .body(new LoginResponse(session.session().profile()));
    }

    public record LogoutResponse(String code) {
    }
}
