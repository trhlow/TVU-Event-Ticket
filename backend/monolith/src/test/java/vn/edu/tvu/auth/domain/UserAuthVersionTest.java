package vn.edu.tvu.auth.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Which changes invalidate the tokens already issued to a user, and which deliberately do not.
 *
 * <p>Every claim carried in the JWT has to be covered here: anything read from the token rather than
 * from the database can otherwise be replayed for the rest of that token's lifetime after the
 * underlying fact has changed.
 */
class UserAuthVersionTest {

    private static User student() {
        return User.student("entra:s", "student@tvu.edu.vn", "Student");
    }

    @Test
    @DisplayName("changing the MSSV invalidates tokens that still claim the old one — H9")
    void changingMssvBumps() {
        // The exploit this closes: a student verified under MSSV A keeps a copy of that token,
        // changes to MSSV B (which resets verification), then books a ticket with the old token —
        // the booking is accepted, recorded under A, and skips the "must be verified" gate entirely.
        var user = student();
        user.completeProfile("110122001", "DA21CNTT");
        var before = user.getAuthVersion();

        user.completeProfile("110122002", "DA21CNTT");

        assertThat(user.getAuthVersion()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("verifying an MSSV invalidates tokens that still say unverified")
    void verifyingMssvBumps() {
        var user = student();
        user.completeProfile("110122001", "DA21CNTT");
        var before = user.getAuthVersion();

        user.verifyMssv();

        assertThat(user.getAuthVersion()).isEqualTo(before + 1);
        assertThat(user.getMssvStatus()).isEqualTo(MssvStatus.VERIFIED);
    }

    @Test
    void verifyingAnAlreadyVerifiedMssvChangesNothing() {
        var user = student();
        user.completeProfile("110122001", "DA21CNTT");
        user.verifyMssv();
        var before = user.getAuthVersion();

        user.verifyMssv();

        assertThat(user.getAuthVersion()).isEqualTo(before);
    }

    @Test
    @DisplayName("a changed email invalidates tokens carrying the old address")
    void changingEmailOnLoginBumps() {
        var user = student();
        var before = user.getAuthVersion();

        user.updateIdentity("entra:s", "new-address@tvu.edu.vn", "Student");

        assertThat(user.getAuthVersion()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("logging in again with the same email does NOT sign the user out")
    void reLoginWithTheSameEmailDoesNotBump() {
        // updateIdentity runs on every Microsoft login. Bumping unconditionally would mean the act
        // of signing in invalidates the session you just created on your other device.
        var user = student();
        var before = user.getAuthVersion();

        user.updateIdentity("entra:s", "student@tvu.edu.vn", "Renamed By Provider");

        assertThat(user.getAuthVersion()).isEqualTo(before);
    }

    @Test
    @DisplayName("renaming yourself does NOT sign you out of every device")
    void renameDoesNotBump() {
        var user = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Before");
        var before = user.getAuthVersion();

        user.rename("After");

        assertThat(user.getAuthVersion()).isEqualTo(before);
    }

    @Test
    void lockingBumps() {
        var user = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin");
        var before = user.getAuthVersion();

        user.lock();

        assertThat(user.getAuthVersion()).isEqualTo(before + 1);
    }
}
