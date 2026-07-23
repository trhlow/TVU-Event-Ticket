package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.AttendeeResponse;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.shared.web.PageResponse;
import vn.edu.tvu.ticket.dto.response.TicketResponse;
import vn.edu.tvu.shared.audit.AuditRecorder;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.shared.domain.UserRole;


import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketingService {

    private final TicketInventoryRepository inventoryRepository;
    private final TicketRepository ticketRepository;
    private final TicketCounterService counterService;
    private final QrPayloadVerifier qrVerifier;
    private final AuditRecorder auditRecorder;
    private final EventLookup eventLookup;

    public TicketingService(TicketInventoryRepository inventoryRepository, TicketRepository ticketRepository,
            TicketCounterService counterService, QrPayloadVerifier qrVerifier,
            AuditRecorder auditRecorder, EventLookup eventLookup) {
        this.inventoryRepository = inventoryRepository;
        this.ticketRepository = ticketRepository;
        this.counterService = counterService;
        this.qrVerifier = qrVerifier;
        this.auditRecorder = auditRecorder;
        this.eventLookup = eventLookup;
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse availability(UUID eventId) {
        var inventory = inventoryRepository.findByEventId(eventId);
        if (inventory.isEmpty()) {
            // The inventory row is created lazily on the first registration, so a brand-new OPEN event has
            // none yet. Fall back to the event's own capacity — all of it still available — instead of 404.
            // Otherwise the public listing's batch availability call fails the moment it includes an event
            // nobody has registered for. getOpenEvent still raises 404 for an event that is not OPEN, so a
            // genuinely unknown id is still rejected.
            var event = eventLookup.getOpenEvent(eventId);
            return new AvailabilityResponse(eventId, event.capacity(), 0, event.capacity());
        }
        var inv = inventory.get();
        var calculated = Math.max(0, inv.getTotalCapacity() - inv.getApprovedCount());
        counterService.seedIfMissing(eventId, calculated);
        var remaining = counterService.remaining(eventId);
        return new AvailabilityResponse(eventId, inv.getTotalCapacity(), inv.getApprovedCount(),
                remaining < 0 ? calculated : remaining);
    }

    @Transactional(readOnly = true)
    public Map<UUID, AvailabilityResponse> availability(List<UUID> eventIds) {
        if (eventIds.size() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most 100 event IDs are allowed");
        }
        var result = new LinkedHashMap<UUID, AvailabilityResponse>();
        eventIds.stream().distinct().forEach(id -> result.put(id, availability(id)));
        return result;
    }

    @Transactional
    public TicketResponse checkIn(CurrentUser actor, String signedPayload) {
        requireOrganizer(actor);
        var payload = qrVerifier.verify(signedPayload);
        var now = Instant.now();
        if (ticketRepository.checkIn(payload.ticketId(), payload.eventId(), actor.clubId(), now) != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ticket cannot be checked in");
        }
        var ticket = ticketRepository.findById(payload.ticketId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Ticket cannot be checked in"));
        recordAudit(actor.userId(), ticket.getId(), payload.eventId());
        return new TicketResponse(ticket.getId(), ticket.getReservationId(), ticket.getEventId(),
                ticket.getStudentId(), ticket.getStatus(), ticket.getIssuedAt(), ticket.getCheckedInAt());
    }

    public static final Map<String, String> ATTENDEE_SORT_FIELDS = Map.of(
            "issuedAt", "t.issuedAt",
            "checkedInAt", "t.checkedInAt",
            "studentEmail", "r.studentEmail",
            "studentMssv", "r.studentMssv");

    public static final String DEFAULT_ATTENDEE_SORT = "issuedAt,desc";

    @Transactional(readOnly = true)
    public PageResponse<AttendeeResponse> attendees(CurrentUser actor, UUID eventId, TicketStatus status,
            String keyword, Pageable pageable) {
        return PageResponse.from(attendeePage(actor, eventId, status, keyword, pageable));
    }

    @Transactional(readOnly = true)
    public String attendeesCsv(CurrentUser actor, UUID eventId, TicketStatus status, String keyword) {
        var rows = attendeePage(actor, eventId, status, keyword,
                Pageable.unpaged(Sort.by(Sort.Direction.ASC, "r.studentMssv", "r.studentEmail")))
                .getContent();
        var csv = new StringBuilder(
                "ticket_id,event_id,student_id,student_email,student_mssv,status,issued_at,checked_in_at\r\n");
        rows.forEach(row -> csv.append(csvCell(row.ticketId())).append(',')
                .append(csvCell(row.eventId())).append(',').append(csvCell(row.studentId())).append(',')
                .append(csvCell(row.studentEmail())).append(',').append(csvCell(row.studentMssv())).append(',')
                .append(csvCell(row.status())).append(',').append(csvCell(row.issuedAt())).append(',')
                .append(csvCell(row.checkedInAt())).append("\r\n"));
        return csv.toString();
    }

    private Page<AttendeeResponse> attendeePage(CurrentUser actor, UUID eventId, TicketStatus status,
            String keyword, Pageable pageable) {
        requireOrganizer(actor);
        var inventory = inventoryRepository.findByEventId(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event ticketing not found"));
        if (!inventory.getClubId().equals(actor.clubId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Event is outside organizer club scope");
        }
        var normalized = keyword == null || keyword.isBlank()
                ? null
                : "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
        return ticketRepository.findAttendees(eventId, actor.clubId(), status, normalized, pageable)
                .map(row -> new AttendeeResponse(row.getTicketId(), row.getEventId(), row.getStudentId(),
                        row.getStudentEmail(), row.getStudentMssv(), row.getStatus().name(), row.getIssuedAt(),
                        row.getCheckedInAt()));
    }

    private void recordAudit(UUID actorId, UUID ticketId, UUID eventId) {
        var detail = "{\"eventId\":\"" + eventId + "\"}";
        auditRecorder.recordAudit(actorId, "audit.ticket.check-in", "ticket", ticketId, detail);
    }

    private void requireOrganizer(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER || actor.clubId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer club scope is required");
        }
    }

    /**
     * Quoting alone is not enough: spreadsheets evaluate a cell beginning with {@code = + - @} (or a tab
     * or CR) as a formula even when the value is quoted, so an attendee-supplied field such as MSSV could
     * run in the organizer's spreadsheet. Prefixing with an apostrophe forces literal text.
     */
    static String csvCell(Object value) {
        if (value == null) {
            return "";
        }
        var text = value.toString();
        if (!text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }
}
