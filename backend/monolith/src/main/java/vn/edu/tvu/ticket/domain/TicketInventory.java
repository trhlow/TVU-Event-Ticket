package vn.edu.tvu.ticket.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ticket_inventories")
public class TicketInventory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "event_id", nullable = false, unique = true)
    private UUID eventId;

    @Column(name = "club_id", nullable = false)
    private UUID clubId;

    @Column(name = "total_capacity", nullable = false)
    private int totalCapacity;

    @Column(name = "approved_count", nullable = false)
    private int approvedCount;

    @Column(name = "event_title", nullable = false)
    private String eventTitle;

    @Column(name = "event_start_at", nullable = false)
    private Instant eventStartAt;

    @Column(name = "event_end_at", nullable = false)
    private Instant eventEndAt;

    @Column(name = "event_location", nullable = false)
    private String eventLocation;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TicketInventory() {
    }

    private TicketInventory(
            UUID eventId,
            UUID clubId,
            int totalCapacity,
            String eventTitle,
            Instant eventStartAt,
            Instant eventEndAt,
            String eventLocation) {
        this.eventId = eventId;
        this.clubId = clubId;
        this.totalCapacity = totalCapacity;
        this.eventTitle = eventTitle;
        this.eventStartAt = eventStartAt;
        this.eventEndAt = eventEndAt;
        this.eventLocation = eventLocation;
    }

    public static TicketInventory create(
            UUID eventId,
            UUID clubId,
            int totalCapacity,
            String eventTitle,
            Instant eventStartAt,
            Instant eventEndAt,
            String eventLocation) {
        return new TicketInventory(eventId, clubId, totalCapacity, eventTitle, eventStartAt, eventEndAt,
                eventLocation);
    }

    public boolean reserveApprovedSlot() {
        if (approvedCount >= totalCapacity) {
            return false;
        }
        approvedCount++;
        return true;
    }

    @PrePersist
    void prePersist() {
        var now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
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

    public int getTotalCapacity() {
        return totalCapacity;
    }

    public int getApprovedCount() {
        return approvedCount;
    }

    public String getEventTitle() {
        return eventTitle;
    }

    public Instant getEventStartAt() {
        return eventStartAt;
    }

    public Instant getEventEndAt() {
        return eventEndAt;
    }

    public String getEventLocation() {
        return eventLocation;
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
