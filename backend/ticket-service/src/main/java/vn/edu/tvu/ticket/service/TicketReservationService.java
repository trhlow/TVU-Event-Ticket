package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.dto.request.CreateReservationRequest;
import vn.edu.tvu.ticket.dto.request.InitializeTicketInventoryRequest;
import vn.edu.tvu.ticket.dto.response.ReservationResponse;
import vn.edu.tvu.ticket.dto.response.TicketInventoryResponse;
import vn.edu.tvu.ticket.messaging.AuditEventMessage;
import vn.edu.tvu.ticket.messaging.ReservationApprovedMessage;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketReservationService {

    private final ReservationRepository reservationRepository;
    private final TicketRepository ticketRepository;
    private final TicketInventoryRepository inventoryRepository;
    private final OutboxMessageRepository outboxRepository;
    private final TicketCounterService ticketCounterService;
    private final ObjectMapper objectMapper;

    public TicketReservationService(
            ReservationRepository reservationRepository,
            TicketRepository ticketRepository,
            TicketInventoryRepository inventoryRepository,
            OutboxMessageRepository outboxRepository,
            TicketCounterService ticketCounterService,
            ObjectMapper objectMapper) {
        this.reservationRepository = reservationRepository;
        this.ticketRepository = ticketRepository;
        this.inventoryRepository = inventoryRepository;
        this.outboxRepository = outboxRepository;
        this.ticketCounterService = ticketCounterService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public TicketInventoryResponse initializeInventory(CurrentUser actor, InitializeTicketInventoryRequest request) {
        requireOrganizerOrAdmin(actor);
        requireClubScope(actor, request.clubId(), "Inventory is outside organizer club scope");
        if (inventoryRepository.existsByEventId(request.eventId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ticket inventory already exists");
        }
        if (!request.eventStartAt().isBefore(request.eventEndAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Event start must be before event end");
        }

        var inventory = TicketInventory.create(
                request.eventId(),
                request.clubId(),
                request.totalCapacity(),
                request.eventTitle().trim(),
                request.eventStartAt(),
                request.eventEndAt(),
                request.eventLocation().trim());
        var saved = inventoryRepository.save(inventory);
        ticketCounterService.initialize(saved.getEventId(), saved.getTotalCapacity());
        return inventoryResponse(saved);
    }

    @Transactional
    public ReservationResponse submit(CurrentUser actor, CreateReservationRequest request, String idempotencyKey) {
        requireRole(actor, UserRole.SINH_VIEN);
        if (actor.mssv() == null || actor.mssv().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Student profile must be completed");
        }
        var normalizedKey = normalizeIdempotencyKey(idempotencyKey);
        var existing = reservationRepository.findByStudentIdAndIdempotencyKey(actor.userId(), normalizedKey);
        if (existing.isPresent()) {
            return responseForMatchingIdempotencyPayload(existing.get(), request);
        }
        if (reservationRepository.existsByEventIdAndStudentId(request.eventId(), actor.userId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Reservation already exists for event");
        }

        var inventory = inventoryRepository.findByEventId(request.eventId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket inventory not found"));
        if (!inventory.getClubId().equals(request.clubId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Event does not belong to requested club");
        }

        var reservation = Reservation.pending(
                request.eventId(),
                request.clubId(),
                actor.userId(),
                actor.email(),
                actor.mssv(),
                normalizedKey);
        return reservationResponse(reservationRepository.save(reservation), null);
    }

    @Transactional
    public ReservationResponse approve(CurrentUser actor, UUID reservationId) {
        requireOrganizerOrAdmin(actor);
        var reservation = reservation(reservationId);
        requireClubScope(actor, reservation.getClubId(), "Reservation is outside organizer club scope");
        if (reservation.getStatus() == ReservationStatus.APPROVED) {
            return reservationResponse(reservation, findTicketId(reservation.getId()).orElse(null));
        }
        if (reservation.getStatus() == ReservationStatus.REJECTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rejected reservation cannot be approved");
        }
        if (!ticketCounterService.tryReserve(reservation.getEventId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets are sold out");
        }

        var releaseCounter = true;
        try {
            var inventory = inventoryRepository.findByEventId(reservation.getEventId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Ticket inventory not found"));
            if (!inventory.getClubId().equals(reservation.getClubId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ticket inventory club mismatch");
            }
            if (!inventory.reserveApprovedSlot()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets are sold out");
            }
            inventoryRepository.saveAndFlush(inventory);

            reservation.approve(actor.userId());
            var ticket = ticketRepository.save(Ticket.issue(reservation));
            recordReservationApproved(reservation, ticket, inventory);
            recordAudit(actor.userId(), "audit.ticket.approve", "reservation", reservation.getId(),
                    "{\"ticketId\":\"" + ticket.getId() + "\"}");
            releaseCounter = false;
            return reservationResponse(reservation, ticket.getId());
        } catch (RuntimeException ex) {
            if (releaseCounter) {
                ticketCounterService.release(reservation.getEventId());
            }
            throw ex;
        }
    }

    @Transactional
    public ReservationResponse reject(CurrentUser actor, UUID reservationId) {
        requireOrganizerOrAdmin(actor);
        var reservation = reservation(reservationId);
        requireClubScope(actor, reservation.getClubId(), "Reservation is outside organizer club scope");
        if (reservation.getStatus() == ReservationStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Approved reservation cannot be rejected");
        }
        if (reservation.getStatus() == ReservationStatus.PENDING) {
            reservation.reject(actor.userId());
            recordAudit(actor.userId(), "audit.ticket.reject", "reservation", reservation.getId(), "{}");
        }
        return reservationResponse(reservation, null);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> listMine(CurrentUser actor) {
        requireRole(actor, UserRole.SINH_VIEN);
        return reservationRepository.findByStudentIdOrderByRequestedAtDesc(actor.userId()).stream()
                .map(reservation -> reservationResponse(reservation, findTicketId(reservation.getId()).orElse(null)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> listPendingForOrganizer(CurrentUser actor) {
        requireOrganizerOrAdmin(actor);
        if (actor.role() == UserRole.SUPER_ADMIN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Club scope is required");
        }
        return reservationRepository.findByClubIdAndStatusOrderByRequestedAtDesc(actor.clubId(),
                        ReservationStatus.PENDING).stream()
                .map(reservation -> reservationResponse(reservation, findTicketId(reservation.getId()).orElse(null)))
                .toList();
    }

    private ReservationResponse responseForMatchingIdempotencyPayload(
            Reservation reservation,
            CreateReservationRequest request) {
        if (!reservation.getEventId().equals(request.eventId()) || !reservation.getClubId().equals(request.clubId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Idempotency key was already used with another payload");
        }
        return reservationResponse(reservation, findTicketId(reservation.getId()).orElse(null));
    }

    private Reservation reservation(UUID reservationId) {
        return reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    private void recordReservationApproved(Reservation reservation, Ticket ticket, TicketInventory inventory) {
        var message = new ReservationApprovedMessage(
                reservation.getId(),
                ticket.getId(),
                reservation.getEventId(),
                reservation.getStudentId(),
                reservation.getStudentEmail(),
                reservation.getStudentMssv(),
                inventory.getEventTitle(),
                inventory.getEventStartAt().toString(),
                inventory.getEventEndAt().toString(),
                inventory.getEventLocation());
        outboxRepository.save(OutboxMessage.pending(
                "reservation",
                reservation.getId(),
                "reservation.approved",
                json(message)));
    }

    private void recordAudit(UUID actorId, String action, String targetType, UUID targetId, String detail) {
        var message = new AuditEventMessage(actorId, action, targetType, targetId, detail, Instant.now().toString());
        outboxRepository.save(OutboxMessage.pending("audit", targetId, action, json(message)));
    }

    private ReservationResponse reservationResponse(Reservation reservation, UUID ticketId) {
        return new ReservationResponse(
                reservation.getId(),
                reservation.getEventId(),
                reservation.getClubId(),
                reservation.getStudentId(),
                reservation.getStudentEmail(),
                reservation.getStudentMssv(),
                reservation.getStatus(),
                reservation.getRequestedAt(),
                reservation.getReviewedAt(),
                reservation.getReviewedBy(),
                ticketId);
    }

    private TicketInventoryResponse inventoryResponse(TicketInventory inventory) {
        return new TicketInventoryResponse(
                inventory.getId(),
                inventory.getEventId(),
                inventory.getClubId(),
                inventory.getTotalCapacity(),
                inventory.getApprovedCount(),
                inventory.getTotalCapacity() - inventory.getApprovedCount(),
                inventory.getEventTitle(),
                inventory.getEventStartAt(),
                inventory.getEventEndAt(),
                inventory.getEventLocation());
    }

    private Optional<UUID> findTicketId(UUID reservationId) {
        var ticket = ticketRepository.findByReservationId(reservationId);
        if (ticket == null) {
            return Optional.empty();
        }
        return ticket.map(Ticket::getId);
    }

    private String normalizeIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key is required");
        }
        var normalized = idempotencyKey.trim();
        if (normalized.length() > 120) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key is too long");
        }
        return normalized;
    }

    private void requireOrganizerOrAdmin(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER && actor.role() != UserRole.SUPER_ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer role is required");
        }
    }

    private void requireRole(CurrentUser actor, UserRole role) {
        if (actor.role() != role) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, role.name() + " role is required");
        }
    }

    private void requireClubScope(CurrentUser actor, UUID clubId, String message) {
        if (actor.role() == UserRole.ORGANIZER && !Objects.equals(actor.clubId(), clubId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize outbox payload", ex);
        }
    }
}
