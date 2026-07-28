package vn.edu.tvu.auth.config;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.shared.domain.UserRole;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Makes sure every configured bootstrap address really is a usable super admin — or refuses to start.
 *
 * <p>This is the data half of the check. The configuration half (at least two addresses, well formed,
 * distinct) lives in {@code ProductionSecretsValidator}, which runs before anything touches the
 * database. Splitting them keeps the startup order obvious and lets each half be tested on its own.
 *
 * <p>It used to skip any address that already existed, whatever that row happened to be. So if a
 * bootstrap address had previously signed in as a student, startup succeeded, nobody was told, and the
 * first person to discover that no super admin existed was an administrator who could not sign in —
 * with no password to fall back on and no other account able to fix it.
 */
@Component
public class BootstrapSuperAdminRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(BootstrapSuperAdminRunner.class);

    private final BootstrapAdminProperties properties;
    private final UserRepository userRepository;

    public BootstrapSuperAdminRunner(BootstrapAdminProperties properties, UserRepository userRepository) {
        this.properties = properties;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (var email : properties.emails()) {
            var existing = userRepository.findByEmail(email).orElse(null);
            if (existing == null) {
                userRepository.save(User.emailOtpSuperAdmin(email, "Bootstrap Admin"));
                LOGGER.info("Bootstrapped super admin {}", email);
                continue;
            }
            if (!isUsableSuperAdmin(existing)) {
                // Loudly, and at startup. Carrying on would leave a deployment that looks healthy
                // while nobody can actually administer it.
                throw new IllegalStateException("Bootstrap address " + email + " already exists but is "
                        + describe(existing) + ", not an active super admin on the emailed-code path. "
                        + "Fix the account or use a different address; starting up would leave this "
                        + "deployment with no way to sign in as an administrator.");
            }
        }

        // A final assertion rather than trust in the loop above: a mistake there would otherwise be
        // discovered by an administrator who cannot sign in.
        for (var email : properties.emails()) {
            var user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new IllegalStateException(
                            "Bootstrap address " + email + " is still missing after bootstrap"));
            if (!isUsableSuperAdmin(user)) {
                throw new IllegalStateException("Bootstrap address " + email + " is " + describe(user)
                        + " after bootstrap, not an active super admin");
            }
        }
    }

    private static boolean isUsableSuperAdmin(User user) {
        return user.getRole() == UserRole.SUPER_ADMIN
                && user.getStatus() == UserStatus.ACTIVE
                && user.getAuthMethod() == AuthMethod.EMAIL_OTP;
    }

    private static String describe(User user) {
        return user.getRole() + "/" + user.getStatus() + "/" + user.getAuthMethod();
    }
}
