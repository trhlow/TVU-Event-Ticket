package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.shared.domain.UserRole;

import org.springframework.stereotype.Component;

/**
 * Decides whether an account may be given a session right now.
 *
 * <p>Lives here, as a predicate over a loaded {@link User}, rather than inside a lookup-by-email
 * helper. The refresh path finds its user by id and never goes through such a helper, so a rule
 * written into "find the admin by email" silently would not apply to refresh — which is exactly how
 * a deactivated club's organiser kept getting sessions.
 *
 * <p>The two sign-in methods need <em>different</em> rules and must not share one predicate. Since
 * V13, Microsoft is for students only, while the emailed-code path is for organisers and super
 * admins; applying the admin rule to the Microsoft flow would lock every student out of the system.
 */
@Component
public class SessionEligibilityPolicy {

    /**
     * The emailed-code path: request a code, verify a code, refresh a remembered device.
     *
     * <p>An organiser's authority comes from their club, so a deactivated club must end their
     * access. Deactivating the club used to leave the user row untouched, so the organiser stayed
     * ACTIVE, asked for a new code and carried on working.
     */
    public boolean mayStartAdminSession(User user) {
        if (user.getStatus() != UserStatus.ACTIVE || user.getAuthMethod() != AuthMethod.EMAIL_OTP) {
            return false;
        }
        return switch (user.getRole()) {
            case SUPER_ADMIN -> true;
            case ORGANIZER -> user.getClub() != null && user.getClub().isActive();
            // Students never sign in with a code; V13 forbids the row shape entirely.
            case SINH_VIEN -> false;
        };
    }

    /**
     * The Microsoft path. Deliberately a separate rule, not a reuse of the one above: only students
     * arrive here, and they belong to no club.
     */
    public boolean mayStartStudentSession(User user) {
        return user.getStatus() == UserStatus.ACTIVE
                && user.getAuthMethod() == AuthMethod.MICROSOFT
                && user.getRole() == UserRole.SINH_VIEN;
    }
}
