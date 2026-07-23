package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.dto.request.CreateReservationRequest;
import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.repository.OutboxMessageRepository;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.domain.OutboxMessage;
import vn.edu.tvu.ticket.messaging.OutboxClaimService;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.testsupport.ParentRows;

import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import vn.edu.tvu.MonolithApplication;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

// This suite exercises the reservation/approval path only; it needs no messaging. Rabbit listener
// auto-startup is disabled so the app does not spawn a listener that reconnects to a non-existent broker,
// and the scheduled outbox worker is off. @DirtiesContext drops the context (Hikari pool, Redis client)
// after the class so its workers do not keep reconnecting to containers stopped by the next test class.
@SpringBootTest(classes = MonolithApplication.class, properties = {
        "spring.task.scheduling.enabled=false",
        "spring.rabbitmq.listener.simple.auto-startup=false"})
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ApprovalConcurrencyIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18.4-alpine");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    @Autowired TicketReservationService service;
    @Autowired ReservationRepository reservationRepository;
    @Autowired TicketRepository ticketRepository;
    @Autowired TicketInventoryRepository inventoryRepository;
    @Autowired OutboxMessageRepository outboxRepository;
    @Autowired TicketCounterService counterService;
    @Autowired TicketingService ticketingService;
    @Autowired OutboxClaimService outboxClaimService;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        outboxRepository.deleteAll();
        ticketRepository.deleteAll();
        reservationRepository.deleteAll();
        inventoryRepository.deleteAll();
    }

    /**
     * The real proof for the inventory race. Eight different students register for a brand-new event at the
     * same moment, each in its own transaction, so all eight reach {@code findOrCreateInventory} with no
     * inventory yet. The old {@code save()}-and-catch could not survive this against a real database — the
     * violation surfaced at commit, outside the catch, and aborted the transaction. With
     * {@code insertIfAbsent}'s {@code ON CONFLICT DO NOTHING} the database serialises the inserts: exactly
     * one row is created, no request fails, and all eight reservations are written.
     */
    @Test
    void concurrentFirstRegistrationsCreateExactlyOneInventory() throws Exception {
        var clubId = ParentRows.club(jdbc, UUID.randomUUID());
        var eventId = ParentRows.event(jdbc, UUID.randomUUID(), clubId, 50);
        var students = new ArrayList<CurrentUser>();
        for (int i = 0; i < 8; i++) {
            students.add(student());
        }

        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = students.stream().<java.util.concurrent.Callable<Boolean>>map(s -> () -> {
                try {
                    service.submit(s, new CreateReservationRequest(eventId, clubId), "idem-" + s.userId());
                    return true;
                } catch (RuntimeException ex) {
                    return false;
                }
            }).toList();
            var succeeded = executor.invokeAll(tasks).stream().filter(future -> {
                try { return future.get(); } catch (Exception ex) { throw new RuntimeException(ex); }
            }).count();
            assertThat(succeeded).isEqualTo(8);
        }

        assertThat(inventoryRepository.findAll().stream().filter(inv -> inv.getEventId().equals(eventId)))
                .hasSize(1);
        assertThat(reservationRepository.findAll().stream().filter(r -> r.getEventId().equals(eventId)))
                .hasSize(8);
    }

    @Test
    void concurrentApprovalsIssueExactlyCapacityTickets() throws Exception {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        createInventory(eventId, clubId, 3);
        var reservationIds = new ArrayList<UUID>();
        for (int i = 0; i < 10; i++) {
            reservationIds.add(createReservation(eventId, clubId, "idem-" + i).getId());
        }

        try (var executor = Executors.newFixedThreadPool(10)) {
            var tasks = reservationIds.stream().<java.util.concurrent.Callable<Boolean>>map(id -> () -> {
                try {
                    service.approve(organizer(clubId), id);
                    return true;
                } catch (ResponseStatusException ex) {
                    return false;
                }
            }).toList();
            assertThat(executor.invokeAll(tasks).stream().filter(future -> {
                try { return future.get(); } catch (Exception ex) { throw new RuntimeException(ex); }
            }).count()).isEqualTo(3);
        }

        assertThat(ticketRepository.count()).isEqualTo(3);
        assertThat(reservationRepository.findAll().stream()
                .filter(r -> r.getStatus() == ReservationStatus.APPROVED)).hasSize(3);
        assertThat(counterService.remaining(eventId)).isZero();
    }

    @Test
    void concurrentApprovalOfSameReservationIssuesOneTicketAndDecrementsOnce() throws Exception {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        createInventory(eventId, clubId, 2);
        var reservationId = createReservation(eventId, clubId, "same").getId();

        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = java.util.List.<java.util.concurrent.Callable<Void>>of(
                    () -> { service.approve(organizer(clubId), reservationId); return null; },
                    () -> { service.approve(organizer(clubId), reservationId); return null; });
            for (var future : executor.invokeAll(tasks)) {
                future.get();
            }
        }

        assertThat(ticketRepository.count()).isOne();
        assertThat(counterService.remaining(eventId)).isEqualTo(1);
    }

    @Test
    void signedQrChecksInOnceAndAttendeeExportIsClubScoped() throws Exception {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        createInventory(eventId, clubId, 1);
        var reservation = createReservation(eventId, clubId, "qr");
        service.approve(organizer(clubId), reservation.getId());
        var ticket = ticketRepository.findByReservationId(reservation.getId()).orElseThrow();
        var qr = signedQr(ticket.getId(), eventId, Instant.now().plusSeconds(3600));

        var checkedIn = ticketingService.checkIn(organizer(clubId), qr);

        assertThat(checkedIn.status().name()).isEqualTo("CHECKED_IN");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> ticketingService.checkIn(organizer(clubId), qr))
                .isInstanceOf(ResponseStatusException.class);
        var attendeesPageable = org.springframework.data.domain.PageRequest.of(0, 20,
                org.springframework.data.domain.Sort.by("t.issuedAt"));
        assertThat(ticketingService.attendees(organizer(clubId), eventId, null, null, attendeesPageable).content())
                .hasSize(1);
        assertThat(ticketingService.attendeesCsv(organizer(clubId), eventId, null, null))
                .contains("student_email", "student@example.com", "CHECKED_IN");
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> ticketingService.attendees(organizer(UUID.randomUUID()), eventId, null, null,
                        attendeesPageable))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("outside organizer club scope");
    }

    @Test
    void concurrentCheckInAcceptsExactlyOneRequestAndWritesOneAudit() throws Exception {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        createInventory(eventId, clubId, 1);
        var reservation = createReservation(eventId, clubId, "concurrent-check-in");
        service.approve(organizer(clubId), reservation.getId());
        var ticket = ticketRepository.findByReservationId(reservation.getId()).orElseThrow();
        var qr = signedQr(ticket.getId(), eventId, Instant.now().plusSeconds(3600));

        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = java.util.List.<java.util.concurrent.Callable<Boolean>>of(
                    () -> tryCheckIn(clubId, qr),
                    () -> tryCheckIn(clubId, qr));
            var successes = 0L;
            for (var future : executor.invokeAll(tasks)) {
                if (future.get()) {
                    successes++;
                }
            }
            assertThat(successes).isOne();
        }

        // The losing thread must leave no trace. Audit is written straight to audit_log inside the
        // check-in transaction now rather than queued to the outbox, so the row count is the assertion —
        // and because it shares that transaction, the rejected check-in's audit row rolls back with it.
        var auditRows = jdbc.queryForObject(
                "select count(*) from audit_log where action = ? and target_id = ?",
                Integer.class, "audit.ticket.check-in", ticket.getId());
        assertThat(auditRows).isOne();
    }

    @Test
    void twoOutboxWorkersNeverClaimTheSameMessage() throws Exception {
        var message = outboxRepository.saveAndFlush(OutboxMessage.pending(
                "audit", UUID.randomUUID(), "audit.ticket.test", "{}"));

        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.List<java.util.concurrent.Callable<java.util.List<OutboxMessage>>> tasks = java.util.List.of(
                    () -> outboxClaimService.claim("worker-a"),
                    () -> outboxClaimService.claim("worker-b"));
            var futures = executor.invokeAll(tasks);
            var claimedIds = new ArrayList<UUID>();
            for (var future : futures) {
                future.get().forEach(claimed -> claimedIds.add(claimed.getId()));
            }
            assertThat(claimedIds).containsExactly(message.getId());
        }
    }

    private void createInventory(UUID eventId, UUID clubId, int capacity) {
        ParentRows.event(jdbc, eventId, clubId, capacity);
        var now = Instant.now();
        inventoryRepository.saveAndFlush(TicketInventory.create(eventId, clubId, capacity, "Event",
                now.plusSeconds(3600), now.plusSeconds(7200), "TVU Hall"));
    }

    private Reservation createReservation(UUID eventId, UUID clubId, String key) {
        ParentRows.event(jdbc, eventId, clubId, 100);
        var now = Instant.now();
        return reservationRepository.saveAndFlush(Reservation.pending(eventId, clubId,
                ParentRows.user(jdbc, UUID.randomUUID()),
                "student@example.com", UUID.randomUUID().toString().substring(0, 10), "Event",
                now.plusSeconds(3600), now.plusSeconds(7200), "TVU Hall", key));
    }

    private CurrentUser organizer(UUID clubId) {
        var id = ParentRows.user(jdbc, UUID.randomUUID(), clubId, "ORGANIZER");
        return new CurrentUser(id, "organizer@example.com", UserRole.ORGANIZER, clubId, null);
    }

    /** A distinct real student. student_id is FK-constrained to users(id) by V7, so the row must exist. */
    private CurrentUser student() {
        var id = ParentRows.user(jdbc, UUID.randomUUID());
        return new CurrentUser(id, "student-" + id + "@example.com", UserRole.SINH_VIEN, null, "110122001");
    }

    private boolean tryCheckIn(UUID clubId, String qr) {
        try {
            ticketingService.checkIn(organizer(clubId), qr);
            return true;
        } catch (ResponseStatusException ex) {
            return false;
        }
    }

    private String signedQr(UUID ticketId, UUID eventId, Instant expiresAt) throws Exception {
        var unsigned = ticketId + ":" + eventId + ":" + expiresAt.getEpochSecond();
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("dev-qr-signing-secret-change-me-1234567890"
                .getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return unsigned + ":" + HexFormat.of().formatHex(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
    }
}
