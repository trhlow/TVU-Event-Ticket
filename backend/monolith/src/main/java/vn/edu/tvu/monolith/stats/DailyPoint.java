package vn.edu.tvu.monolith.stats;

import java.time.LocalDate;

public record DailyPoint(LocalDate date, long ticketsIssued, long checkedIn) {
}
