package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SessionEligibilityPolicyTest {

    private final SessionEligibilityPolicy policy = new SessionEligibilityPolicy();

    private static Club activeClub() {
        return new Club("CLB Tin hoc", null);
    }

    private static Club inactiveClub() {
        var club = new Club("CLB Tin hoc", null);
        club.deactivate();
        return club;
    }

    @Test
    void superAdminWithAnActiveAccountMaySignIn() {
        assertThat(policy.mayStartAdminSession(User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin"))).isTrue();
    }

    @Test
    void organiserOfAnActiveClubMaySignIn() {
        assertThat(policy.mayStartAdminSession(
                User.emailOtpOrganizer("o@tvu.edu.vn", "O", activeClub()))).isTrue();
    }

    @Test
    @DisplayName("an organiser whose club was deactivated may NOT sign in — the H7 bypass")
    void organiserOfADeactivatedClubMayNotSignIn() {
        // Deactivating a club left the organiser's own row ACTIVE, and the sign-in check only looked
        // at that row. So they simply asked for a new code and carried on working.
        assertThat(policy.mayStartAdminSession(
                User.emailOtpOrganizer("o@tvu.edu.vn", "O", inactiveClub()))).isFalse();
    }

    @Test
    void aLockedAccountMayNotSignIn() {
        var admin = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin");
        admin.lock();

        assertThat(policy.mayStartAdminSession(admin)).isFalse();
    }

    @Test
    void anOrganiserWithNoClubMayNotSignIn() {
        assertThat(policy.mayStartAdminSession(
                User.emailOtpOrganizer("o@tvu.edu.vn", "O", null))).isFalse();
    }

    @Test
    @DisplayName("a student may not use the emailed-code path, and vice versa")
    void theTwoPathsDoNotShareOneRule() {
        // The reason these are two predicates rather than one: reusing the admin rule for the
        // Microsoft flow would refuse every student, i.e. lock the whole product.
        var student = User.student("entra:s", "student@tvu.edu.vn", "Student");
        var admin = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin");

        assertThat(policy.mayStartAdminSession(student)).isFalse();
        assertThat(policy.mayStartStudentSession(student)).isTrue();
        assertThat(policy.mayStartStudentSession(admin)).isFalse();
    }
}
