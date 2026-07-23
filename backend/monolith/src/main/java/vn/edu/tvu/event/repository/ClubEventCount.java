package vn.edu.tvu.event.repository;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.UUID;

/** One (club, status) pair with its event count. Absent pairs mean zero. */
public interface ClubEventCount {
    UUID getClubId();
    EventStatus getStatus();
    long getTotal();
}
