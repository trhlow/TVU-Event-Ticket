package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.TrustedDevice;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.repository.TrustedDeviceRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.service.TrustedDeviceService.ExchangeResult;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TrustedDeviceService.class, TrustedDeviceIntegrationTest.Metrics.class})
class TrustedDeviceIntegrationTest extends AbstractPostgresIntegrationTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class Metrics {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }

    @Autowired
    private TrustedDeviceService trustedDeviceService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TrustedDeviceRepository trustedDeviceRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private User admin(String email) {
        return userRepository.saveAndFlush(User.emailOtpSuperAdmin(email, "Admin"));
    }

    @Test
    void revokeIfActive_winsExactlyOnceForTheSameToken() {
        // The atomic guard behind the concurrency fix: only the caller whose UPDATE flips revoked_at
        // from null wins (returns 1); a second attempt matches nothing (returns 0) and is a replay.
        var user = admin("once@tvu.edu.vn");
        var now = Instant.now();
        trustedDeviceRepository.saveAndFlush(new TrustedDevice(user.getId(), UUID.randomUUID(), 0L,
                "hash-abc", now, now.plus(Duration.ofDays(30))));

        assertThat(trustedDeviceRepository.revokeIfActive("hash-abc", Instant.now())).isEqualTo(1);
        assertThat(trustedDeviceRepository.revokeIfActive("hash-abc", Instant.now())).isEqualTo(0);
    }

    @Test
    void exchange_rotatesALiveCookie() {
        var user = admin("rotate@tvu.edu.vn");
        var issued = trustedDeviceService.remember(user.getId(), user.getAuthVersion());

        var result = trustedDeviceService.exchange(issued.rawToken(), user.getAuthVersion());

        assertThat(result).isInstanceOfSatisfying(ExchangeResult.Rotated.class, rotated -> {
            assertThat(rotated.userId()).isEqualTo(user.getId());
            assertThat(rotated.rawToken()).isNotEqualTo(issued.rawToken());
        });
    }

    @Test
    @DisplayName("rotation keeps the original absolute expiry, so refreshing cannot extend it forever")
    void exchange_doesNotExtendTheAbsoluteExpiry() {
        var user = admin("expiry@tvu.edu.vn");
        var issued = trustedDeviceService.remember(user.getId(), user.getAuthVersion());

        var rotated = (ExchangeResult.Rotated) trustedDeviceService.exchange(
                issued.rawToken(), user.getAuthVersion());

        // The same instant, not now+30d: otherwise a browser that refreshes daily is remembered for
        // ever, and "30 days" describes each individual token rather than the browser.
        assertThat(rotated.expiresAt()).isEqualTo(issued.expiresAt());
    }

    @Test
    @DisplayName("rotation keeps the family, so the browser has one identity across many tokens")
    void exchange_keepsTheDeviceFamily() {
        var user = admin("family@tvu.edu.vn");
        var issued = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        var familyBefore = trustedDeviceRepository.findByUserId(user.getId()).getFirst().getDeviceFamilyId();

        var rotated = (ExchangeResult.Rotated) trustedDeviceService.exchange(
                issued.rawToken(), user.getAuthVersion());

        assertThat(rotated.familyId()).isEqualTo(familyBefore);
    }

    @Test
    @DisplayName("replay of the live generation revokes that browser only, not the whole account")
    void exchange_replayOfLiveGenerationRevokesOnlyThatFamily() {
        var user = admin("replay-live@tvu.edu.vn");
        var laptop = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        var phone = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        trustedDeviceService.exchange(laptop.rawToken(), user.getAuthVersion());

        // The old cookie comes back: someone else has a copy of it.
        var result = trustedDeviceService.exchange(laptop.rawToken(), user.getAuthVersion());

        assertThat(result).isEqualTo(new ExchangeResult.Rejected(
                ExchangeResult.Reason.REPLAY_LIVE_GENERATION, true));
        // The phone was never involved and stays signed in. Revoking it too was the old behaviour,
        // which turned one stolen cookie into a sign-out of every device on the account.
        assertThat(trustedDeviceService.exchange(phone.rawToken(), user.getAuthVersion()))
                .isInstanceOf(ExchangeResult.Rotated.class);
    }

    @Test
    @DisplayName("replay from a superseded generation cannot revoke devices registered after it")
    void exchange_replayOfStaleGenerationLeavesCurrentDevicesAlone() {
        // The denial of service M1 exists to close: after signing out everywhere, whoever kept an old
        // cookie could replay it repeatedly and keep knocking out the devices the victim had just
        // re-registered — for as long as the tombstone lived, up to 30 days.
        var user = admin("replay-stale@tvu.edu.vn");
        var stolen = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        trustedDeviceService.exchange(stolen.rawToken(), user.getAuthVersion());

        // Sign-out-all: revoke every device and move the generation on.
        trustedDeviceService.revokeAll(user.getId());
        user.revokeIssuedTokens();
        var current = userRepository.saveAndFlush(user);

        // The victim signs in again and re-registers this browser under the new generation.
        var fresh = trustedDeviceService.remember(current.getId(), current.getAuthVersion());

        var result = trustedDeviceService.exchange(stolen.rawToken(), current.getAuthVersion());

        assertThat(result).isEqualTo(new ExchangeResult.Rejected(
                ExchangeResult.Reason.REPLAY_STALE_GENERATION, false));
        assertThat(trustedDeviceService.exchange(fresh.rawToken(), current.getAuthVersion()))
                .isInstanceOf(ExchangeResult.Rotated.class);
    }

    @Test
    @DisplayName("a device claiming a newer generation than its user is refused, not treated as old")
    void exchange_rejectsAnImpossibleGeneration() {
        // Only reachable through corrupted data: a bad backfill, or a restore that put users and
        // trusted_devices at different points in time. Folding it into the "older generation" branch
        // would silently discard that signal, so it gets its own outcome.
        var user = admin("impossible@tvu.edu.vn");
        var issued = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        trustedDeviceService.exchange(issued.rawToken(), user.getAuthVersion());
        // Push the stored generation beyond anything the user has ever had.
        jdbc.update("UPDATE trusted_devices SET issued_auth_version = ? WHERE user_id = ?",
                user.getAuthVersion() + 5, user.getId());

        var result = trustedDeviceService.exchange(issued.rawToken(), user.getAuthVersion());

        assertThat(result).isEqualTo(new ExchangeResult.Rejected(
                ExchangeResult.Reason.IMPOSSIBLE_GENERATION, false));
    }

    @Test
    @DisplayName("cleanup deletes expired rows but keeps the revoked tombstones replay detection needs")
    void deleteExpired_keepsRevokedButUnexpiredRows() {
        var user = admin("cleanup@tvu.edu.vn");
        var now = Instant.now();
        // Revoked yesterday, still far from its absolute expiry: this is the tombstone that lets a
        // stolen cookie be recognised instead of looking like an unknown token.
        trustedDeviceRepository.saveAndFlush(new TrustedDevice(user.getId(), UUID.randomUUID(), 0L,
                "hash-revoked", now.minus(Duration.ofDays(1)), now.plus(Duration.ofDays(20))));
        trustedDeviceRepository.revokeIfActive("hash-revoked", now);
        trustedDeviceRepository.saveAndFlush(new TrustedDevice(user.getId(), UUID.randomUUID(), 0L,
                "hash-expired", now.minus(Duration.ofDays(40)), now.minus(Duration.ofDays(10))));

        var deleted = trustedDeviceService.deleteExpired();

        assertThat(deleted).isEqualTo(1);
        assertThat(trustedDeviceRepository.findByTokenHash("hash-revoked")).isPresent();
        assertThat(trustedDeviceRepository.findByTokenHash("hash-expired")).isEmpty();
    }

    @Test
    void revokeFamily_endsOneBrowserAndLeavesTheOthers() {
        var user = admin("logout-one@tvu.edu.vn");
        var laptop = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        var phone = trustedDeviceService.remember(user.getId(), user.getAuthVersion());
        var laptopFamily = trustedDeviceRepository.findByUserId(user.getId()).getFirst().getDeviceFamilyId();

        trustedDeviceService.revokeFamily(laptopFamily);

        assertThat(trustedDeviceService.exchange(laptop.rawToken(), user.getAuthVersion()))
                .isInstanceOf(ExchangeResult.Rejected.class);
        assertThat(trustedDeviceService.exchange(phone.rawToken(), user.getAuthVersion()))
                .isInstanceOf(ExchangeResult.Rotated.class);
    }
}
