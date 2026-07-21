package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.client.EventSnapshot;
import vn.edu.tvu.ticket.dto.request.CreateReservationRequest;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;
import vn.edu.tvu.ticket.mapper.ReservationMapper;
import vn.edu.tvu.ticket.mapper.TicketInventoryMapper;

import tools.jackson.databind.ObjectMapper;

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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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

    @Mock
    private EventLookup eventLookup;

    private TicketReservationService service;

    @BeforeEach
    void setUp() {
        service = new TicketReservationService(
                reservationRepository,
                ticketRepository,
                inventoryRepository,
                outboxRepository,
                ticketCounterService,
                eventLookup,
                new ReservationMapper(),
                new TicketInventoryMapper(),
                new ObjectMapper());
    }

    @Test
    void submit_createsPendingReservationWithoutDeductingTicket() {
        var student = student();
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var inventory = persistedInventory(eventId, clubId, 2);
        when(reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(eventId, student.userId(), "idem-1"))
                .thenReturn(Optional.empty());
        when(reservationRepository.existsByEventIdAndStudentId(eventId, student.userId())).thenReturn(false);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory));
        when(eventLookup.getOpenEvent(eventId)).thenReturn(event(eventId, clubId, 2));
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
        when(reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(eventId, student.userId(), "idem-1"))
                .thenReturn(Optional.of(existing));

        var response = service.submit(student, new CreateReservationRequest(eventId, clubId), "idem-1");

        assertThat(response.id()).isEqualTo(existing.getId());
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void submit_rejectsIncompleteStudentProfileBeforeCallingDependencies() {
        var incomplete = new CurrentUser(UUID.randomUUID(), "student@example.com", UserRole.SINH_VIEN,
                null, null);

        assertThatThrownBy(() -> service.submit(incomplete,
                new CreateReservationRequest(UUID.randomUUID()), "idem"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("profile must be completed");

        verify(eventLookup, never()).getOpenEvent(any());
    }

    @Test
    void submit_rejectsClosedAndOutOfWindowEvents() {
        var student = student();
        var closedId = UUID.randomUUID();
        var outsideId = UUID.randomUUID();
        when(reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(closedId, student.userId(), "closed"))
                .thenReturn(Optional.empty());
        when(reservationRepository.existsByEventIdAndStudentId(closedId, student.userId())).thenReturn(false);
        when(eventLookup.getOpenEvent(closedId)).thenReturn(event(closedId, UUID.randomUUID(), 2, "CLOSED",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(60)));
        when(reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(outsideId, student.userId(), "outside"))
                .thenReturn(Optional.empty());
        when(reservationRepository.existsByEventIdAndStudentId(outsideId, student.userId())).thenReturn(false);
        when(eventLookup.getOpenEvent(outsideId)).thenReturn(event(outsideId, UUID.randomUUID(), 2, "OPEN",
                Instant.now().plusSeconds(3600), Instant.now().plusSeconds(7200)));

        assertThatThrownBy(() -> service.submit(student, new CreateReservationRequest(closedId), "closed"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not open for registration");
        assertThatThrownBy(() -> service.submit(student, new CreateReservationRequest(outsideId), "outside"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not open for registration");
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void submit_usesAuthoritativeEventClubAndIgnoresClientClub() {
        var student = student();
        var eventId = UUID.randomUUID();
        var authoritativeClub = UUID.randomUUID();
        when(reservationRepository.findByEventIdAndStudentIdAndIdempotencyKey(eventId, student.userId(), "spoof"))
                .thenReturn(Optional.empty());
        when(reservationRepository.existsByEventIdAndStudentId(eventId, student.userId())).thenReturn(false);
        when(eventLookup.getOpenEvent(eventId)).thenReturn(event(eventId, authoritativeClub, 2));
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.empty());
        when(inventoryRepository.save(any(TicketInventory.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(invocation ->
                persistedReservation(invocation.getArgument(0), UUID.randomUUID()));

        var response = service.submit(student,
                new CreateReservationRequest(eventId, UUID.randomUUID()), "spoof");

        assertThat(response.clubId()).isEqualTo(authoritativeClub);
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
        when(reservationRepository.findLockedById(reservation.getId())).thenReturn(Optional.of(reservation));
        when(ticketCounterService.tryReserve(eventId)).thenReturn(true);
        when(inventoryRepository.findLockedByEventId(eventId)).thenReturn(Optional.of(inventory));
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
        when(reservationRepository.findLockedById(reservation.getId())).thenReturn(Optional.of(reservation));
        when(inventoryRepository.findLockedByEventId(reservation.getEventId()))
                .thenReturn(Optional.of(persistedInventory(reservation.getEventId(), organizer.clubId(), 1)));
        when(ticketCounterService.tryReserve(reservation.getEventId())).thenReturn(false);

        assertThatThrownBy(() -> service.approve(organizer, reservation.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Tickets are sold out");

        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.PENDING);
        verify(ticketRepository, never()).save(any());
        verify(outboxRepository, never()).save(any());
        verify(ticketCounterService, never()).release(any());
    }

    @Test
    void approve_compensatesRedisExactlyOnceAfterTransactionRollback() {
        var organizer = organizer(UUID.randomUUID());
        var eventId = UUID.randomUUID();
        var reservation = persistedReservation(Reservation.pending(eventId, organizer.clubId(), UUID.randomUUID(),
                "student@example.com", "110122001", "idem-rollback"), UUID.randomUUID());
        var inventory = persistedInventory(eventId, organizer.clubId(), 1);
        when(reservationRepository.findLockedById(reservation.getId())).thenReturn(Optional.of(reservation));
        when(inventoryRepository.findLockedByEventId(eventId)).thenReturn(Optional.of(inventory));
        when(ticketCounterService.tryReserve(eventId)).thenReturn(true);
        when(ticketRepository.save(any(Ticket.class))).thenAnswer(invocation ->
                persistedTicket(invocation.getArgument(0), UUID.randomUUID()));

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.approve(organizer, reservation.getId());
            verify(ticketCounterService, never()).release(eventId);
            var synchronizations = TransactionSynchronizationManager.getSynchronizations();
            assertThat(synchronizations).hasSize(1);
            synchronizations.getFirst().afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            verify(ticketCounterService, times(1)).release(eventId);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
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
        when(reservationRepository.findLockedById(reservation.getId())).thenReturn(Optional.of(reservation));

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

    private static EventSnapshot event(UUID eventId, UUID clubId, int capacity) {
        var now = Instant.now();
        return event(eventId, clubId, capacity, "OPEN", now.minusSeconds(60), now.plusSeconds(3600));
    }

    private static EventSnapshot event(UUID eventId, UUID clubId, int capacity, String status,
            Instant registrationOpenAt, Instant registrationCloseAt) {
        var now = Instant.now();
        return new EventSnapshot(eventId, clubId, "Demo event", "Description", capacity,
                registrationOpenAt, registrationCloseAt, registrationCloseAt.plusSeconds(3600),
                registrationCloseAt.plusSeconds(7200),
                "TVU Hall", status, UUID.randomUUID(), now.minusSeconds(3600), now);
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
