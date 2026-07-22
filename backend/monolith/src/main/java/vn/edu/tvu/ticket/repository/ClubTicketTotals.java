package vn.edu.tvu.ticket.repository;

import java.util.UUID;

/** Per-club ticket totals. Clubs with no tickets are absent, not zero — the caller supplies zeros. */
public interface ClubTicketTotals {
    UUID getClubId();
    long getIssued();
    long getCheckedIn();
}
