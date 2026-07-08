package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.request.CreateReservationRequest;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TicketReservationServiceTest {

    @Mock
    private ReservationRepository reservationRepository;

    @Mock
    private TicketRepository ticketRepository;

    @Mock
    private TicketInventoryRepository inventoryRepository;

    @Mock
    private OutboxMessageRepository outboxRepository;

    @Mock
    private TicketCounterService ticketCounterService;

    private TicketReservationService service;

    @BeforeEach
    void setUp() {
        service = new TicketReservationService(
                reservationRepository,
                ticketRepository,
                inventoryRepository,
                outboxRepository,
                ticketCounterService,
                new ObjectMapper());
    }

    @Test
    void submit_createsPendingReservationWithoutDeductingTicket() {
        var student = student();
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var inventory = persistedInventory(eventId, clubId, 2);
        when(reservationRepository.findByStudentIdAndIdempotencyKey(student.userId(), "idem-1"))
                .thenReturn(Optional.empty());
        when(reservationRepository.existsByEventIdAndStudentId(eventId, student.userId())).thenReturn(false);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(invocation ->
                persistedReservation(invocation.getArgument(0), UUID.randomUUID()));

        var response = service.submit(student, new CreateReservationRequest(eventId, clubId), "idem-1");

        assertThat(response.status()).isEqualTo(ReservationStatus.PENDING);
        assertThat(response.studentMssv()).isEqualTo("110122001");
        verify(ticketCounterService, never()).tryReserve(eventId);
    }

    @Test
    void submit_returnsExistingReservationForSameIdempotencyKeyAndPayload() {
        var student = student();
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var existing = persistedReservation(Reservation.pending(
                eventId,
                clubId,
                student.userId(),
                student.email(),
                student.mssv(),
                "idem-1"), UUID.randomUUID());
        when(reservationRepository.findByStudentIdAndIdempotencyKey(student.userId(), "idem-1"))
                .thenReturn(Optional.of(existing));

        var response = service.submit(student, new CreateReservationRequest(eventId, clubId), "idem-1");

        assertThat(response.id()).isEqualTo(existing.getId());
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void approve_decrementsRedisCreatesTicketAndOutboxMessages() {
        var organizer = organizer(UUID.randomUUID());
        var eventId = UUID.randomUUID();
        var reservation = persistedReservation(Reservation.pending(
                eventId,
                organizer.clubId(),
                UUID.randomUUID(),
                "student@example.com",
                "110122001",
                "idem-1"), UUID.randomUUID());
        var inventory = persistedInventory(eventId, organizer.clubId(), 1);
        when(reservationRepository.findById(reservation.getId())).thenReturn(Optional.of(reservation));
        when(ticketCounterService.tryReserve(eventId)).thenReturn(true);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory));
        when(ticketRepository.save(any(Ticket.class))).thenAnswer(invocation ->
                persistedTicket(invocation.getArgument(0), UUID.randomUUID()));

        var response = service.approve(organizer, reservation.getId());

        assertThat(response.status()).isEqualTo(ReservationStatus.APPROVED);
        assertThat(response.ticketId()).isNotNull();
        assertThat(inventory.getApprovedCount()).isEqualTo(1);
        var outboxCaptor = ArgumentCaptor.forClass(OutboxMessage.class);
        verify(outboxRepository, times(2)).save(outboxCaptor.capture());
        assertThat(outboxCaptor.getAllValues())
                .extracting(OutboxMessage::getRoutingKey)
                .contains("reservation.approved", "audit.ticket.approve");
    }

    @Test
    void approve_keepsReservationPendingWhenSoldOut() {
        var organizer = organizer(UUID.randomUUID());
        var reservation = persistedReservation(Reservation.pending(
                UUID.randomUUID(),
                organizer.clubId(),
                UUID.randomUUID(),
                "student@example.com",
                "110122001",
                "idem-1"), UUID.randomUUID());
        when(reservationRepository.findById(reservation.getId())).thenReturn(Optional.of(reservation));
        when(ticketCounterService.tryReserve(reservation.getEventId())).thenReturn(false);

        assertThatThrownBy(() -> service.approve(organizer, reservation.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Tickets are sold out");

        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.PENDING);
        verify(ticketRepository, never()).save(any());
        verify(outboxRepository, never()).save(any());
    }

    @Test
    void approve_rejectsOrganizerFromAnotherClub() {
        var reservation = persistedReservation(Reservation.pending(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "student@example.com",
                "110122001",
                "idem-1"), UUID.randomUUID());
        when(reservationRepository.findById(reservation.getId())).thenReturn(Optional.of(reservation));

        assertThatThrownBy(() -> service.approve(organizer(UUID.randomUUID()), reservation.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Reservation is outside organizer club scope");
    }

    private static CurrentUser student() {
        return new CurrentUser(
                UUID.randomUUID(),
                "student@example.com",
                UserRole.SINH_VIEN,
                null,
                "110122001");
    }

    private static CurrentUser organizer(UUID clubId) {
        return new CurrentUser(
                UUID.randomUUID(),
                "organizer@example.com",
                UserRole.ORGANIZER,
                clubId,
                null);
    }

    private static TicketInventory persistedInventory(UUID eventId, UUID clubId, int capacity) {
        var inventory = TicketInventory.create(
                eventId,
                clubId,
                capacity,
                "Demo event",
                Instant.parse("2026-07-02T09:00:00Z"),
                Instant.parse("2026-07-02T11:00:00Z"),
                "TVU Hall");
        ReflectionTestUtils.setField(inventory, "id", UUID.randomUUID());
        return inventory;
    }

    private static Reservation persistedReservation(Reservation reservation, UUID id) {
        ReflectionTestUtils.setField(reservation, "id", id);
        return reservation;
    }

    private static Ticket persistedTicket(Ticket ticket, UUID id) {
        ReflectionTestUtils.setField(ticket, "id", id);
        ReflectionTestUtils.setField(ticket, "status", TicketStatus.VALID);
        return ticket;
    }
}
