package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Ticket;

import java.util.Optional;
import java.util.List;
import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {

    Optional<Ticket> findByReservationId(UUID reservationId);

    long countByEventId(UUID eventId);

    long countByClubIdAndStatus(UUID clubId, vn.edu.tvu.ticket.domain.TicketStatus status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Ticket t set t.status = vn.edu.tvu.ticket.domain.TicketStatus.CHECKED_IN,
                t.checkedInAt = :now, t.version = t.version + 1
            where t.id = :ticketId and t.eventId = :eventId and t.clubId = :clubId
                and t.status = vn.edu.tvu.ticket.domain.TicketStatus.VALID
            """)
    int checkIn(@Param("ticketId") UUID ticketId, @Param("eventId") UUID eventId,
            @Param("clubId") UUID clubId, @Param("now") Instant now);

    @Query(value = """
            SELECT t.id AS ticketId, t.event_id AS eventId, r.student_id AS studentId,
                   r.student_email AS studentEmail, r.student_mssv AS studentMssv,
                   t.status AS status, t.issued_at AS issuedAt, t.checked_in_at AS checkedInAt
            FROM tickets t JOIN reservations r ON r.id = t.reservation_id
            WHERE t.event_id = :eventId AND t.club_id = :clubId
            ORDER BY r.student_mssv, r.student_email
            """, nativeQuery = true)
    List<AttendeeProjection> findAttendees(@Param("eventId") UUID eventId, @Param("clubId") UUID clubId);

    interface AttendeeProjection {
        UUID getTicketId();
        UUID getEventId();
        UUID getStudentId();
        String getStudentEmail();
        String getStudentMssv();
        String getStatus();
        Instant getIssuedAt();
        Instant getCheckedInAt();
    }
}
