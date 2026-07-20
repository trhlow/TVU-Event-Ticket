package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.client.EventSnapshot;
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
import vn.edu.tvu.ticket.mapper.ReservationMapper;
import vn.edu.tvu.ticket.mapper.TicketInventoryMapper;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketReservationService {

    private final ReservationRepository reservationRepository;
    private final TicketRepository ticketRepository;
    private final TicketInventoryRepository inventoryRepository;
    private final OutboxMessageRepository outboxRepository;
    private final TicketCounterService ticketCounterService;
    private final EventLookup eventLookup;
    private final ReservationMapper reservationMapper;
    private final TicketInventoryMapper inventoryMapper;
    private final ObjectMapper objectMapper;

    public TicketReservationService(
            ReservationRepository reservationRepository,
            TicketRepository ticketRepository,
            TicketInventoryRepository inventoryRepository,
            OutboxMessageRepository outboxRepository,
            TicketCounterService ticketCounterService,
            EventLookup eventLookup,
            ReservationMapper reservationMapper,
            TicketInventoryMapper inventoryMapper,
            ObjectMapper objectMapper) {
        this.reservationRepository = reservationRepository;
        this.ticketRepository = ticketRepository;
        this.inventoryRepository = inventoryRepository;
        this.outboxRepository = outboxRepository;
        this.ticketCounterService = ticketCounterService;
        this.eventLookup = eventLookup;
        this.reservationMapper = reservationMapper;
        this.inventoryMapper = inventoryMapper;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public TicketInventoryResponse initializeInventory(CurrentUser actor, InitializeTicketInventoryRequest request) {
        requireOrganizerOrAdmin(actor);
        var event = eventLookup.getOpenEvent(request.eventId());
        requireClubScope(actor, event.clubId(), "Inventory is outside organizer club scope");
        if (inventoryRepository.existsByEventId(request.eventId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ticket inventory already exists");
        }

        var inventory = TicketInventory.create(
                event.id(), event.clubId(), event.capacity(), event.title(), event.startAt(), event.endAt(),
                event.location());
        var saved = inventoryRepository.save(inventory);
        ticketCounterService.seedIfMissing(saved.getEventId(), saved.getTotalCapacity());
        return inventoryMapper.toResponse(saved);
    }

    @Transactional
    public ReservationResponse submit(CurrentUser actor, CreateReservationRequest request, String idempotencyKey) {
        requireRole(actor, UserRole.SINH_VIEN);
        if (actor.mssv() == null || actor.mssv().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Student profile must be completed");
        }
        var normalizedKey = normalizeIdempotencyKey(idempotencyKey);
        var existing = reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(
                request.eventId(), actor.userId(), normalizedKey);
        if (existing.isPresent()) {
            return reservationResponse(existing.get(), findTicketId(existing.get().getId()).orElse(null));
        }
        if (reservationRepository.existsByEventIdAndStudentId(request.eventId(), actor.userId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Reservation already exists for event");
        }

        var event = eventLookup.getOpenEvent(request.eventId());
        validateRegistrationWindow(event);
        var inventory = inventoryRepository.findByEventId(event.id())
                .orElseGet(() -> inventoryRepository.save(TicketInventory.create(
                        event.id(), event.clubId(), event.capacity(), event.title(), event.startAt(),
                        event.endAt(), event.location())));
        ticketCounterService.seedIfMissing(event.id(), inventory.getTotalCapacity() - inventory.getApprovedCount());

        var reservation = Reservation.pending(
                event.id(),
                event.clubId(),
                actor.userId(),
                actor.email(),
                actor.mssv(),
                event.title(),
                event.startAt(),
                event.endAt(),
                event.location(),
                normalizedKey);
        return reservationResponse(reservationRepository.save(reservation), null);
    }

    @Transactional
    public ReservationResponse approve(CurrentUser actor, UUID reservationId) {
        requireOrganizerOrAdmin(actor);
        var reservation = lockedReservation(reservationId);
        requireClubScope(actor, reservation.getClubId(), "Reservation is outside organizer club scope");
        if (reservation.getStatus() == ReservationStatus.APPROVED) {
            return reservationResponse(reservation, findTicketId(reservation.getId()).orElse(null));
        }
        if (reservation.getStatus() == ReservationStatus.REJECTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Rejected reservation cannot be approved");
        }
        var inventory = inventoryRepository.findLockedByEventId(reservation.getEventId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket inventory not found"));
        if (!inventory.getClubId().equals(reservation.getClubId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ticket inventory club mismatch");
        }
        ticketCounterService.seedIfMissing(reservation.getEventId(),
                inventory.getTotalCapacity() - inventory.getApprovedCount());
        if (!ticketCounterService.tryReserve(reservation.getEventId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets are sold out");
        }
        compensateCounterOnRollback(reservation.getEventId());
        if (!inventory.reserveApprovedSlot()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets are sold out");
        }
        inventoryRepository.saveAndFlush(inventory);

        reservation.approve(actor.userId());
        var ticket = ticketRepository.save(Ticket.issue(reservation));
        recordReservationApproved(reservation, ticket);
        recordAudit(actor.userId(), "audit.ticket.approve", "reservation", reservation.getId(),
                "{\"ticketId\":\"" + ticket.getId() + "\"}");
        return reservationResponse(reservation, ticket.getId());
    }

    @Transactional
    public ReservationResponse reject(CurrentUser actor, UUID reservationId) {
        requireOrganizerOrAdmin(actor);
        var reservation = lockedReservation(reservationId);
        requireClubScope(actor, reservation.getClubId(), "Reservation is outside organizer club scope");
        if (reservation.getStatus() == ReservationStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Approved reservation cannot be rejected");
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

    private Reservation reservation(UUID reservationId) {
        return reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    private Reservation lockedReservation(UUID reservationId) {
        return reservationRepository.findLockedById(reservationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found"));
    }

    private void recordReservationApproved(Reservation reservation, Ticket ticket) {
        var message = new ReservationApprovedMessage(
                reservation.getId(),
                ticket.getId(),
                reservation.getEventId(),
                reservation.getStudentId(),
                reservation.getStudentEmail(),
                reservation.getStudentMssv(),
                reservation.getEventTitle(),
                reservation.getEventStartAt().toString(),
                reservation.getEventEndAt().toString(),
                reservation.getEventLocation());
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
        return reservationMapper.toResponse(reservation, ticketId);
    }

    private Optional<UUID> findTicketId(UUID reservationId) {
        var ticket = ticketRepository.findByReservationId(reservationId);
        if (ticket == null) {
            return Optional.empty();
        }
        return ticket.map(Ticket::getId);
    }

    private void validateRegistrationWindow(EventSnapshot event) {
        var now = Instant.now();
        if (!"OPEN".equals(event.status()) || now.isBefore(event.registrationOpenAt())
                || now.isAfter(event.registrationCloseAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Event is not open for registration");
        }
    }

    private void compensateCounterOnRollback(UUID eventId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    ticketCounterService.release(eventId);
                }
            }
        });
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
        } catch (JacksonException ex) {
            throw new IllegalStateException("Failed to serialize outbox payload", ex);
        }
    }
}
