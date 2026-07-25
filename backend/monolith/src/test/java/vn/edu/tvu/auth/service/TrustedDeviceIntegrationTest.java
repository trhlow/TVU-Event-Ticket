package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.TrustedDevice;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.repository.TrustedDeviceRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TrustedDeviceService.class)
class TrustedDeviceIntegrationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private TrustedDeviceService trustedDeviceService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TrustedDeviceRepository trustedDeviceRepository;

    @Test
    void revokeIfActive_winsExactlyOnceForTheSameToken() {
        // The atomic guard behind the concurrency fix: only the caller whose UPDATE flips revoked_at from
        // null wins (returns 1); a second attempt on the same row matches nothing (returns 0) and is
        // treated as a replayed cookie. Under two simultaneous refreshes the row lock serialises them, so
        // exactly one wins rather than both reading null and both succeeding.
        var admin = userRepository.save(User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin"));
        var now = Instant.now();
        trustedDeviceRepository.save(
                new TrustedDevice(admin.getId(), "hash-abc", now, now.plus(Duration.ofDays(30))));

        assertThat(trustedDeviceRepository.revokeIfActive("hash-abc", Instant.now())).isEqualTo(1);
        assertThat(trustedDeviceRepository.revokeIfActive("hash-abc", Instant.now())).isEqualTo(0);
    }

    @Test
    void exchange_rotatesAndKeepsTheUserSignedIn() {
        var admin = userRepository.save(User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin"));
        var token = trustedDeviceService.remember(admin.getId());

        assertThat(trustedDeviceService.exchange(token)).contains(admin.getId());
    }

    @Test
    void exchange_revokesEveryDeviceWhenARotatedTokenComesBack() {
        var admin = userRepository.save(User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin"));
        var first = trustedDeviceService.remember(admin.getId());
        var second = trustedDeviceService.remember(admin.getId());

        var rotated = trustedDeviceService.exchange(first).orElseThrow();
        assertThat(rotated).isEqualTo(admin.getId());

        assertThat(trustedDeviceService.exchange(first)).isEmpty();
        assertThat(trustedDeviceService.exchange(second)).isEmpty();
    }
}
