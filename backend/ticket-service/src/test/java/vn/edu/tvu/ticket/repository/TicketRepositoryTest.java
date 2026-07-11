package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.OutboxStatus;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.support.AbstractPostgresIntegrationTest;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TicketRepositoryTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private TicketInventoryRepository inventoryRepository;

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private TicketRepository ticketRepository;

    @Autowired
    private OutboxMessageRepository outboxRepository;

    @Test
    void inventoryRepositoryPersistsEventSnapshotAndVersionColumn() {
        var inventory = inventoryRepository.saveAndFlush(inventory(UUID.randomUUID(), UUID.randomUUID(), 2));

        assertThat(inventoryRepository.findByEventId(inventory.getEventId()))
                .isPresent()
                .hasValueSatisfying(found -> {
                    assertThat(found.getClubId()).isEqualTo(inventory.getClubId());
                    assertThat(found.getApprovedCount()).isZero();
                    assertThat(found.getVersion()).isZero();
                });
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reservationsRejectDuplicateStudentForSameEvent() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var studentId = UUID.randomUUID();
        reservationRepository.saveAndFlush(reservation(eventId, clubId, studentId, "idem-1"));

        assertThatThrownBy(() -> reservationRepository.saveAndFlush(reservation(eventId, clubId, studentId,
                "idem-2")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reservationsAllowSameStudentIdempotencyKeyForDifferentEvents() {
        var studentId = UUID.randomUUID();
        var before = reservationRepository.count();
        reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), UUID.randomUUID(), studentId, "idem-1"));

        reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), UUID.randomUUID(), studentId, "idem-1"));

        assertThat(reservationRepository.count()).isEqualTo(before + 2);
    }

    @Test
    void ticketRepositoryFindsIssuedTicketByReservation() {
        var reservation = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "idem-1"));
        reservation.approve(UUID.randomUUID());

        var ticket = ticketRepository.saveAndFlush(Ticket.issue(reservation));

        assertThat(ticketRepository.findByReservationId(reservation.getId()))
                .isPresent()
                .hasValueSatisfying(found -> assertThat(found.getId()).isEqualTo(ticket.getId()));
    }

    @Test
    void outboxRepositoryFindsPendingMessagesInCreatedOrder() {
        var first = outboxRepository.saveAndFlush(OutboxMessage.pending("reservation", UUID.randomUUID(),
                "reservation.approved", "{}"));
        var second = outboxRepository.saveAndFlush(OutboxMessage.pending("audit", UUID.randomUUID(),
                "audit.ticket.approve", "{}"));

        assertThat(outboxRepository.findClaimable(Instant.now().plusSeconds(1)))
                .extracting(OutboxMessage::getId)
                .containsExactly(first.getId(), second.getId());
    }

    private static TicketInventory inventory(UUID eventId, UUID clubId, int capacity) {
        return TicketInventory.create(
                eventId,
                clubId,
                capacity,
                "Demo event",
                Instant.parse("2026-07-02T09:00:00Z"),
                Instant.parse("2026-07-02T11:00:00Z"),
                "TVU Hall");
    }

    private static Reservation reservation(UUID eventId, UUID clubId, UUID studentId, String idempotencyKey) {
        var reservation = Reservation.pending(eventId, clubId, studentId, "student@example.com", "110122001",
                idempotencyKey);
        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.PENDING);
        return reservation;
    }
}
