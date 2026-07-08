package vn.edu.tvu.ticket.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reservations")
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "club_id", nullable = false)
    private UUID clubId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "student_email", nullable = false, length = 320)
    private String studentEmail;

    @Column(name = "student_mssv", nullable = false, length = 30)
    private String studentMssv;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReservationStatus status = ReservationStatus.PENDING;

    @Column(name = "idempotency_key", nullable = false, length = 120)
    private String idempotencyKey;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    protected Reservation() {
    }

    private Reservation(
            UUID eventId,
            UUID clubId,
            UUID studentId,
            String studentEmail,
            String studentMssv,
            String idempotencyKey) {
        this.eventId = eventId;
        this.clubId = clubId;
        this.studentId = studentId;
        this.studentEmail = studentEmail;
        this.studentMssv = studentMssv;
        this.idempotencyKey = idempotencyKey;
    }

    public static Reservation pending(
            UUID eventId,
            UUID clubId,
            UUID studentId,
            String studentEmail,
            String studentMssv,
            String idempotencyKey) {
        return new Reservation(eventId, clubId, studentId, studentEmail, studentMssv, idempotencyKey);
    }

    public void approve(UUID reviewerId) {
        this.status = ReservationStatus.APPROVED;
        this.reviewedBy = reviewerId;
        this.reviewedAt = Instant.now();
    }

    public void reject(UUID reviewerId) {
        this.status = ReservationStatus.REJECTED;
        this.reviewedBy = reviewerId;
        this.reviewedAt = Instant.now();
    }

    @PrePersist
    void prePersist() {
        if (requestedAt == null) {
            requestedAt = Instant.now();
        }
        if (status == null) {
            status = ReservationStatus.PENDING;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getEventId() {
        return eventId;
    }

    public UUID getClubId() {
        return clubId;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public String getStudentEmail() {
        return studentEmail;
    }

    public String getStudentMssv() {
        return studentMssv;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public UUID getReviewedBy() {
        return reviewedBy;
    }
}
