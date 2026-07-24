package vn.edu.tvu.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByIdAndClubId(UUID id, UUID clubId);
    List<Event> findByClubIdOrderByStartAtDesc(UUID clubId);
    List<Event> findByStatusAndRegistrationOpenAtLessThanEqualAndRegistrationCloseAtGreaterThanEqualOrderByStartAt(
            EventStatus status, Instant openedAt, Instant closesAt);

    @Query("select e.status as status, count(e) as count from Event e group by e.status")
    List<EventStatusCountProjection> countGroupedByStatus();

    @Query("""
            select e.clubId as clubId, e.status as status, count(e.id) as total
            from Event e
            where e.clubId in :clubIds
            group by e.clubId, e.status
            """)
    List<ClubEventCount> countByClubAndStatus(@Param("clubIds") Collection<UUID> clubIds);

    interface EventStatusCountProjection {
        EventStatus getStatus();
        long getCount();
    }
}
