package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    Optional<Reservation> findByStudentIdAndIdempotencyKey(UUID studentId, String idempotencyKey);

    boolean existsByEventIdAndStudentId(UUID eventId, UUID studentId);

    List<Reservation> findByStudentIdOrderByRequestedAtDesc(UUID studentId);

    List<Reservation> findByClubIdAndStatusOrderByRequestedAtDesc(UUID clubId, ReservationStatus status);
}
