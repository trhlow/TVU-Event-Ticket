package vn.edu.tvu.auth.repository;

import java.util.UUID;

/** Number of organizers attached to a club. Clubs with none are absent. */
public interface ClubMemberCount {
    UUID getClubId();
    long getTotal();
}
