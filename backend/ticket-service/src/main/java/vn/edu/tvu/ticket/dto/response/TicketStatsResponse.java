package vn.edu.tvu.ticket.dto.response;

public record TicketStatsResponse(long ticketsIssued, long checkedIn, Double checkInRate) {
}
