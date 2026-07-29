package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.otp.OtpCodeIssuer;
import vn.edu.tvu.auth.otp.OtpMailSender;
import vn.edu.tvu.auth.otp.OtpStore;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.security.SessionEligibilityPolicy;

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
    private final SessionEligibilityPolicy eligibility;

    public AdminOtpService(
            UserRepository userRepository,
            OtpCodeIssuer otpCodeIssuer,
            OtpStore otpStore,
            OtpMailSender mailSender,
            SessionMinter sessionMinter,
            TrustedDeviceService trustedDeviceService,
            SessionEligibilityPolicy eligibility) {
        this.userRepository = userRepository;
        this.otpCodeIssuer = otpCodeIssuer;
        this.otpStore = otpStore;
        this.mailSender = mailSender;
        this.sessionMinter = sessionMinter;
        this.trustedDeviceService = trustedDeviceService;
        this.eligibility = eligibility;
    }

    @Transactional(readOnly = true)
    public void requestCode(String email) {
        var user = eligibleAdmin(email).orElse(null);
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
        var candidate = eligibleAdmin(email).orElseThrow(this::rejected);
        if (otpStore.verify(candidate.getId(), code) != OtpStore.Result.OK) {
            throw rejected();
        }
        // Layer 1 against the check-then-mint race: take the row lock and re-read. Checking
        // eligibility "just before minting" is not enough on its own — an admin can deactivate the
        // club between the read and the mint, and the freshly minted token would carry the new
        // auth_version and therefore be accepted. The lock makes the two operations take turns.
        var user = userRepository.findByIdForUpdate(candidate.getId())
                .filter(eligibility::mayStartAdminSession)
                .orElseThrow(this::rejected);
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
                .filter(eligibility::mayStartAdminSession)
                .orElseThrow(this::rejected);

        if (!(trustedDeviceService.exchange(rawDeviceToken, user.getAuthVersion())
                instanceof TrustedDeviceService.ExchangeResult.Rotated rotated)) {
            throw rejected();
        }
        return new AdminSession(sessionMinter.mint(user), rotated.rawToken(), rotated.expiresAt());
    }

    /**
     * Locates a candidate for the emailed-code path. The eligibility rule itself lives in
     * {@link SessionEligibilityPolicy} so that refresh — which finds its user by id and never comes
     * through here — is governed by the same rule.
     */
    private Optional<User> eligibleAdmin(String email) {
        return userRepository.findByEmailAndAuthMethod(normalize(email), AuthMethod.EMAIL_OTP)
                .filter(eligibility::mayStartAdminSession);
    }

    private String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private ResponseStatusException rejected() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or code");
    }
}
