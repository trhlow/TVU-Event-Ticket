package vn.edu.tvu.ticket.mapper;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class ReservationMapperTest {

    @Test
    void mapsDomainSnapshotAndTicketId() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        var reservationId = UUID.randomUUID();
        var ticketId = UUID.randomUUID();
        var start = Instant.parse("2026-07-20T01:00:00Z");
        var reservation = Reservation.pending(eventId, clubId, studentId, "student@tvu.edu.vn", "110122001",
                "Open day", start, start.plusSeconds(7200), "TVU Hall", "idem");
        ReflectionTestUtils.setField(reservation, "id", reservationId);
        ReflectionTestUtils.setField(reservation, "requestedAt", start.minusSeconds(3600));

        var response = new ReservationMapper().toResponse(reservation, ticketId);

        assertThat(response.id()).isEqualTo(reservationId);
        assertThat(response.eventId()).isEqualTo(eventId);
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.studentId()).isEqualTo(studentId);
        assertThat(response.status()).isEqualTo(ReservationStatus.PENDING);
        assertThat(response.ticketId()).isEqualTo(ticketId);
        assertThat(response.eventTitle()).isEqualTo("Open day");
    }
}
