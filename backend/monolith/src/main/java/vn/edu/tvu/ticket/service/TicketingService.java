package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.AttendeeResponse;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.ticket.dto.response.PageResponse;
import vn.edu.tvu.ticket.dto.response.TicketResponse;
import vn.edu.tvu.ticket.messaging.AuditEventMessage;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

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
    private final OutboxMessageRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public TicketingService(TicketInventoryRepository inventoryRepository, TicketRepository ticketRepository,
            TicketCounterService counterService, QrPayloadVerifier qrVerifier,
            OutboxMessageRepository outboxRepository, ObjectMapper objectMapper) {
        this.inventoryRepository = inventoryRepository;
        this.ticketRepository = ticketRepository;
        this.counterService = counterService;
        this.qrVerifier = qrVerifier;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse availability(UUID eventId) {
        var inventory = inventoryRepository.findByEventId(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket inventory not found"));
        var calculated = Math.max(0, inventory.getTotalCapacity() - inventory.getApprovedCount());
        counterService.seedIfMissing(eventId, calculated);
        var remaining = counterService.remaining(eventId);
        return new AvailabilityResponse(eventId, inventory.getTotalCapacity(), inventory.getApprovedCount(),
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
        rows.forEach(row -> csv.append(csv(row.ticketId())).append(',')
                .append(csv(row.eventId())).append(',').append(csv(row.studentId())).append(',')
                .append(csv(row.studentEmail())).append(',').append(csv(row.studentMssv())).append(',')
                .append(csv(row.status())).append(',').append(csv(row.issuedAt())).append(',')
                .append(csv(row.checkedInAt())).append("\r\n"));
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
        var message = new AuditEventMessage(actorId, "audit.ticket.check-in", "ticket", ticketId,
                detail, Instant.now().toString());
        try {
            outboxRepository.save(OutboxMessage.pending("audit", ticketId, "audit.ticket.check-in",
                    objectMapper.writeValueAsString(message)));
        } catch (JacksonException ex) {
            throw new IllegalStateException("Failed to serialize audit message", ex);
        }
    }

    private void requireOrganizer(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER || actor.clubId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer club scope is required");
        }
    }

    private String csv(Object value) {
        if (value == null) {
            return "";
        }
        var text = value.toString();
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }
}
