package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.security.CsrfTokenService;
import vn.edu.tvu.auth.security.JwtSubject;

import org.springframework.stereotype.Component;

/**
 * Turns an authenticated user into a session: a signed JWT and its bound CSRF token. Both the Entra login
 * and the emailed-code login end here, so the token shape stays identical no matter how the user proved
 * who they are.
 */
@Component
public class SessionMinter {

    private final InternalJwtService jwtService;
    private final CsrfTokenService csrfTokenService;

    public SessionMinter(InternalJwtService jwtService, CsrfTokenService csrfTokenService) {
        this.jwtService = jwtService;
        this.csrfTokenService = csrfTokenService;
    }

    public LoginResult mint(User user) {
        var jwt = jwtService.mint(new JwtSubject(
                user.getId(),
                user.getEmail(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getMssv(),
                user.getMssvStatus() == MssvStatus.VERIFIED));
        return new LoginResult(profile(user), jwt, csrfTokenService.sign(jwt.jti(), jwt.expiresAt()));
    }

    public AuthProfileResponse profile(User user) {
        return new AuthProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getMssv(),
                user.getClassCode(),
                user.getMssvStatus(),
                user.getMssv() != null && !user.getMssv().isBlank());
    }
}
