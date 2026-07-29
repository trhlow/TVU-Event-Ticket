package vn.edu.tvu.ticket.mapper;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketStatus;

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
        var checkedInAt = start.plusSeconds(600);
        var ticket = Ticket.issue(reservation);
        ReflectionTestUtils.setField(ticket, "id", ticketId);
        ReflectionTestUtils.setField(ticket, "status", TicketStatus.CHECKED_IN);
        ReflectionTestUtils.setField(ticket, "checkedInAt", checkedInAt);

        var response = new ReservationMapper().toResponse(reservation, ticket);

        assertThat(response.id()).isEqualTo(reservationId);
        assertThat(response.eventId()).isEqualTo(eventId);
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.studentId()).isEqualTo(studentId);
        assertThat(response.status()).isEqualTo(ReservationStatus.PENDING);
        assertThat(response.ticketId()).isEqualTo(ticketId);
        assertThat(response.ticketStatus()).isEqualTo(TicketStatus.CHECKED_IN);
        assertThat(response.checkedInAt()).isEqualTo(checkedInAt);
        assertThat(response.eventTitle()).isEqualTo("Open day");
    }

    @Test
    void mapsMissingTicketToNullTicketFields() {
        var reservation = Reservation.pending(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "student@tvu.edu.vn", "110122001", "Open day",
                Instant.parse("2026-07-20T01:00:00Z"), Instant.parse("2026-07-20T03:00:00Z"), "TVU Hall", "idem");

        var response = new ReservationMapper().toResponse(reservation, null);

        assertThat(response.ticketId()).isNull();
        assertThat(response.ticketStatus()).isNull();
        assertThat(response.checkedInAt()).isNull();
    }
}
