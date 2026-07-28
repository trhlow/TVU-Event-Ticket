package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.TrustedDevice;
import vn.edu.tvu.auth.repository.TrustedDeviceRepository;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Remembers a verified browser for 30 days so an admin does not re-enter a code on every visit. The
 * raw token lives only in the cookie; the table holds its hash, and the token rotates on every use.
 *
 * <p>Two identities matter here and they are not the same thing: the <em>token</em>, which changes
 * on every refresh, and the <em>device family</em>, which is the browser and does not. Revocation
 * decisions are made about families.
 *
 * <p>⚠️ Lock ordering. Callers must hold the {@code users} row lock before invoking anything here
 * that mutates {@code trusted_devices} — see {@link #exchange}. Mutating devices first and reading
 * the user afterwards is the opposite order from sign-out-all and lock-organiser, and running both
 * directions concurrently deadlocks.
 */
@Service
public class TrustedDeviceService {

    private static final Duration LIFETIME = Duration.ofDays(30);
    private static final Logger LOGGER = LoggerFactory.getLogger(TrustedDeviceService.class);

    private final TrustedDeviceRepository repository;
    private final SecureRandom random = new SecureRandom();
    private final Counter impossibleGeneration;

    public TrustedDeviceService(TrustedDeviceRepository repository, MeterRegistry meterRegistry) {
        this.repository = repository;
        this.impossibleGeneration = Counter.builder("auth.trusted_device.impossible_generation")
                .description("Device rows whose issued_auth_version exceeds the user's current one")
                .register(meterRegistry);
    }

    /** What a presented device cookie turned out to be. */
    public sealed interface ExchangeResult {

        /** The cookie was live: it has been rotated and the successor token is returned. */
        record Rotated(UUID userId, UUID familyId, String rawToken, Instant expiresAt) implements ExchangeResult {}

        /** The cookie cannot be used. {@code familyRevoked} says whether this also ended a session. */
        record Rejected(Reason reason, boolean familyRevoked) implements ExchangeResult {}

        enum Reason {
            /** No such token — already cleaned up, or never existed. */
            UNKNOWN,
            /** Past its absolute expiry. */
            EXPIRED,
            /** Replay of a token from the generation still in force: a genuinely stolen cookie. */
            REPLAY_LIVE_GENERATION,
            /** Replay of a token from a generation already invalidated: stale, and harmless. */
            REPLAY_STALE_GENERATION,
            /** Issued under a generation newer than the user has ever had: the data is wrong. */
            IMPOSSIBLE_GENERATION
        }
    }

    /**
     * Locates the owner of a cookie without touching anything.
     *
     * <p>Exists so a caller can take the {@code users} lock first: this read is only allowed to find
     * out <em>which</em> row to lock. Nothing it returns may be used to decide anything — the state
     * is re-read under the lock in {@link #exchange}.
     */
    @Transactional(readOnly = true)
    public Optional<UUID> ownerOf(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        return repository.findByTokenHash(hash(rawToken)).map(TrustedDevice::getUserId);
    }

    /**
     * Rotates a live cookie, or classifies why it cannot be used.
     *
     * @param currentAuthVersion the user's auth_version, read in this transaction while holding the
     *                           user row lock. Passing a stale value would let a token from an
     *                           already-revoked generation be accepted.
     */
    @Transactional
    public ExchangeResult exchange(String rawToken, long currentAuthVersion) {
        var now = Instant.now();
        var hash = hash(rawToken);
        var device = repository.findByTokenHash(hash).orElse(null);
        if (device == null) {
            return new ExchangeResult.Rejected(ExchangeResult.Reason.UNKNOWN, false);
        }
        if (device.getExpiresAt().isBefore(now)) {
            return new ExchangeResult.Rejected(ExchangeResult.Reason.EXPIRED, false);
        }

        // The database decides who wins the rotation, not the value read above: only the caller
        // whose atomic UPDATE flips revoked_at gets a count of 1. A count of 0 means the token was
        // already spent, i.e. this cookie is a replay.
        if (repository.revokeIfActive(hash, now) == 1) {
            var successor = rotate(device, currentAuthVersion, now);
            return new ExchangeResult.Rotated(device.getUserId(), device.getDeviceFamilyId(),
                    successor.rawToken(), successor.expiresAt());
        }

        return classifyReplay(device, currentAuthVersion, now);
    }

    /**
     * Three explicit branches, never {@code !=}.
     *
     * <p>Collapsing them would either punish a victim or swallow a data fault: treating a stale
     * replay as a live one lets anyone holding an old cookie keep revoking the devices the user has
     * just re-registered, and folding the impossible case into "old generation" discards the only
     * signal that {@code users} and {@code trusted_devices} disagree.
     */
    private ExchangeResult classifyReplay(TrustedDevice device, long currentAuthVersion, Instant now) {
        var issued = device.getIssuedAuthVersion();

        if (issued == currentAuthVersion) {
            // A live cookie was used twice: one of the two holders is not the owner. End this
            // browser's session — this family only, not every device on the account.
            var revoked = repository.revokeActiveInFamily(device.getDeviceFamilyId(), now);
            LOGGER.warn("Replayed device cookie for userId={} family={}; revoked {} active row(s)",
                    device.getUserId(), device.getDeviceFamilyId(), revoked);
            return new ExchangeResult.Rejected(ExchangeResult.Reason.REPLAY_LIVE_GENERATION, revoked > 0);
        }

        if (issued < currentAuthVersion) {
            // The generation this cookie belongs to was already invalidated, so it grants nothing and
            // threatens nothing. Touching the current devices here is exactly the denial of service
            // this branch exists to prevent.
            LOGGER.info("Replayed device cookie from a superseded generation for userId={} "
                            + "(issued={}, current={}); rejecting without touching current devices",
                    device.getUserId(), issued, currentAuthVersion);
            return new ExchangeResult.Rejected(ExchangeResult.Reason.REPLAY_STALE_GENERATION, false);
        }

        // issued > current: no normal flow can produce this. A bad backfill, a failed migration, or a
        // restore that put users and trusted_devices at different points in time.
        impossibleGeneration.increment();
        LOGGER.error("Device row claims auth_version {} but user {} is at {} — refusing to mint. "
                        + "This indicates corrupted or mismatched data, not a login problem.",
                issued, device.getUserId(), currentAuthVersion);
        return new ExchangeResult.Rejected(ExchangeResult.Reason.IMPOSSIBLE_GENERATION, false);
    }

    /** Issues the first token for a browser the user has just verified. */
    @Transactional
    public Issued remember(UUID userId, long authVersion) {
        var now = Instant.now();
        var token = newToken();
        var expiresAt = now.plus(LIFETIME);
        repository.save(TrustedDevice.firstOfFamily(userId, authVersion, hash(token), now, expiresAt));
        return new Issued(token, expiresAt);
    }

    private Issued rotate(TrustedDevice previous, long authVersion, Instant now) {
        var token = newToken();
        repository.save(previous.rotateTo(hash(token), authVersion, now));
        return new Issued(token, previous.getExpiresAt());
    }

    /** Ends one browser's session, leaving the user's other devices signed in. */
    @Transactional
    public int revokeFamily(UUID familyId) {
        return repository.revokeActiveInFamily(familyId, Instant.now());
    }

    /**
     * Logout: ends the session of the browser that presented this cookie.
     *
     * <p>Resolves the cookie to a <em>family</em> and revokes that family's currently active row —
     * not the row the cookie itself names. If a refresh rotated the token a moment earlier, the
     * presented row is already revoked while its successor is live, and revoking only what was
     * presented would leave the browser signed in after the user pressed log out.
     *
     * <p>Deliberately not implemented by calling {@link #exchange}: a token that is already revoked
     * takes the replay branch there, so logging out twice would be treated as a stolen cookie.
     *
     * <p>Idempotent and silent. An unknown, malformed or expired cookie revokes nothing and reports
     * nothing — logout always succeeds from the caller's point of view.
     */
    @Transactional
    public int revokeActiveInFamilyOf(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return 0;
        }
        return repository.findByTokenHash(hash(rawToken))
                .map(device -> repository.revokeActiveInFamily(device.getDeviceFamilyId(), Instant.now()))
                .orElse(0);
    }

    /** Sign-out-all: every device on the account. Callers must also bump the user's auth_version. */
    @Transactional
    public void revokeAll(UUID userId) {
        var now = Instant.now();
        repository.findByUserId(userId).forEach(device -> device.revoke(now));
    }

    /**
     * Deletes rows past their absolute expiry. Deliberately not "delete revoked rows": a revoked row
     * is the tombstone replay detection matches against.
     */
    @Transactional
    public int deleteExpired() {
        return repository.deleteExpired(Instant.now());
    }

    private String newToken() {
        var raw = new byte[32];
        random.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    /** A raw token and the absolute moment it stops working, so the cookie can be given a matching age. */
    public record Issued(String rawToken, Instant expiresAt) {
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
