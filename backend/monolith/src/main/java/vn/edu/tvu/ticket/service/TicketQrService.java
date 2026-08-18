package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.config.QrSigningProperties;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.TicketQrResponse;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.shared.audit.AuditRecorder;
import vn.edu.tvu.shared.qr.QrPayloadFormat;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Re-issues a student's own check-in code.
 *
 * <p>Why this exists: the payload used to be produced in exactly one place, the mail-sending path,
 * and stored nowhere. No endpoint returned it, nothing wrote it to the database, and check-in
 * accepts a signed payload and nothing else. A student whose email went to spam, or who deleted it,
 * could not get into the event and no organizer could let them in either. The delivery ledger says
 * how often mail does not arrive; this says what to do about it.
 *
 * <p>Nothing is stored. The payload is a pure function of the ticket, the event and the secret, so
 * signing it again on demand costs a millisecond and keeps the property that a database dump
 * contains no usable credentials.
 */
@Service
public class TicketQrService {

    private final TicketRepository ticketRepository;
    private final ReservationRepository reservationRepository;
    private final AuditRecorder auditRecorder;
    private final byte[] secret;

    public TicketQrService(TicketRepository ticketRepository, ReservationRepository reservationRepository,
            AuditRecorder auditRecorder, QrSigningProperties properties) {
        this.ticketRepository = ticketRepository;
        this.reservationRepository = reservationRepository;
        this.auditRecorder = auditRecorder;
        this.secret = properties.secret().getBytes(StandardCharsets.UTF_8);
    }

    @Transactional
    public TicketQrResponse issueFor(CurrentUser actor, UUID ticketId) {
        var ticket = ticketRepository.findById(ticketId).orElseThrow(TicketQrService::notFound);

        // Ownership, not role. An organizer is not refused because organizers are untrusted, but
        // because holding a student's payload is enough to check that student in without them
        // being there -- attendance recorded for an empty seat, and no way to tell afterwards.
        //
        // 404 rather than 403, and the same 404 an unknown id gets: a 403 confirms the ticket
        // exists, which makes this route a way to enumerate ticket ids.
        if (!actor.userId().equals(ticket.getStudentId())) {
            throw notFound();
        }
        if (ticket.getStatus() == TicketStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Vé đã bị huỷ");
        }

        // The expiry is the event's end, read from the reservation snapshot -- the same field the
        // emailed code was signed with. Recomputing it from anywhere else would produce a code that
        // disagrees with the one already in the student's inbox.
        var expiresAt = reservationRepository.findById(ticket.getReservationId())
                .orElseThrow(TicketQrService::notFound)
                .getEventEndAt();

        var payload = QrPayloadFormat.sign(ticket.getId(), ticket.getEventId(), expiresAt, secret);

        // Only successes. A refusal is not a credential leaving the system, and auditing the
        // rejected probes would let anyone flood the log by guessing ids.
        auditRecorder.recordAudit(actor.userId(), "TICKET_QR_ISSUED", "TICKET", ticket.getId(),
                "eventId=" + ticket.getEventId());

        // Truncated to seconds because that is all the payload can carry. Returning the untruncated
        // instant would have the response disagree with the code inside it by up to a second, and
        // the front end shows a countdown against this value.
        return new TicketQrResponse(payload, expiresAt.truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy vé");
    }
}
