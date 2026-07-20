package vn.edu.tvu.ticket.dto.response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ClubDashboardResponse(
        UUID clubId,
        long pending,
        long approved,
        long checkedIn,
        Double checkInRate,
        List<DailyRegistrationCount> registrationsByDay) {

    public record DailyRegistrationCount(LocalDate date, long count) {
    }
}
