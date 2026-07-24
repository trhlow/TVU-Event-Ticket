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

    public AdminOtpService(
            UserRepository userRepository,
            OtpCodeIssuer otpCodeIssuer,
            OtpStore otpStore,
            OtpMailSender mailSender,
            SessionMinter sessionMinter) {
        this.userRepository = userRepository;
        this.otpCodeIssuer = otpCodeIssuer;
        this.otpStore = otpStore;
        this.mailSender = mailSender;
        this.sessionMinter = sessionMinter;
    }

    @Transactional(readOnly = true)
    public void requestCode(String email) {
        var user = activeAdmin(email).orElse(null);
        if (user == null) {
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

    @Transactional(readOnly = true)
    public LoginResult verify(String email, String code) {
        var user = activeAdmin(email).orElseThrow(this::rejected);
        if (otpStore.verify(user.getId(), code) != OtpStore.Result.OK) {
            throw rejected();
        }
        return sessionMinter.mint(user);
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
