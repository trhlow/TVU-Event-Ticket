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
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tickets")
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "reservation_id", nullable = false, unique = true)
    private UUID reservationId;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "club_id", nullable = false)
    private UUID clubId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TicketStatus status = TicketStatus.VALID;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected Ticket() {
    }

    private Ticket(UUID reservationId, UUID eventId, UUID clubId, UUID studentId) {
        this.reservationId = reservationId;
        this.eventId = eventId;
        this.clubId = clubId;
        this.studentId = studentId;
    }

    public static Ticket issue(Reservation reservation) {
        return new Ticket(reservation.getId(), reservation.getEventId(), reservation.getClubId(),
                reservation.getStudentId());
    }

    @PrePersist
    void prePersist() {
        if (issuedAt == null) {
            issuedAt = Instant.now();
        }
        if (status == null) {
            status = TicketStatus.VALID;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getReservationId() {
        return reservationId;
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

    public TicketStatus getStatus() {
        return status;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public Instant getCheckedInAt() {
        return checkedInAt;
    }

    public long getVersion() {
        return version;
    }
}
