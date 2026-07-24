package vn.edu.tvu.ticket.repository;

import java.time.LocalDate;

/** One day of a per-club activity series. Days with no activity are absent, not zero. */
public interface DailyCount {
    LocalDate getDay();
    long getTotal();
}
