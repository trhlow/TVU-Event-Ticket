package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Ticket;

import java.util.Optional;
import java.time.Instant;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {

    Optional<Ticket> findByReservationId(UUID reservationId);

    long countByEventId(UUID eventId);

    long countByClubIdAndStatus(UUID clubId, vn.edu.tvu.ticket.domain.TicketStatus status);

    long countByStatus(vn.edu.tvu.ticket.domain.TicketStatus status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Ticket t set t.status = vn.edu.tvu.ticket.domain.TicketStatus.CHECKED_IN,
                t.checkedInAt = :now, t.version = t.version + 1
            where t.id = :ticketId and t.eventId = :eventId and t.clubId = :clubId
                and t.status = vn.edu.tvu.ticket.domain.TicketStatus.VALID
            """)
    int checkIn(@Param("ticketId") UUID ticketId, @Param("eventId") UUID eventId,
            @Param("clubId") UUID clubId, @Param("now") Instant now);

    long countByEventIdAndStatus(UUID eventId, vn.edu.tvu.ticket.domain.TicketStatus status);

    @Query("""
            select t.id as ticketId, t.eventId as eventId, r.studentId as studentId,
                   r.studentEmail as studentEmail, r.studentMssv as studentMssv,
                   t.status as status, t.issuedAt as issuedAt, t.checkedInAt as checkedInAt
            from Ticket t join Reservation r on r.id = t.reservationId
            where t.eventId = :eventId and t.clubId = :clubId
              and (:status is null or t.status = :status)
              and (:keyword is null or lower(r.studentEmail) like :keyword
                   or lower(r.studentMssv) like :keyword)
            """)
    Page<AttendeeProjection> findAttendees(@Param("eventId") UUID eventId, @Param("clubId") UUID clubId,
            @Param("status") vn.edu.tvu.ticket.domain.TicketStatus status, @Param("keyword") String keyword,
            Pageable pageable);

    interface AttendeeProjection {
        UUID getTicketId();
        UUID getEventId();
        UUID getStudentId();
        String getStudentEmail();
        String getStudentMssv();
        vn.edu.tvu.ticket.domain.TicketStatus getStatus();
        Instant getIssuedAt();
        Instant getCheckedInAt();
    }
}
