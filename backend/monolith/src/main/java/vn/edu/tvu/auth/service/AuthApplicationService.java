package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.request.UpdateProfileRequest;
import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.identity.ExternalIdentity;
import vn.edu.tvu.auth.identity.IdentityProvider;
import vn.edu.tvu.auth.repository.UserRepository;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthApplicationService {

    private final IdentityProvider identityProvider;
    private final UserRepository userRepository;
    private final SessionMinter sessionMinter;

    public AuthApplicationService(
            IdentityProvider identityProvider,
            UserRepository userRepository,
            SessionMinter sessionMinter) {
        this.identityProvider = identityProvider;
        this.userRepository = userRepository;
        this.sessionMinter = sessionMinter;
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
        return sessionMinter.mint(saved);
    }

    @Transactional(readOnly = true)
    public AuthProfileResponse me(UUID userId) {
        return userRepository.findById(userId)
                .map(sessionMinter::profile)
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
        return sessionMinter.mint(userRepository.save(user));
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

}
