package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

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
