package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.config.QrSigningProperties;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.shared.audit.AuditRecorder;
import vn.edu.tvu.shared.domain.UserRole;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The QR fallback: a signed payload a student can fetch when the email never arrived.
 *
 * <p>Until this existed the payload was produced in exactly one place — the mail-sending path — and
 * stored nowhere. A student whose email went to spam had no way to check in and neither did anyone
 * else: no endpoint returned it, and check-in accepts nothing but a signed payload.
 *
 * <p>This endpoint hands out a credential that gets a person into an event, so most of what follows
 * is about who is refused rather than who is served. The email path was incidentally protected by
 * needing the student's mailbox; an HTTP route is protected only by the checks written here.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TicketQrServiceTest {

    private static final String SECRET = "ticket-qr-service-test-secret-32-chars";

    @Mock
    private TicketRepository ticketRepository;
    @Mock
    private ReservationRepository reservationRepository;
    @Mock
    private AuditRecorder auditRecorder;

    // The real verifier, deliberately. A test that checked the payload against a hand-written copy
    // of the format would pass while the thing the turnstile runs rejected every code we issued.
    private final QrPayloadVerifier verifier = new QrPayloadVerifier(new QrSigningProperties(SECRET));

    private TicketQrService service() {
        return new TicketQrService(ticketRepository, reservationRepository, auditRecorder,
                new QrSigningProperties(SECRET));
    }

    private final UUID ticketId = UUID.randomUUID();
    private final UUID eventId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID reservationId = UUID.randomUUID();

    private CurrentUser student(UUID id) {
        return new CurrentUser(id, "s@student.tvu", UserRole.SINH_VIEN, null, "110000", true);
    }

    private Ticket ticket(TicketStatus status) {
        var ticket = mock(Ticket.class);
        when(ticket.getId()).thenReturn(ticketId);
        when(ticket.getEventId()).thenReturn(eventId);
        when(ticket.getStudentId()).thenReturn(ownerId);
        when(ticket.getReservationId()).thenReturn(reservationId);
        when(ticket.getStatus()).thenReturn(status);
        return ticket;
    }

    private void givenTicket(TicketStatus status, Instant eventEndAt) {
        // Each mock is fully built before it is handed to another stubbing. Calling ticket()
        // directly inside when(...) starts a second stubbing while the first is still open, and
        // Mockito rejects the pair with an error that names neither.
        var ticket = ticket(status);
        var reservation = mock(Reservation.class);
        when(reservation.getEventEndAt()).thenReturn(eventEndAt);
        when(ticketRepository.findById(ticketId)).thenReturn(Optional.of(ticket));
        when(reservationRepository.findById(reservationId)).thenReturn(Optional.of(reservation));
    }

    @Test
    void theOwnerGetsAPayloadTheCheckInVerifierAccepts() {
        var endsAt = Instant.now().plus(2, ChronoUnit.HOURS);
        givenTicket(TicketStatus.VALID, endsAt);

        var issued = service().issueFor(student(ownerId), ticketId);

        // Crossing the boundary, not asserting on the string's shape: the only property that
        // matters is that the turnstile takes it.
        var verified = verifier.verify(issued.payload());
        assertThat(verified.ticketId()).isEqualTo(ticketId);
        assertThat(verified.eventId()).isEqualTo(eventId);
    }

    @Test
    void theCodeExpiresWhenTheEventEnds_exactlyAsTheEmailedOneDoes() {
        var endsAt = Instant.now().plus(3, ChronoUnit.HOURS);
        givenTicket(TicketStatus.VALID, endsAt);

        var issued = service().issueFor(student(ownerId), ticketId);

        // Second precision: the payload carries epoch seconds, so anything finer cannot survive it.
        assertThat(issued.expiresAt()).isEqualTo(endsAt.truncatedTo(ChronoUnit.SECONDS));
        assertThat(verifier.verify(issued.payload()).expiresAt())
                .isEqualTo(endsAt.truncatedTo(ChronoUnit.SECONDS));
    }

    @Test
    void aTicketBelongingToSomebodyElseIsNotFound() {
        givenTicket(TicketStatus.VALID, Instant.now().plus(2, ChronoUnit.HOURS));

        // 404 and not 403. A 403 confirms the ticket exists, which turns this route into a way to
        // enumerate ticket ids; the answer must be identical to the one for an id that is not real.
        assertThatThrownBy(() -> service().issueFor(student(UUID.randomUUID()), ticketId))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void anOrganizerCannotMintAStudentsCode() {
        givenTicket(TicketStatus.VALID, Instant.now().plus(2, ChronoUnit.HOURS));
        var organizer = new CurrentUser(UUID.randomUUID(), "o@tvu", UserRole.ORGANIZER,
                UUID.randomUUID(), null, false);

        // Ownership, not role. An organizer holding a student's payload can check that student in
        // without them ever being present -- attendance for an empty seat.
        assertThatThrownBy(() -> service().issueFor(organizer, ticketId))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void aTicketThatDoesNotExistIsNotFound() {
        var unknown = UUID.randomUUID();
        when(ticketRepository.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().issueFor(student(ownerId), unknown))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void aCancelledTicketGetsNoCode() {
        givenTicket(TicketStatus.CANCELLED, Instant.now().plus(2, ChronoUnit.HOURS));

        assertThatThrownBy(() -> service().issueFor(student(ownerId), ticketId))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void anAlreadyCheckedInTicketStillReturnsItsCode() {
        givenTicket(TicketStatus.CHECKED_IN, Instant.now().plus(2, ChronoUnit.HOURS));

        // Not an error. The student is looking at a ticket they already used; check-in refuses the
        // second scan on its own, and hiding the code here only makes the page look broken.
        assertThat(service().issueFor(student(ownerId), ticketId).payload()).isNotBlank();
    }

    @Test
    void aFinishedEventStillReturnsItsCode_theFrontEndLabelsIt() {
        var endedAt = Instant.now().minus(1, ChronoUnit.HOURS);
        givenTicket(TicketStatus.VALID, endedAt);

        var issued = service().issueFor(student(ownerId), ticketId);

        assertThat(issued.expiresAt()).isEqualTo(endedAt.truncatedTo(ChronoUnit.SECONDS));
        // And the turnstile must still refuse it -- the endpoint hands back history, not access.
        assertThatThrownBy(() -> verifier.verify(issued.payload()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void issuingACodeIsRecordedInTheAuditLog() {
        givenTicket(TicketStatus.VALID, Instant.now().plus(2, ChronoUnit.HOURS));

        service().issueFor(student(ownerId), ticketId);

        // A credential leaving the system leaves a trace. Without it, "who fetched this code and
        // when" has no answer after the fact.
        verify(auditRecorder).recordAudit(eq(ownerId), eq("TICKET_QR_ISSUED"), eq("TICKET"),
                eq(ticketId), any());
    }

    @Test
    void arefusalIsNotAudited() {
        givenTicket(TicketStatus.VALID, Instant.now().plus(2, ChronoUnit.HOURS));

        assertThatThrownBy(() -> service().issueFor(student(UUID.randomUUID()), ticketId))
                .isInstanceOf(ResponseStatusException.class);

        verify(auditRecorder, never()).recordAudit(any(), any(), any(), any(), any());
    }
}
