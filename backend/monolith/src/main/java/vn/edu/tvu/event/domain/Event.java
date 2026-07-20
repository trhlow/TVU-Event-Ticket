package vn.edu.tvu.event.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "events")
public class Event {
    @Id
    private UUID id;
    @Column(name = "club_id", nullable = false)
    private UUID clubId;
    @Column(nullable = false, length = 200)
    private String title;
    @Column(columnDefinition = "text")
    private String description;
    @Column(nullable = false)
    private int capacity;
    @Column(name = "reg_open_at", nullable = false)
    private Instant registrationOpenAt;
    @Column(name = "reg_close_at", nullable = false)
    private Instant registrationCloseAt;
    @Column(name = "start_at", nullable = false)
    private Instant startAt;
    @Column(name = "end_at", nullable = false)
    private Instant endAt;
    @Column(nullable = false, length = 300)
    private String location;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EventStatus status;
    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Event() {}

    public static Event draft(UUID clubId, UUID createdBy, String title, String description, int capacity,
                              Instant registrationOpenAt, Instant registrationCloseAt, Instant startAt,
                              Instant endAt, String location) {
        Event event = new Event();
        event.id = UUID.randomUUID();
        event.clubId = clubId;
        event.createdBy = createdBy;
        event.status = EventStatus.DRAFT;
        event.updateDetails(title, description, capacity, registrationOpenAt, registrationCloseAt,
                startAt, endAt, location);
        return event;
    }

    public void updateDetails(String title, String description, int capacity, Instant registrationOpenAt,
                              Instant registrationCloseAt, Instant startAt, Instant endAt, String location) {
        this.title = title;
        this.description = description;
        this.capacity = capacity;
        this.registrationOpenAt = registrationOpenAt;
        this.registrationCloseAt = registrationCloseAt;
        this.startAt = startAt;
        this.endAt = endAt;
        this.location = location;
    }

    public void open() { status = EventStatus.OPEN; }
    public void close() { status = EventStatus.CLOSED; }

    @PrePersist void prePersist() { Instant now = Instant.now(); createdAt = now; updatedAt = now; }
    @PreUpdate void preUpdate() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getClubId() { return clubId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public int getCapacity() { return capacity; }
    public Instant getRegistrationOpenAt() { return registrationOpenAt; }
    public Instant getRegistrationCloseAt() { return registrationCloseAt; }
    public Instant getStartAt() { return startAt; }
    public Instant getEndAt() { return endAt; }
    public String getLocation() { return location; }
    public EventStatus getStatus() { return status; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
