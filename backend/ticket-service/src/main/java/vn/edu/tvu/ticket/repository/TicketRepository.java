package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Ticket;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {

    Optional<Ticket> findByReservationId(UUID reservationId);
}
