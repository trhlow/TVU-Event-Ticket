package vn.edu.tvu.ticket.mapper;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.dto.response.ReservationResponse;

import org.springframework.stereotype.Component;

@Component
public class ReservationMapper {

    public ReservationResponse toResponse(Reservation reservation, Ticket ticket) {
        return new ReservationResponse(reservation.getId(), reservation.getEventId(), reservation.getClubId(),
                reservation.getStudentId(), reservation.getStudentEmail(), reservation.getStudentMssv(),
                reservation.getEventTitle(), reservation.getEventStartAt(), reservation.getEventEndAt(),
                reservation.getEventLocation(), reservation.getStatus(), reservation.getRequestedAt(),
                reservation.getReviewedAt(), reservation.getReviewedBy(),
                ticket == null ? null : ticket.getId(),
                ticket == null ? null : ticket.getStatus(),
                ticket == null ? null : ticket.getCheckedInAt());
    }
}
