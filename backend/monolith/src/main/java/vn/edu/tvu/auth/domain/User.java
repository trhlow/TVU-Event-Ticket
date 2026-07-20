package vn.edu.tvu.auth.domain;

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

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "ext_subject", nullable = false, unique = true)
    private String extSubject;

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

    public static User organizer(String extSubject, String email, String displayName, Club club) {
        return new User(extSubject, email, displayName, UserRole.ORGANIZER, club);
    }

    public static User superAdmin(String extSubject, String email, String displayName) {
        return new User(extSubject, email, displayName, UserRole.SUPER_ADMIN, null);
    }

    public void updateIdentity(String extSubject, String email, String displayName) {
        this.extSubject = extSubject;
        this.email = email;
        this.displayName = displayName;
    }

    public void promoteToSuperAdmin() {
        this.role = UserRole.SUPER_ADMIN;
        this.club = null;
    }

    public void lock() {
        this.status = UserStatus.LOCKED;
    }

    public void resetExternalSubject(String extSubject) {
        this.extSubject = extSubject;
    }

    public void completeProfile(String mssv, String classCode) {
        this.mssv = mssv;
        this.classCode = classCode;
        this.mssvStatus = MssvStatus.UNVERIFIED;
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
