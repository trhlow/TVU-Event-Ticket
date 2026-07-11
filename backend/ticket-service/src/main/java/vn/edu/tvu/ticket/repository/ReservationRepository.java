package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    Optional<Reservation> findByEventIdAndStudentIdAndIdempotencyKey(
            UUID eventId, UUID studentId, String idempotencyKey);

    boolean existsByEventIdAndStudentId(UUID eventId, UUID studentId);

    List<Reservation> findByStudentIdOrderByRequestedAtDesc(UUID studentId);

    List<Reservation> findByClubIdAndStatusOrderByRequestedAtDesc(UUID clubId, ReservationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.id = :id")
    Optional<Reservation> findLockedById(@Param("id") UUID id);
}
