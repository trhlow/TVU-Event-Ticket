package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.config.BootstrapAdminProperties;
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

import java.util.Optional;
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
    private final BootstrapAdminProperties bootstrapAdminProperties;

    public AuthApplicationService(
            IdentityProvider identityProvider,
            UserRepository userRepository,
            InternalJwtService jwtService,
            CsrfTokenService csrfTokenService,
            BootstrapAdminProperties bootstrapAdminProperties) {
        this.identityProvider = identityProvider;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.csrfTokenService = csrfTokenService;
        this.bootstrapAdminProperties = bootstrapAdminProperties;
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        var identity = identityProvider.verify(request.credential());
        var user = findExistingUser(identity)
                .map(existing -> updateExisting(existing, identity))
                .orElseGet(() -> createUser(identity));
        if (user.getStatus() == UserStatus.LOCKED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is locked");
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

    private Optional<User> findExistingUser(ExternalIdentity identity) {
        return userRepository.findByEmail(identity.email())
                .or(() -> userRepository.findByExtSubject(identity.subject()));
    }

    private User updateExisting(User user, ExternalIdentity identity) {
        user.updateIdentity(identity.subject(), identity.email(), identity.displayName());
        if (isBootstrapAdmin(identity.email())) {
            user.promoteToSuperAdmin();
        }
        return user;
    }

    private User createUser(ExternalIdentity identity) {
        if (isBootstrapAdmin(identity.email())) {
            return User.superAdmin(identity.subject(), identity.email(), identity.displayName());
        }
        return User.student(identity.subject(), identity.email(), identity.displayName());
    }

    private boolean isBootstrapAdmin(String email) {
        return bootstrapAdminProperties.hasEmail()
                && bootstrapAdminProperties.normalizedEmail().equalsIgnoreCase(email);
    }

    private LoginResult sessionFor(User user) {
        var jwt = jwtService.mint(new JwtSubject(
                user.getId(),
                user.getEmail(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getMssv()));
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
                user.getMssv() != null && !user.getMssv().isBlank());
    }
}
