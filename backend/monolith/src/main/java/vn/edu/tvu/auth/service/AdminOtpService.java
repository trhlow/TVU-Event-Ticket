package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.otp.OtpCodeIssuer;
import vn.edu.tvu.auth.otp.OtpMailSender;
import vn.edu.tvu.auth.otp.OtpStore;
import vn.edu.tvu.auth.repository.UserRepository;

import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Signs admins in with a mailed code. Every branch that could reveal whether an address belongs to an
 * admin — an unknown address, the wrong sign-in method, a locked account, a wrong or expired code — is
 * made indistinguishable: request always succeeds silently, verify always fails the same 401.
 */
@Service
public class AdminOtpService {

    private static final Logger log = LoggerFactory.getLogger(AdminOtpService.class);

    private final UserRepository userRepository;
    private final OtpCodeIssuer otpCodeIssuer;
    private final OtpStore otpStore;
    private final OtpMailSender mailSender;
    private final SessionMinter sessionMinter;
    private final TrustedDeviceService trustedDeviceService;

    public AdminOtpService(
            UserRepository userRepository,
            OtpCodeIssuer otpCodeIssuer,
            OtpStore otpStore,
            OtpMailSender mailSender,
            SessionMinter sessionMinter,
            TrustedDeviceService trustedDeviceService) {
        this.userRepository = userRepository;
        this.otpCodeIssuer = otpCodeIssuer;
        this.otpStore = otpStore;
        this.mailSender = mailSender;
        this.sessionMinter = sessionMinter;
        this.trustedDeviceService = trustedDeviceService;
    }

    @Transactional(readOnly = true)
    public void requestCode(String email) {
        var user = activeAdmin(email).orElse(null);
        if (user == null) {
            return;
        }
        if (!otpStore.acquireSendSlot(user.getId())) {
            // Still a silent 202: telling the caller they were throttled would confirm the address exists.
            log.info("Suppressed an OTP send that was outside its budget");
            return;
        }
        var code = otpCodeIssuer.issue(user.getEmail());
        otpStore.save(user.getId(), code);
        try {
            mailSender.sendCode(user.getEmail(), code);
        } catch (RuntimeException ex) {
            // The caller already has its 202; surfacing a delivery failure would only tell an attacker the
            // address exists. Operators see it in the log instead.
            log.error("Failed to send OTP email", ex);
        }
    }

    @Transactional
    public AdminSession verify(String email, String code, boolean rememberDevice) {
        var user = activeAdmin(email).orElseThrow(this::rejected);
        if (otpStore.verify(user.getId(), code) != OtpStore.Result.OK) {
            throw rejected();
        }
        var device = rememberDevice
                ? trustedDeviceService.remember(user.getId(), user.getAuthVersion())
                : null;
        return new AdminSession(sessionMinter.mint(user),
                device == null ? null : device.rawToken(),
                device == null ? null : device.expiresAt());
    }

    /**
     * Exchanges a remembered-device cookie for a fresh session without a code.
     *
     * <p>The order of the three steps is load-bearing, not stylistic:
     * <ol>
     *   <li>locate the owner without touching anything;
     *   <li>lock that user row;
     *   <li>only then read state and rotate the device token.
     * </ol>
     *
     * <p>It used to rotate the device first and read the user afterwards. That is device → user,
     * the opposite of the user → device order sign-out-all and lock-organiser take, so the two
     * deadlocked. It also left a window: rotate revoked the old row, sign-out-all ran in between,
     * and the successor was then inserted <em>under the new generation</em> — leaving the user with
     * a working cookie and a valid JWT immediately after signing out everywhere.
     */
    @Transactional
    public AdminSession refresh(String rawDeviceToken) {
        var userId = trustedDeviceService.ownerOf(rawDeviceToken).orElseThrow(this::rejected);
        // Everything below decides on state read under this lock. What ownerOf() returned is only
        // used to pick the row, never to authorise anything.
        var user = userRepository.findByIdForUpdate(userId)
                .filter(candidate -> candidate.getAuthMethod() == AuthMethod.EMAIL_OTP
                        && candidate.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(this::rejected);

        if (!(trustedDeviceService.exchange(rawDeviceToken, user.getAuthVersion())
                instanceof TrustedDeviceService.ExchangeResult.Rotated rotated)) {
            throw rejected();
        }
        return new AdminSession(sessionMinter.mint(user), rotated.rawToken(), rotated.expiresAt());
    }

    private Optional<User> activeAdmin(String email) {
        return userRepository.findByEmailAndAuthMethod(normalize(email), AuthMethod.EMAIL_OTP)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE);
    }

    private String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private ResponseStatusException rejected() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or code");
    }
}
