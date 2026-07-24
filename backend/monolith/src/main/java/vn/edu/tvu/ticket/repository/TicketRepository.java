package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Ticket;

import java.util.Collection;
import java.util.List;
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

    @Query("""
            select t.clubId as clubId, count(t.id) as issued,
                   sum(case when t.status = vn.edu.tvu.ticket.domain.TicketStatus.CHECKED_IN then 1L else 0L end)
                       as checkedIn
            from Ticket t
            where t.clubId in :clubIds
            group by t.clubId
            """)
    List<ClubTicketTotals> totalsByClub(@Param("clubIds") Collection<UUID> clubIds);

    // Native: JPQL has no date truncation. `at time zone 'UTC'` pins the day boundary to UTC so the
    // series does not shift with the server's zone.
    @Query(value = """
            SELECT date(issued_at AT TIME ZONE 'UTC') AS day, count(*) AS total
            FROM tickets
            WHERE club_id = :clubId AND issued_at >= :from
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<DailyCount> issuedPerDay(@Param("clubId") UUID clubId, @Param("from") Instant from);

    // checked_in_at, not issued_at: a ticket issued last week and scanned today belongs to today on
    // this series and to last week on the other one.
    @Query(value = """
            SELECT date(checked_in_at AT TIME ZONE 'UTC') AS day, count(*) AS total
            FROM tickets
            WHERE club_id = :clubId AND checked_in_at IS NOT NULL AND checked_in_at >= :from
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<DailyCount> checkedInPerDay(@Param("clubId") UUID clubId, @Param("from") Instant from);

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
