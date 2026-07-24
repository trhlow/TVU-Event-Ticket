package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.TrustedDevice;
import vn.edu.tvu.auth.repository.TrustedDeviceRepository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Remembers a verified browser for 30 days so an admin does not re-enter a code on every visit. The raw
 * token lives only in the cookie; the table holds its hash. The token rotates on every use, and a token
 * presented after it was rotated away means the cookie was copied — that drops every device on the account.
 */
@Service
public class TrustedDeviceService {

    private static final Duration LIFETIME = Duration.ofDays(30);

    private final TrustedDeviceRepository repository;
    private final SecureRandom random = new SecureRandom();

    public TrustedDeviceService(TrustedDeviceRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public String remember(UUID userId) {
        var raw = new byte[32];
        random.nextBytes(raw);
        var token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        var now = Instant.now();
        repository.save(new TrustedDevice(userId, hash(token), now, now.plus(LIFETIME)));
        return token;
    }

    @Transactional
    public Optional<UUID> exchange(String rawToken) {
        var device = repository.findByTokenHash(hash(rawToken)).orElse(null);
        if (device == null || device.getExpiresAt().isBefore(Instant.now())) {
            return Optional.empty();
        }
        if (device.getRevokedAt() != null) {
            revokeAll(device.getUserId());
            return Optional.empty();
        }
        device.revoke(Instant.now());
        return Optional.of(device.getUserId());
    }

    @Transactional
    public void revokeAll(UUID userId) {
        var now = Instant.now();
        repository.findByUserId(userId).forEach(device -> device.revoke(now));
    }

    private String hash(String token) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
