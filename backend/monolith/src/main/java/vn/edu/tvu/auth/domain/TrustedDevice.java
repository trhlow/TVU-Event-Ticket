package vn.edu.tvu.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trusted_devices")
public class TrustedDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /**
     * Identifies the browser, not the token. Stays the same across every rotation, so logging out
     * of one device can revoke exactly that device even when the cookie presented has already been
     * rotated away.
     */
    @Column(name = "device_family_id", nullable = false)
    private UUID deviceFamilyId;

    /**
     * The user's auth_version when this device was issued. A replayed cookie is classified against
     * the current value rather than always being treated as a live theft.
     */
    @Column(name = "issued_auth_version", nullable = false)
    private long issuedAuthVersion;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected TrustedDevice() {
    }

    public TrustedDevice(UUID userId, UUID deviceFamilyId, long issuedAuthVersion, String tokenHash,
                         Instant createdAt, Instant expiresAt) {
        this.userId = userId;
        this.deviceFamilyId = deviceFamilyId;
        this.issuedAuthVersion = issuedAuthVersion;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    /** A brand-new browser: its own family, issued under the caller's current generation. */
    public static TrustedDevice firstOfFamily(UUID userId, long authVersion, String tokenHash,
                                              Instant createdAt, Instant expiresAt) {
        return new TrustedDevice(userId, UUID.randomUUID(), authVersion, tokenHash, createdAt, expiresAt);
    }

    /**
     * The next token for this same browser. Keeps the family and, deliberately, the original
     * absolute expiry: refreshing must not extend the 30 days indefinitely, otherwise a chain of
     * refreshes never expires and "remembered for 30 days" is not true of the browser, only of
     * each individual token.
     */
    public TrustedDevice rotateTo(String newTokenHash, long authVersion, Instant now) {
        return new TrustedDevice(userId, deviceFamilyId, authVersion, newTokenHash, now, expiresAt);
    }

    public void revoke(Instant when) {
        if (revokedAt == null) {
            revokedAt = when;
        }
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getDeviceFamilyId() {
        return deviceFamilyId;
    }

    public long getIssuedAuthVersion() {
        return issuedAuthVersion;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
