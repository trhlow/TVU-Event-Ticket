package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.TicketInventory;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketInventoryRepository extends JpaRepository<TicketInventory, UUID> {

    Optional<TicketInventory> findByEventId(UUID eventId);

    boolean existsByEventId(UUID eventId);
}
