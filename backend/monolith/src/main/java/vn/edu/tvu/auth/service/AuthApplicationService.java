package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.request.UpdateProfileRequest;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.identity.ExternalIdentity;
import vn.edu.tvu.auth.identity.IdentityProvider;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.security.CsrfTokenService;
import vn.edu.tvu.auth.security.JwtSubject;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthApplicationService {

    private final IdentityProvider identityProvider;
    private final UserRepository userRepository;
    private final InternalJwtService jwtService;
    private final CsrfTokenService csrfTokenService;

    public AuthApplicationService(
            IdentityProvider identityProvider,
            UserRepository userRepository,
            InternalJwtService jwtService,
            CsrfTokenService csrfTokenService) {
        this.identityProvider = identityProvider;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.csrfTokenService = csrfTokenService;
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        var identity = identityProvider.verify(request.credential());
        var user = resolveUser(identity);
        if (user.getStatus() == UserStatus.LOCKED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is locked");
        }
        if (user.getClub() != null && !user.getClub().isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Club is inactive");
        }
        var saved = userRepository.save(user);
        return sessionFor(saved);
    }

    @Transactional(readOnly = true)
    public AuthProfileResponse me(UUID userId) {
        return userRepository.findById(userId)
                .map(this::profile)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    @Transactional
    public LoginResult updateProfile(UUID userId, UpdateProfileRequest request) {
        var mssv = request.mssv().trim();
        if (userRepository.existsByMssvAndIdNot(mssv, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "MSSV already exists");
        }
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        user.completeProfile(mssv, request.classCode().trim());
        return sessionFor(userRepository.save(user));
    }

    /**
     * The Entra subject is the stable, non-reassignable identifier and is now the only thing this flow
     * matches on. Admin accounts live on the emailed-code path and carry no subject, so Entra cannot reach
     * them by address — a reissued email pointing at a brand-new subject simply becomes a new student.
     */
    private User resolveUser(ExternalIdentity identity) {
        return userRepository.findByExtSubject(identity.subject())
                .map(user -> {
                    user.updateIdentity(identity.subject(), identity.email(), identity.displayName());
                    return user;
                })
                .orElseGet(() -> User.student(identity.subject(), identity.email(), identity.displayName()));
    }

    private LoginResult sessionFor(User user) {
        var jwt = jwtService.mint(new JwtSubject(
                user.getId(),
                user.getEmail(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getMssv(),
                user.getMssvStatus() == MssvStatus.VERIFIED));
        return new LoginResult(profile(user), jwt, csrfTokenService.sign(jwt.jti(), jwt.expiresAt()));
    }

    private AuthProfileResponse profile(User user) {
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
