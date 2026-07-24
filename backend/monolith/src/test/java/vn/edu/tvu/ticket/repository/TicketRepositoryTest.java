package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.domain.OutboxStatus;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.support.AbstractPostgresIntegrationTest;
import vn.edu.tvu.testsupport.ParentRows;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

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

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private org.springframework.transaction.PlatformTransactionManager transactionManager;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

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
        reservation.approve(reviewer());

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

    @Test
    void staleInventoryUpdateIsRejectedByOptimisticLock() {
        var inventory = inventoryRepository.saveAndFlush(inventory(UUID.randomUUID(), UUID.randomUUID(), 2));
        entityManager.detach(inventory);
        var stale = inventoryRepository.findById(inventory.getId()).orElseThrow();
        entityManager.createNativeQuery("update ticket_inventories set version = version + 1 where id = :id")
                .setParameter("id", inventory.getId())
                .executeUpdate();
        stale.reserveApprovedSlot();

        assertThatThrownBy(() -> inventoryRepository.saveAndFlush(stale))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test
    void outboxStateCanOnlyBeUpdatedByLeaseOwner() {
        var now = Instant.now();
        var message = OutboxMessage.pending("audit", UUID.randomUUID(), "audit.ticket.approve", "{}");
        message.markProcessing("worker-a", now, now.plusSeconds(60));
        message = outboxRepository.saveAndFlush(message);

        assertThat(outboxRepository.markSentIfOwned(message.getId(), "worker-b", now)).isZero();
        assertThat(outboxRepository.markSentIfOwned(message.getId(), "worker-a", now)).isOne();
        assertThat(outboxRepository.findById(message.getId()).orElseThrow().getStatus())
                .isEqualTo(OutboxStatus.SENT);
    }

    @Test
    void expiredProcessingLeaseIsClaimableAgain() {
        var now = Instant.now();
        var message = OutboxMessage.pending("audit", UUID.randomUUID(), "audit.ticket.approve", "{}");
        message.markProcessing("dead-worker", now.minusSeconds(120), now.minusSeconds(60));
        message = outboxRepository.saveAndFlush(message);

        assertThat(outboxRepository.findClaimable(now))
                .extracting(OutboxMessage::getId)
                .contains(message.getId());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reservationRepositoryCountsByClubAndStatus() {
        var clubId = UUID.randomUUID();
        var otherClubId = UUID.randomUUID();
        var pending = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-pending"));
        var approved = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-approved"));
        approved.approve(reviewer());
        reservationRepository.saveAndFlush(approved);
        reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), otherClubId, UUID.randomUUID(),
                "idem-other-club"));

        assertThat(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING)).isEqualTo(1);
        assertThat(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED)).isEqualTo(1);
        assertThat(reservationRepository.countByClubIdAndStatus(otherClubId, ReservationStatus.PENDING))
                .isEqualTo(1);
        assertThat(pending.getStatus()).isEqualTo(ReservationStatus.PENDING);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reservationRepositoryGroupsDailyRegistrationsByClubSinceGivenInstant() {
        var clubId = UUID.randomUUID();
        var inWindow = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-in-window"));
        var outOfWindow = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-out-of-window"));
        var otherClub = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "idem-other-club-2"));
        var day = LocalDate.of(2026, 6, 20);
        backdateRequestedAt(inWindow.getId(), day.atStartOfDay(ZoneOffset.UTC).toInstant().plusSeconds(3600));
        backdateRequestedAt(outOfWindow.getId(), day.minusDays(40).atStartOfDay(ZoneOffset.UTC).toInstant());
        backdateRequestedAt(otherClub.getId(), day.atStartOfDay(ZoneOffset.UTC).toInstant());

        var since = day.minusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        var rows = reservationRepository.countDailyRegistrationsByClub(clubId, since);

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().getDay()).isEqualTo(day);
        assertThat(rows.getFirst().getCount()).isEqualTo(1);
    }

    @Test
    void ticketRepositoryCountsAllTicketsByStatusAcrossClubs() {
        var firstReservation = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), "idem-status-1"));
        firstReservation.approve(reviewer());
        reservationRepository.saveAndFlush(firstReservation);
        var firstTicket = ticketRepository.saveAndFlush(Ticket.issue(firstReservation));
        var secondReservation = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), "idem-status-2"));
        secondReservation.approve(reviewer());
        reservationRepository.saveAndFlush(secondReservation);
        ticketRepository.saveAndFlush(Ticket.issue(secondReservation));
        var before = ticketRepository.countByStatus(TicketStatus.VALID);

        assertThat(ticketRepository.countByStatus(TicketStatus.VALID)).isEqualTo(before);
        assertThat(ticketRepository.countByStatus(TicketStatus.CHECKED_IN)).isZero();
        assertThat(firstTicket.getStatus()).isEqualTo(TicketStatus.VALID);
    }

    @Test
    void findAttendeesPagesFiltersAndSortsByStudentFields() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        inventoryRepository.saveAndFlush(inventory(eventId, clubId, 10));
        issueTicket(eventId, clubId, "zoe@example.com", "110122003", "idem-att-1");
        issueTicket(eventId, clubId, "amy@example.com", "110122001", "idem-att-2");
        issueTicket(eventId, clubId, "bob@example.com", "110122002", "idem-att-3");

        var firstPage = ticketRepository.findAttendees(eventId, clubId, null, null,
                PageRequest.of(0, 2, Sort.by(Sort.Direction.ASC, "r.studentEmail")));

        assertThat(firstPage.getTotalElements()).isEqualTo(3);
        assertThat(firstPage.getTotalPages()).isEqualTo(2);
        assertThat(firstPage.getContent()).extracting(
                TicketRepository.AttendeeProjection::getStudentEmail)
                .containsExactly("amy@example.com", "bob@example.com");
    }

    @Test
    void findAttendeesFiltersByKeywordAcrossEmailAndMssv() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        inventoryRepository.saveAndFlush(inventory(eventId, clubId, 10));
        issueTicket(eventId, clubId, "amy@example.com", "110122001", "idem-kw-1");
        issueTicket(eventId, clubId, "bob@example.com", "990000002", "idem-kw-2");

        var byEmail = ticketRepository.findAttendees(eventId, clubId, null, "%amy%",
                PageRequest.of(0, 20, Sort.by("r.studentEmail")));
        var byMssv = ticketRepository.findAttendees(eventId, clubId, null, "%9900000%",
                PageRequest.of(0, 20, Sort.by("r.studentEmail")));

        assertThat(byEmail.getContent()).extracting(
                TicketRepository.AttendeeProjection::getStudentEmail)
                .containsExactly("amy@example.com");
        assertThat(byMssv.getContent()).extracting(
                TicketRepository.AttendeeProjection::getStudentMssv)
                .containsExactly("990000002");
    }

    @Test
    void findAttendeesFiltersByStatusAndExcludesOtherClubs() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        inventoryRepository.saveAndFlush(inventory(eventId, clubId, 10));
        issueTicket(eventId, clubId, "amy@example.com", "110122001", "idem-st-1");

        var checkedIn = ticketRepository.findAttendees(eventId, clubId, TicketStatus.CHECKED_IN, null,
                PageRequest.of(0, 20, Sort.by("r.studentEmail")));
        var valid = ticketRepository.findAttendees(eventId, clubId, TicketStatus.VALID, null,
                PageRequest.of(0, 20, Sort.by("r.studentEmail")));
        var otherClub = ticketRepository.findAttendees(eventId, UUID.randomUUID(), null, null,
                PageRequest.of(0, 20, Sort.by("r.studentEmail")));

        assertThat(checkedIn.getContent()).isEmpty();
        assertThat(valid.getTotalElements()).isEqualTo(1);
        assertThat(otherClub.getContent()).isEmpty();
    }

    private void issueTicket(UUID eventId, UUID clubId, String email, String mssv, String idempotencyKey) {
        ParentRows.event(jdbc, eventId, clubId, 100);
        var reservation = Reservation.pending(eventId, clubId, ParentRows.user(jdbc, UUID.randomUUID()),
                email, mssv, idempotencyKey);
        reservationRepository.saveAndFlush(reservation);
        reservation.approve(reviewer());
        reservationRepository.saveAndFlush(reservation);
        ticketRepository.saveAndFlush(Ticket.issue(reservation));
    }

    /** A real organizer row for {@code reservations.reviewed_by}, which V7 constrains to users(id). */
    private UUID reviewer() {
        return ParentRows.user(jdbc, UUID.randomUUID(), null, "ORGANIZER");
    }

    private void backdateRequestedAt(UUID reservationId, Instant requestedAt) {
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(
                status -> entityManager
                        .createNativeQuery("update reservations set requested_at = :requestedAt where id = :id")
                        .setParameter("requestedAt", requestedAt)
                        .setParameter("id", reservationId)
                        .executeUpdate());
        entityManager.clear();
    }

    private TicketInventory inventory(UUID eventId, UUID clubId, int capacity) {
        ParentRows.event(jdbc, eventId, clubId, capacity);
        return TicketInventory.create(
                eventId,
                clubId,
                capacity,
                "Demo event",
                Instant.parse("2026-07-02T09:00:00Z"),
                Instant.parse("2026-07-02T11:00:00Z"),
                "TVU Hall");
    }

    private Reservation reservation(UUID eventId, UUID clubId, UUID studentId, String idempotencyKey) {
        ParentRows.event(jdbc, eventId, clubId, 100);
        ParentRows.user(jdbc, studentId);
        var reservation = Reservation.pending(eventId, clubId, studentId, "student@example.com", "110122001",
                idempotencyKey);
        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.PENDING);
        return reservation;
    }
}
