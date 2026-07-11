package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.TicketInventory;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface TicketInventoryRepository extends JpaRepository<TicketInventory, UUID> {

    Optional<TicketInventory> findByEventId(UUID eventId);

    boolean existsByEventId(UUID eventId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from TicketInventory i where i.eventId = :eventId")
    Optional<TicketInventory> findLockedByEventId(@Param("eventId") UUID eventId);
}
