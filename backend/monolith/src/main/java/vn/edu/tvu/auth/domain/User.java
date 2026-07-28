package vn.edu.tvu.auth.domain;

import vn.edu.tvu.shared.domain.UserRole;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Version
    @Column(nullable = false)
    private long version;

    /**
     * Bumped only by security-relevant operations, to invalidate JWTs already issued to this user.
     *
     * <p>Kept separate from {@link #version} on purpose: that one is JPA's optimistic-lock counter
     * and moves on every update, so reusing it would sign a user out of every device the moment
     * they edited their own display name.
     */
    @Column(name = "auth_version", nullable = false)
    private long authVersion;

    @Column(name = "ext_subject", unique = true)
    private String extSubject;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", nullable = false, length = 20)
    private AuthMethod authMethod = AuthMethod.MICROSOFT;

    @Column(nullable = false, unique = true, length = 320)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(length = 30)
    private String mssv;

    @Enumerated(EnumType.STRING)
    @Column(name = "mssv_status", nullable = false, length = 20)
    private MssvStatus mssvStatus = MssvStatus.UNVERIFIED;

    @Column(name = "class_code", length = 50)
    private String classCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private UserRole role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "club_id")
    private Club club;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected User() {
    }

    private User(String extSubject, String email, String displayName, UserRole role, Club club) {
        this.extSubject = extSubject;
        this.email = email;
        this.displayName = displayName;
        this.role = role;
        this.club = club;
    }

    public static User student(String extSubject, String email, String displayName) {
        return new User(extSubject, email, displayName, UserRole.SINH_VIEN, null);
    }

    public static User emailOtpOrganizer(String email, String displayName, Club club) {
        var user = new User(null, email, displayName, UserRole.ORGANIZER, club);
        user.authMethod = AuthMethod.EMAIL_OTP;
        return user;
    }

    public static User emailOtpSuperAdmin(String email, String displayName) {
        var user = new User(null, email, displayName, UserRole.SUPER_ADMIN, null);
        user.authMethod = AuthMethod.EMAIL_OTP;
        return user;
    }

    /**
     * Refreshes the identity a login just proved.
     *
     * <p>Bumps auth_version when the <em>email</em> changes, because the address travels in the JWT
     * as a claim: without this an old token keeps asserting the previous address for the rest of its
     * lifetime. displayName is not security-relevant and deliberately does not bump — renaming
     * yourself must not sign you out of every device.
     */
    public void updateIdentity(String extSubject, String email, String displayName) {
        if (!java.util.Objects.equals(this.email, email)) {
            revokeIssuedTokens();
        }
        this.extSubject = extSubject;
        this.email = email;
        this.displayName = displayName;
    }

    public void lock() {
        this.status = UserStatus.LOCKED;
        // Locking has to take effect now, not whenever this user's current JWT happens to expire.
        revokeIssuedTokens();
    }

    public long getAuthVersion() {
        return authVersion;
    }

    /**
     * Invalidates every JWT issued to this user so far. Call inside the transaction that performs
     * the revocation, so the state change and the invalidation commit together or not at all.
     */
    public void revokeIssuedTokens() {
        this.authVersion++;
    }

    public void rename(String displayName) {
        this.displayName = displayName;
    }

    /**
     * Records a student's own profile details, which resets verification.
     *
     * <p>Bumps auth_version whenever the mssv or its verification state changes. Both travel in the
     * JWT, and ticket booking reads them from the token rather than from the database — so a copy of
     * a token taken while the account was verified could otherwise be replayed to book a ticket
     * under the OLD mssv, for the remaining lifetime of that token, after the student had already
     * changed it to something unverified.
     */
    public void completeProfile(String mssv, String classCode) {
        if (!java.util.Objects.equals(this.mssv, mssv) || this.mssvStatus != MssvStatus.UNVERIFIED) {
            revokeIssuedTokens();
        }
        this.mssv = mssv;
        this.classCode = classCode;
        this.mssvStatus = MssvStatus.UNVERIFIED;
    }

    /** Verification is a claim in the JWT too, so existing tokens must be reissued. */
    public void verifyMssv() {
        if (this.mssvStatus != MssvStatus.VERIFIED) {
            revokeIssuedTokens();
        }
        this.mssvStatus = MssvStatus.VERIFIED;
    }

    @PrePersist
    void prePersist() {
        var now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
        if (status == null) {
            status = UserStatus.ACTIVE;
        }
        if (mssvStatus == null) {
            mssvStatus = MssvStatus.UNVERIFIED;
        }
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getExtSubject() {
        return extSubject;
    }

    public AuthMethod getAuthMethod() {
        return authMethod;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getMssv() {
        return mssv;
    }

    public MssvStatus getMssvStatus() {
        return mssvStatus;
    }

    public String getClassCode() {
        return classCode;
    }

    public UserRole getRole() {
        return role;
    }

    public Club getClub() {
        return club;
    }

    public UserStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
