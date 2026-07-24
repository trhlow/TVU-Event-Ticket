package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.TicketInventory;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface TicketInventoryRepository extends JpaRepository<TicketInventory, UUID> {

    Optional<TicketInventory> findByEventId(UUID eventId);

    boolean existsByEventId(UUID eventId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from TicketInventory i where i.eventId = :eventId")
    Optional<TicketInventory> findLockedByEventId(@Param("eventId") UUID eventId);

    /**
     * Creates the inventory row only if none exists for the event, without ever raising a constraint
     * violation. This is deliberately a native {@code ON CONFLICT DO NOTHING} rather than the JPA
     * {@code save()} it replaced.
     *
     * <p>The old code did {@code findByEventId} then {@code save()} inside the reservation transaction and
     * caught {@code DataIntegrityViolationException} to recover from a lost race. It could not work:
     * {@code save()} only stages the entity, so the INSERT — and therefore the violation — happened at
     * commit, outside the try/catch. And once PostgreSQL rejects a statement the whole transaction is
     * aborted, so a re-read after the (uncatchable) violation would fail too. The unit test only passed
     * because a Mockito mock threw synchronously from {@code save()}, which real JPA never does.
     *
     * <p>{@code ON CONFLICT (event_id) DO NOTHING} resolves the race in the database: concurrent inserts of
     * the same event block until the winner commits, then become no-ops. No exception is raised, the
     * transaction stays healthy, and a subsequent {@code findByEventId} returns the surviving row.
     * {@code approved_count}, {@code version}, {@code created_at} and {@code updated_at} use their column
     * defaults from V3.
     */
    @Modifying
    @Query(value = """
            INSERT INTO ticket_inventories
                (id, event_id, club_id, total_capacity, event_title, event_start_at, event_end_at, event_location)
            VALUES (:id, :eventId, :clubId, :capacity, :title, :startAt, :endAt, :location)
            ON CONFLICT (event_id) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id, @Param("eventId") UUID eventId, @Param("clubId") UUID clubId,
            @Param("capacity") int capacity, @Param("title") String title,
            @Param("startAt") Instant startAt, @Param("endAt") Instant endAt,
            @Param("location") String location);
}
