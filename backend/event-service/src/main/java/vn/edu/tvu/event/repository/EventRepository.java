package vn.edu.tvu.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByIdAndClubId(UUID id, UUID clubId);
    List<Event> findByClubIdOrderByStartAtDesc(UUID clubId);
    List<Event> findByStatusAndRegistrationOpenAtLessThanEqualAndRegistrationCloseAtGreaterThanEqualOrderByStartAt(
            EventStatus status, Instant openedAt, Instant closesAt);
}
