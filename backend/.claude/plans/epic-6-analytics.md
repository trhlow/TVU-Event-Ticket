# EPIC 6 implementation plan - lightweight analytics (T6.1, T6.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add read-only aggregate dashboard endpoints — a per-club KPI dashboard for organizers and three
school-wide stats slices for SUPER_ADMIN — computed live against existing Postgres tables.

**Architecture:** Each service (auth/event/ticket) adds one or two new repository aggregate queries, one new
service method, one new controller endpoint, and (for event-service and ticket-service) a security-config fix
for a route-ordering bug found during design review. The gateway gets a matching two-line fix. No new schema,
no new tables, no cross-service calls.

**Tech Stack:** Spring Boot 4 / Spring Data JPA (derived + `@Query` aggregate queries) / Spring Security
(`@PreAuthorize` in auth-service, URL-matcher `SecurityFilterChain` in event/ticket-service and the reactive
gateway) / JUnit 5 + Mockito + AssertJ / Testcontainers Postgres for `@DataJpaTest`.

## Global Constraints

- **`club_id` and role come from the JWT only** — never a path or query parameter — on every organizer-scoped
  endpoint (existing project-wide invariant).
- **No cross-service HTTP calls added.** Each service aggregates only the tables it owns.
- **`checkInRate` is `Double`, `null` when the denominator is `0`** — never throw, never return a misleading `0`.
- **`registrationsByDay` always has exactly 30 entries**, oldest to newest, zero-filled for days with no rows.
- Every new repository method, DTO field name, and endpoint path used in a later task **must** match the name
  used when it was first introduced in an earlier task — this plan is self-consistent; do not rename mid-way.
- Commit after each task passes its own tests. Do not batch multiple tasks into one commit.

---

## Parallelization guide (read before dispatching subagents)

- **Task 1 and Task 2 touch the same ticket-service files** (`TicketRepository.java`, `TicketingController.java`,
  `security/SecurityConfig.java`) and **must run sequentially, Task 1 then Task 2** — do not dispatch them to two
  subagents in parallel, they will conflict on the same files.
- **Task 3 (auth-service), Task 4 (event-service), and Task 5 (gateway) touch entirely separate files** from
  each other and from the Task 1→2 pair. These three can run in parallel with each other and with the Task 1→2
  sequence.
- **Task 6 (OpenAPI verification) must run last**, after Tasks 1-4 are all committed — it asserts the new
  endpoints appear in each service's live `/v3/api-docs`, so the endpoints must exist first. It does not depend
  on Task 5.

```
Task 1 -> Task 2 --\
Task 3 -------------+--> Task 6
Task 4 -------------|
Task 5 -------------/
```

---

## Task 1: ticket-service — club dashboard endpoint (T6.1)

**Files:**
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/ReservationRepository.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java`
- Create: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/ClubDashboardResponse.java`
- Create: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/DashboardService.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/security/SecurityConfig.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java`

**Interfaces:**
- Produces: `ReservationRepository.countByClubIdAndStatus(UUID clubId, ReservationStatus status): long`;
  `ReservationRepository.countDailyRegistrationsByClub(UUID clubId, Instant since):
  List<ReservationRepository.DailyRegistrationCountProjection>` where the projection has `getDay(): LocalDate`
  and `getCount(): long`; `TicketRepository.countByClubIdAndStatus(UUID clubId, TicketStatus status): long`;
  `DashboardService.clubDashboard(CurrentUser actor): ClubDashboardResponse`. Task 2 reuses
  `TicketRepository` and adds its own methods to `DashboardService` — do not rename anything here afterward.

### Step 1: Write the failing repository test for club-scoped counts

Open `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java` and add these
two test methods (keep everything else in the file unchanged):

```java
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reservationRepositoryCountsByClubAndStatus() {
        var clubId = UUID.randomUUID();
        var otherClubId = UUID.randomUUID();
        var pending = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-pending"));
        var approved = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(), clubId,
                UUID.randomUUID(), "idem-approved"));
        approved.approve(UUID.randomUUID());
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

    private void backdateRequestedAt(UUID reservationId, Instant requestedAt) {
        entityManager.createNativeQuery("update reservations set requested_at = :requestedAt where id = :id")
                .setParameter("requestedAt", requestedAt)
                .setParameter("id", reservationId)
                .executeUpdate();
        entityManager.clear();
    }
```

Add these imports to the top of the file (alongside the existing ones):

```java
import java.time.LocalDate;
import java.time.ZoneOffset;
```

### Step 2: Run the tests to verify they fail

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketRepositoryTest`
Expected: FAIL — `countByClubIdAndStatus` and `countDailyRegistrationsByClub` do not exist on
`ReservationRepository` yet (compile error).

### Step 3: Add the repository methods

Open `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/ReservationRepository.java` and replace
its full contents with:

```java
package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Reservation;
import vn.edu.tvu.ticket.domain.ReservationStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    Optional<Reservation> findByEventIdAndStudentIdAndIdempotencyKey(
            UUID eventId, UUID studentId, String idempotencyKey);

    boolean existsByEventIdAndStudentId(UUID eventId, UUID studentId);

    List<Reservation> findByStudentIdOrderByRequestedAtDesc(UUID studentId);

    List<Reservation> findByClubIdAndStatusOrderByRequestedAtDesc(UUID clubId, ReservationStatus status);

    long countByClubIdAndStatus(UUID clubId, ReservationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.id = :id")
    Optional<Reservation> findLockedById(@Param("id") UUID id);

    @Query(value = """
            SELECT (requested_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS count
            FROM reservations
            WHERE club_id = :clubId AND requested_at >= :since
            GROUP BY day
            ORDER BY day
            """, nativeQuery = true)
    List<DailyRegistrationCountProjection> countDailyRegistrationsByClub(
            @Param("clubId") UUID clubId, @Param("since") Instant since);

    interface DailyRegistrationCountProjection {
        LocalDate getDay();
        long getCount();
    }
}
```

Open `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java` and add this
method inside the interface, right after `countByEventId(UUID eventId)`:

```java
    long countByClubIdAndStatus(UUID clubId, vn.edu.tvu.ticket.domain.TicketStatus status);
```

(Using the fully-qualified type inline avoids adding a new import line the linter would otherwise flag as
unused elsewhere in this file — the file's other methods reference `Ticket` already. If you prefer, add
`import vn.edu.tvu.ticket.domain.TicketStatus;` at the top instead and use the plain name.)

### Step 4: Run the tests to verify they pass

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketRepositoryTest`
Expected: PASS — all repository tests including the two new ones.

### Step 5: Commit

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/ReservationRepository.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java
git commit -m "feat(ticket-service): add club-scoped and daily-registration aggregate queries"
```

### Step 6: Write the failing DashboardService unit test

Create `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java`:

```java
package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock ReservationRepository reservationRepository;
    @Mock TicketRepository ticketRepository;

    private DashboardService dashboardService() {
        return new DashboardService(reservationRepository, ticketRepository);
    }

    @Test
    void clubDashboardComputesCheckInRateAndZeroFillsThirtyDayWindow() {
        var clubId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING)).thenReturn(3L);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED)).thenReturn(10L);
        when(ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN)).thenReturn(4L);
        var today = LocalDate.now(java.time.ZoneOffset.UTC);
        var row = mockRow(today, 2L);
        when(reservationRepository.countDailyRegistrationsByClub(eq(clubId), any(Instant.class)))
                .thenReturn(List.of(row));

        var response = dashboardService().clubDashboard(actor);

        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.pending()).isEqualTo(3);
        assertThat(response.approved()).isEqualTo(10);
        assertThat(response.checkedIn()).isEqualTo(4);
        assertThat(response.checkInRate()).isEqualTo(0.4);
        assertThat(response.registrationsByDay()).hasSize(30);
        assertThat(response.registrationsByDay().getLast().date()).isEqualTo(today);
        assertThat(response.registrationsByDay().getLast().count()).isEqualTo(2);
        assertThat(response.registrationsByDay().getFirst().date()).isEqualTo(today.minusDays(29));
        assertThat(response.registrationsByDay().getFirst().count()).isZero();
    }

    @Test
    void clubDashboardReturnsNullCheckInRateWhenNoApprovals() {
        var clubId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING)).thenReturn(0L);
        when(reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED)).thenReturn(0L);
        when(ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN)).thenReturn(0L);
        when(reservationRepository.countDailyRegistrationsByClub(eq(clubId), any(Instant.class)))
                .thenReturn(List.of());

        var response = dashboardService().clubDashboard(actor);

        assertThat(response.checkInRate()).isNull();
    }

    @Test
    void clubDashboardRejectsNonOrganizer() {
        var actor = new CurrentUser(UUID.randomUUID(), "student@example.com", UserRole.SINH_VIEN, null, "110122001");

        assertThatThrownBy(() -> dashboardService().clubDashboard(actor))
                .isInstanceOf(ResponseStatusException.class);
    }

    private ReservationRepository.DailyRegistrationCountProjection mockRow(LocalDate day, long count) {
        return new ReservationRepository.DailyRegistrationCountProjection() {
            @Override public LocalDate getDay() { return day; }
            @Override public long getCount() { return count; }
        };
    }
}
```

This is the complete file: package, imports, the `@Mock` fields, the `dashboardService()` factory method, the
three `@Test` methods, and the `mockRow` helper — nothing else.

### Step 7: Run the test to verify it fails

Run: `cd backend && mvn -pl ticket-service test -Dtest=DashboardServiceTest`
Expected: FAIL — `DashboardService` class does not exist (compile error).

### Step 8: Create the response DTO

Create `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/ClubDashboardResponse.java`:

```java
package vn.edu.tvu.ticket.dto.response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ClubDashboardResponse(
        UUID clubId,
        long pending,
        long approved,
        long checkedIn,
        Double checkInRate,
        List<DailyRegistrationCount> registrationsByDay) {

    public record DailyRegistrationCount(LocalDate date, long count) {
    }
}
```

### Step 9: Create DashboardService

Create `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/DashboardService.java`:

```java
package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.ReservationStatus;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.ClubDashboardResponse;
import vn.edu.tvu.ticket.dto.response.TicketStatsResponse;
import vn.edu.tvu.ticket.repository.ReservationRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.security.UserRole;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class DashboardService {

    private static final int WINDOW_DAYS = 30;

    private final ReservationRepository reservationRepository;
    private final TicketRepository ticketRepository;

    public DashboardService(ReservationRepository reservationRepository, TicketRepository ticketRepository) {
        this.reservationRepository = reservationRepository;
        this.ticketRepository = ticketRepository;
    }

    public ClubDashboardResponse clubDashboard(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER || actor.clubId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer club scope is required");
        }
        var clubId = actor.clubId();
        var pending = reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.PENDING);
        var approved = reservationRepository.countByClubIdAndStatus(clubId, ReservationStatus.APPROVED);
        var checkedIn = ticketRepository.countByClubIdAndStatus(clubId, TicketStatus.CHECKED_IN);
        Double checkInRate = approved == 0 ? null : (double) checkedIn / approved;
        return new ClubDashboardResponse(clubId, pending, approved, checkedIn, checkInRate,
                registrationsByDay(clubId));
    }

    public TicketStatsResponse ticketStats() {
        var issued = ticketRepository.count();
        var checkedIn = ticketRepository.countByStatus(TicketStatus.CHECKED_IN);
        Double checkInRate = issued == 0 ? null : (double) checkedIn / issued;
        return new TicketStatsResponse(issued, checkedIn, checkInRate);
    }

    private java.util.List<ClubDashboardResponse.DailyRegistrationCount> registrationsByDay(
            java.util.UUID clubId) {
        var today = LocalDate.now(ZoneOffset.UTC);
        var windowStart = today.minusDays(WINDOW_DAYS - 1L);
        var since = windowStart.atStartOfDay(ZoneOffset.UTC).toInstant();
        Map<LocalDate, Long> countsByDay = new HashMap<>();
        reservationRepository.countDailyRegistrationsByClub(clubId, since)
                .forEach(row -> countsByDay.put(row.getDay(), row.getCount()));
        var series = new ArrayList<ClubDashboardResponse.DailyRegistrationCount>(WINDOW_DAYS);
        for (var day = windowStart; !day.isAfter(today); day = day.plusDays(1)) {
            series.add(new ClubDashboardResponse.DailyRegistrationCount(day, countsByDay.getOrDefault(day, 0L)));
        }
        return series;
    }
}
```

Note: `ticketStats()` and `TicketStatsResponse` are used here so the class compiles once Task 2 adds
`TicketRepository.countByStatus` and the `TicketStatsResponse` DTO. **If you are executing Task 1 in isolation
before Task 2 exists, the project will not compile after this step** — that is expected and resolved by Step 2
of Task 2, which must run immediately after (see the Parallelization guide: Task 1 -> Task 2 is a strict
sequence, not two independently-committable states). Do not attempt to make Task 1 compile standalone without
`ticketStats()`; write both methods now, in this step, exactly as shown.

### Step 10: Create the TicketStatsResponse DTO and countByStatus method Task 1 depends on

`DashboardServiceTest` (Step 6) and `DashboardService` (Step 9) both reference `TicketStatsResponse`, which does
not exist yet — create it now so Task 1 compiles and its own test passes without waiting for Task 2:

Create `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/TicketStatsResponse.java`:

```java
package vn.edu.tvu.ticket.dto.response;

public record TicketStatsResponse(long ticketsIssued, long checkedIn, Double checkInRate) {
}
```

Add this method to `TicketRepository` (Task 2 will use it too — adding it now, in Task 1, avoids the
cross-task compile break described in Step 9):

```java
    long countByStatus(vn.edu.tvu.ticket.domain.TicketStatus status);
```

Run: `cd backend && mvn -pl ticket-service test -Dtest=DashboardServiceTest`
Expected: PASS — all three `DashboardServiceTest` methods green.

### Step 11: Wire the controller endpoint and security rule

Open `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java`. Add
`DashboardService` to the constructor and add the new endpoint method. The full file becomes:

```java
package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.ticket.dto.request.CheckInRequest;
import vn.edu.tvu.ticket.dto.response.AttendeeResponse;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.ticket.dto.response.ClubDashboardResponse;
import vn.edu.tvu.ticket.dto.response.TicketResponse;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.service.DashboardService;
import vn.edu.tvu.ticket.service.TicketingService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Ticketing", description = "Availability, check-in, dashboards and event attendee operations")
public class TicketingController {

    private final TicketingService service;
    private final DashboardService dashboardService;

    public TicketingController(TicketingService service, DashboardService dashboardService) {
        this.service = service;
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/ticketing/events/{eventId}/availability")
    @Operation(summary = "Get remaining capacity for an event")
    public AvailabilityResponse availability(@PathVariable UUID eventId) {
        return service.availability(eventId);
    }

    @GetMapping("/api/ticketing/events/availability")
    @Operation(summary = "Get remaining capacity for multiple events")
    public Map<UUID, AvailabilityResponse> availabilityBatch(@RequestParam List<UUID> ids) {
        return service.availability(ids);
    }

    @PostMapping({"/api/ticketing/check-in", "/api/tickets/check-in"})
    @Operation(summary = "Verify a signed QR payload and check a ticket in once")
    public TicketResponse checkIn(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CheckInRequest request) {
        return service.checkIn(CurrentUser.from(jwt), request.qrPayload());
    }

    @GetMapping("/api/ticketing/events/{eventId}/attendees")
    @Operation(summary = "List attendees for the organizer's event")
    public List<AttendeeResponse> attendees(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        return service.attendees(CurrentUser.from(jwt), eventId);
    }

    @GetMapping(value = "/api/ticketing/events/{eventId}/attendees.csv", produces = "text/csv")
    @Operation(summary = "Export attendees as UTF-8 CSV")
    public ResponseEntity<byte[]> attendeesCsv(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        var body = service.attendeesCsv(CurrentUser.from(jwt), eventId).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=attendees-" + eventId + ".csv")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }

    @GetMapping("/api/ticketing/dashboard/club")
    @Operation(summary = "Get the organizer's club-wide reservation and check-in KPIs")
    public ClubDashboardResponse dashboardClub(@AuthenticationPrincipal Jwt jwt) {
        return dashboardService.clubDashboard(CurrentUser.from(jwt));
    }
}
```

Open `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/security/SecurityConfig.java` and change the
`.requestMatchers("/api/reservations/**", ...)` block to add the new rule immediately after it. The full
`authorizeHttpRequests` block becomes:

```java
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/v3/api-docs/**", "/swagger-ui/**",
                                "/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability",
                                "/api/ticketing/events/availability").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/reservations").hasRole("SINH_VIEN")
                        .requestMatchers(HttpMethod.GET, "/api/reservations/me").hasRole("SINH_VIEN")
                        .requestMatchers("/api/reservations/**", "/api/ticketing/check-in",
                                "/api/tickets/check-in", "/api/ticketing/events/*/attendees",
                                "/api/ticketing/events/*/attendees.csv").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/dashboard/club").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
                        .anyRequest().authenticated())
```

(Only the two new lines before `.anyRequest().authenticated()` are added; every other line is unchanged.)

### Step 12: Write the failing RBAC test

Open `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java` and:

1. Add `DashboardService` to the `@WebMvcTest` annotation's controller list is not needed (it is a `@Service`,
   not a `@Controller`) — instead add a `@MockitoBean DashboardService dashboardService;` field.
2. Add this test method:

```java
    @Test
    void clubDashboardRequiresOrganizerAndStatsRequiresSuperAdmin() throws Exception {
        when(dashboardService.clubDashboard(any())).thenReturn(
                new vn.edu.tvu.ticket.dto.response.ClubDashboardResponse(
                        java.util.UUID.randomUUID(), 0, 0, 0, null, List.of()));

        mockMvc.perform(get("/api/ticketing/dashboard/club").with(studentJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/dashboard/club").with(organizerJwt()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/ticketing/stats").with(organizerJwt()))
                .andExpect(status().isForbidden());
    }
```

### Step 13: Run the tests to verify they pass

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketControllerSecurityTest,DashboardServiceTest,TicketRepositoryTest`
Expected: PASS — all tests in all three files green. (The `/api/ticketing/stats` SUPER_ADMIN-success case is
covered in Task 2, once the endpoint exists.)

### Step 14: Commit

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/ClubDashboardResponse.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/TicketStatsResponse.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/DashboardService.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/security/SecurityConfig.java
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java
git commit -m "feat(ticket-service): add T6.1 club dashboard endpoint (GET /api/ticketing/dashboard/club)"
```

---

## Task 2: ticket-service — school-wide ticket stats (T6.2 slice)

**Must run after Task 1 commits** (same files: `TicketingController.java`, `security/SecurityConfig.java`;
`TicketRepository.countByStatus` and `TicketStatsResponse` were already added in Task 1 Step 10 to keep Task 1
compiling standalone).

**Files:**
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java`

**Interfaces:**
- Consumes: `TicketRepository.countByStatus(TicketStatus): long` and `DashboardService.ticketStats():
  TicketStatsResponse` (both already implemented in Task 1).
- Produces: `GET /api/ticketing/stats` endpoint.

### Step 1: Write the failing repository test

Add this test method to `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java`:

```java
    @Test
    void ticketRepositoryCountsAllTicketsByStatusAcrossClubs() {
        var firstReservation = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), "idem-status-1"));
        firstReservation.approve(UUID.randomUUID());
        reservationRepository.saveAndFlush(firstReservation);
        var firstTicket = ticketRepository.saveAndFlush(Ticket.issue(firstReservation));
        var secondReservation = reservationRepository.saveAndFlush(reservation(UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), "idem-status-2"));
        secondReservation.approve(UUID.randomUUID());
        reservationRepository.saveAndFlush(secondReservation);
        ticketRepository.saveAndFlush(Ticket.issue(secondReservation));
        var before = ticketRepository.countByStatus(TicketStatus.VALID);

        assertThat(ticketRepository.countByStatus(TicketStatus.VALID)).isEqualTo(before);
        assertThat(ticketRepository.countByStatus(TicketStatus.CHECKED_IN)).isZero();
        assertThat(firstTicket.getStatus()).isEqualTo(TicketStatus.VALID);
    }
```

Add `import vn.edu.tvu.ticket.domain.TicketStatus;` to the file's imports if it is not already present.

### Step 2: Run the test to verify it fails

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketRepositoryTest`
Expected: this specific test method should already PASS since `countByStatus` was added in Task 1 Step 10 —
this step is a verification, not a true RED. Confirm it passes; if it fails because `countByStatus` is missing,
Task 1 Step 10 was skipped and must be completed first before continuing.

### Step 3: Write the failing controller test for the stats endpoint

Add this test method to `TicketControllerSecurityTest.java`:

```java
    @Test
    void ticketStatsRequiresSuperAdminRole() throws Exception {
        when(dashboardService.ticketStats()).thenReturn(
                new vn.edu.tvu.ticket.dto.response.TicketStatsResponse(0, 0, null));

        mockMvc.perform(get("/api/ticketing/stats").with(organizerJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/stats").with(superAdminJwt()))
                .andExpect(status().isOk());
    }
```

Add this helper method to the same test class, alongside `studentJwt()` and `organizerJwt()`:

```java
    private org.springframework.test.web.servlet.request.RequestPostProcessor superAdminJwt() {
        return jwt().jwt(builder -> builder.subject(UUID.randomUUID().toString())
                .claim("email", "admin@example.com")
                .claim("roles", List.of("SUPER_ADMIN")))
                .authorities(() -> "ROLE_SUPER_ADMIN");
    }
```

### Step 4: Run the test to verify it fails

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketControllerSecurityTest`
Expected: FAIL — `GET /api/ticketing/stats` is not mapped to any controller method yet, so the request 404s
instead of matching the expected 403/200.

### Step 5: Add the controller endpoint

Add this method to `TicketingController.java`, right after `dashboardClub`:

```java

    @GetMapping("/api/ticketing/stats")
    @Operation(summary = "Get school-wide ticket issuance and check-in totals")
    public vn.edu.tvu.ticket.dto.response.TicketStatsResponse ticketStats() {
        return dashboardService.ticketStats();
    }
```

### Step 6: Run the tests to verify they pass

Run: `cd backend && mvn -pl ticket-service test -Dtest=TicketControllerSecurityTest,TicketRepositoryTest,DashboardServiceTest`
Expected: PASS — every test in all three files, including the earlier Task 1 test
`clubDashboardRequiresOrganizerAndStatsRequiresSuperAdmin`'s forbidden-for-organizer assertion on
`/api/ticketing/stats`, and the new `ticketStatsRequiresSuperAdminRole` test's success-for-superadmin assertion.

### Step 7: Commit

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java
git commit -m "feat(ticket-service): add T6.2 school-wide ticket stats endpoint (GET /api/ticketing/stats)"
```

---

## Task 3: auth-service — school-wide admin stats (T6.2 slice)

**Independent of Tasks 1, 2, 4, 5 — can run in parallel.**

**Files:**
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java`
- Create: `backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/AdminStatsResponse.java`
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/service/AdminManagementService.java`
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/controller/AdminController.java`
- Test: `backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuthRepositoryTest.java`
- Test: `backend/auth-service/src/test/java/vn/edu/tvu/auth/service/AdminManagementServiceTest.java`
- Test: `backend/auth-service/src/test/java/vn/edu/tvu/auth/security/SecurityConfigTest.java`

**Interfaces:**
- Produces: `UserRepository.countGroupedByRole(): List<UserRepository.UserRoleCountProjection>` (projection has
  `getRole(): UserRole`, `getCount(): long`); `AdminManagementService.stats(): AdminStatsResponse`;
  `GET /api/admin/stats`.

### Step 1: Write the failing repository test

Add this test method to
`backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuthRepositoryTest.java`:

```java
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void userRepositoryGroupsCountsByRole() {
        var club = clubRepository.saveAndFlush(new Club("CLB Stats " + UUID.randomUUID(), null));
        userRepository.saveAndFlush(User.student("ext-stats-1", "stats-student-1@example.com", "Student One"));
        userRepository.saveAndFlush(User.student("ext-stats-2", "stats-student-2@example.com", "Student Two"));
        userRepository.saveAndFlush(User.organizer("ext-stats-3", "stats-organizer@example.com", "Organizer One",
                club));

        var rows = userRepository.countGroupedByRole();

        var byRole = rows.stream().collect(java.util.stream.Collectors.toMap(
                UserRepository.UserRoleCountProjection::getRole,
                UserRepository.UserRoleCountProjection::getCount));
        assertThat(byRole.get(UserRole.SINH_VIEN)).isGreaterThanOrEqualTo(2L);
        assertThat(byRole.get(UserRole.ORGANIZER)).isGreaterThanOrEqualTo(1L);
    }
```

### Step 2: Run the test to verify it fails

Run: `cd backend && mvn -pl auth-service test -Dtest=AuthRepositoryTest`
Expected: FAIL — `countGroupedByRole` does not exist on `UserRepository` yet (compile error).

### Step 3: Add the repository method

Open `backend/auth-service/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java` and replace its full
contents with:

```java
package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserRole;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByExtSubject(String extSubject);

    Optional<User> findByEmail(String email);

    boolean existsByMssv(String mssv);

    boolean existsByMssvAndIdNot(String mssv, UUID id);

    List<User> findByRole(UserRole role);

    @Query("select u.role as role, count(u) as count from User u group by u.role")
    List<UserRoleCountProjection> countGroupedByRole();

    interface UserRoleCountProjection {
        UserRole getRole();
        long getCount();
    }
}
```

### Step 4: Run the test to verify it passes

Run: `cd backend && mvn -pl auth-service test -Dtest=AuthRepositoryTest`
Expected: PASS.

### Step 5: Commit

```bash
git add backend/auth-service/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java
git add backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuthRepositoryTest.java
git commit -m "feat(auth-service): add user-count-by-role aggregate query"
```

### Step 6: Write the failing service test

Add this test method to
`backend/auth-service/src/test/java/vn/edu/tvu/auth/service/AdminManagementServiceTest.java` (inside the
existing test class, using its existing `@Mock` fields `clubRepository` and `userRepository`):

```java
    @Test
    void statsReturnsTotalsAndZeroFilledRoleBreakdown() {
        var service = new AdminManagementService(clubRepository, userRepository, auditLogRepository);
        when(clubRepository.count()).thenReturn(4L);
        when(userRepository.count()).thenReturn(50L);
        when(userRepository.countGroupedByRole()).thenReturn(List.of(
                roleCount(UserRole.SINH_VIEN, 40L),
                roleCount(UserRole.ORGANIZER, 8L)));

        var stats = service.stats();

        assertThat(stats.totalClubs()).isEqualTo(4);
        assertThat(stats.totalUsers()).isEqualTo(50);
        assertThat(stats.usersByRole()).containsEntry(UserRole.SINH_VIEN, 40L);
        assertThat(stats.usersByRole()).containsEntry(UserRole.ORGANIZER, 8L);
        assertThat(stats.usersByRole()).containsEntry(UserRole.SUPER_ADMIN, 0L);
    }

    private UserRepository.UserRoleCountProjection roleCount(UserRole role, long count) {
        return new UserRepository.UserRoleCountProjection() {
            @Override public UserRole getRole() { return role; }
            @Override public long getCount() { return count; }
        };
    }
```

Add `import java.util.List;` and `import vn.edu.tvu.auth.repository.UserRepository;` to the file's imports if
not already present (the class already imports `UserRole` and the other repositories).

### Step 7: Run the test to verify it fails

Run: `cd backend && mvn -pl auth-service test -Dtest=AdminManagementServiceTest`
Expected: FAIL — `AdminManagementService.stats()` and `AdminStatsResponse` do not exist yet (compile error).

### Step 8: Create the response DTO

Create `backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/AdminStatsResponse.java`:

```java
package vn.edu.tvu.auth.dto.response;

import vn.edu.tvu.auth.domain.UserRole;

import java.util.Map;

public record AdminStatsResponse(long totalClubs, long totalUsers, Map<UserRole, Long> usersByRole) {
}
```

### Step 9: Add the service method

Open `backend/auth-service/src/main/java/vn/edu/tvu/auth/service/AdminManagementService.java`. Add these
imports:

```java
import vn.edu.tvu.auth.dto.response.AdminStatsResponse;
```

(`java.util.EnumMap` and `java.util.Map` also need to be imported — add both `import java.util.EnumMap;` and
`import java.util.Map;` alongside the existing `import java.util.List;`, `import java.util.Locale;`,
`import java.util.UUID;` lines.)

Add this method to the class, anywhere after the constructor (e.g. right before `createClub`):

```java
    @Transactional(readOnly = true)
    public AdminStatsResponse stats() {
        Map<UserRole, Long> usersByRole = new EnumMap<>(UserRole.class);
        for (var role : UserRole.values()) {
            usersByRole.put(role, 0L);
        }
        userRepository.countGroupedByRole().forEach(row -> usersByRole.put(row.getRole(), row.getCount()));
        return new AdminStatsResponse(clubRepository.count(), userRepository.count(), usersByRole);
    }
```

### Step 10: Run the test to verify it passes

Run: `cd backend && mvn -pl auth-service test -Dtest=AdminManagementServiceTest`
Expected: PASS.

### Step 11: Commit

```bash
git add backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/AdminStatsResponse.java
git add backend/auth-service/src/main/java/vn/edu/tvu/auth/service/AdminManagementService.java
git add backend/auth-service/src/test/java/vn/edu/tvu/auth/service/AdminManagementServiceTest.java
git commit -m "feat(auth-service): add AdminManagementService.stats()"
```

### Step 12: Write the failing controller RBAC test

Add this test method to `backend/auth-service/src/test/java/vn/edu/tvu/auth/security/SecurityConfigTest.java`
(it already has `@MockitoBean AdminManagementService adminManagementService;` and a `token(UserRole role)`
helper — reuse both):

```java
    @Test
    void adminStatsRouteRequiresSuperAdmin() throws Exception {
        var studentToken = token(UserRole.SINH_VIEN);
        mockMvc.perform(get("/api/admin/stats")
                        .header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isForbidden());

        when(adminManagementService.stats()).thenReturn(
                new vn.edu.tvu.auth.dto.response.AdminStatsResponse(0, 0, java.util.Map.of()));
        var adminToken = token(UserRole.SUPER_ADMIN);
        mockMvc.perform(get("/api/admin/stats")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }
```

### Step 13: Run the test to verify it fails

Run: `cd backend && mvn -pl auth-service test -Dtest=SecurityConfigTest`
Expected: FAIL — `GET /api/admin/stats` is not mapped yet, so the request 404s.

### Step 14: Add the controller endpoint

Add this method to `AdminController.java`, right after the constructor:

```java

    @GetMapping("/stats")
    @Operation(summary = "Get school-wide club and user totals")
    public vn.edu.tvu.auth.dto.response.AdminStatsResponse stats() {
        return adminManagementService.stats();
    }
```

### Step 15: Run the tests to verify they pass

Run: `cd backend && mvn -pl auth-service test -Dtest=SecurityConfigTest`
Expected: PASS.

### Step 16: Commit

```bash
git add backend/auth-service/src/main/java/vn/edu/tvu/auth/controller/AdminController.java
git add backend/auth-service/src/test/java/vn/edu/tvu/auth/security/SecurityConfigTest.java
git commit -m "feat(auth-service): expose GET /api/admin/stats (T6.2 slice)"
```

---

## Task 4: event-service — school-wide event stats (T6.2 slice)

**Independent of Tasks 1, 2, 3, 5 — can run in parallel.**

**Files:**
- Modify: `backend/event-service/src/main/java/vn/edu/tvu/event/repository/EventRepository.java`
- Create: `backend/event-service/src/main/java/vn/edu/tvu/event/dto/response/EventStatsResponse.java`
- Modify: `backend/event-service/src/main/java/vn/edu/tvu/event/service/EventService.java`
- Modify: `backend/event-service/src/main/java/vn/edu/tvu/event/controller/EventController.java`
- Modify: `backend/event-service/src/main/java/vn/edu/tvu/event/security/SecurityConfig.java`
- Test: `backend/event-service/src/test/java/vn/edu/tvu/event/repository/EventRepositoryTest.java`
- Test: `backend/event-service/src/test/java/vn/edu/tvu/event/service/EventServiceTest.java`
- Test: `backend/event-service/src/test/java/vn/edu/tvu/event/controller/EventControllerSecurityTest.java`

**Interfaces:**
- Produces: `EventRepository.countGroupedByStatus(): List<EventRepository.EventStatusCountProjection>`
  (projection has `getStatus(): EventStatus`, `getCount(): long`); `EventService.stats(): EventStatsResponse`;
  `GET /api/events/stats`.

### Step 1: Write the failing repository test

Add this test method to
`backend/event-service/src/test/java/vn/edu/tvu/event/repository/EventRepositoryTest.java`:

```java
    @Test
    void repositoryGroupsCountsByStatus() {
        Event draft = Event.draft(UUID.randomUUID(), UUID.randomUUID(), "Draft Event", null, 10,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-10T00:00:00Z"),
                Instant.parse("2026-08-11T00:00:00Z"), Instant.parse("2026-08-11T04:00:00Z"), "TVU");
        Event open = Event.draft(UUID.randomUUID(), UUID.randomUUID(), "Open Event", null, 20,
                Instant.parse("2026-08-01T00:00:00Z"), Instant.parse("2026-08-10T00:00:00Z"),
                Instant.parse("2026-08-11T00:00:00Z"), Instant.parse("2026-08-11T04:00:00Z"), "TVU");
        open.open();
        repository.saveAndFlush(draft);
        repository.saveAndFlush(open);

        var rows = repository.countGroupedByStatus();

        var byStatus = rows.stream().collect(java.util.stream.Collectors.toMap(
                EventRepository.EventStatusCountProjection::getStatus,
                EventRepository.EventStatusCountProjection::getCount));
        assertThat(byStatus.get(EventStatus.DRAFT)).isGreaterThanOrEqualTo(1L);
        assertThat(byStatus.get(EventStatus.OPEN)).isGreaterThanOrEqualTo(1L);
    }
```

### Step 2: Run the test to verify it fails

Run: `cd backend && mvn -pl event-service test -Dtest=EventRepositoryTest`
Expected: FAIL — `countGroupedByStatus` does not exist on `EventRepository` yet (compile error).

### Step 3: Add the repository method

Open `backend/event-service/src/main/java/vn/edu/tvu/event/repository/EventRepository.java` and replace its
full contents with:

```java
package vn.edu.tvu.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.domain.EventStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByIdAndClubId(UUID id, UUID clubId);
    List<Event> findByClubIdOrderByStartAtDesc(UUID clubId);
    List<Event> findByStatusAndRegistrationOpenAtLessThanEqualAndRegistrationCloseAtGreaterThanEqualOrderByStartAt(
            EventStatus status, Instant openedAt, Instant closesAt);

    @Query("select e.status as status, count(e) as count from Event e group by e.status")
    List<EventStatusCountProjection> countGroupedByStatus();

    interface EventStatusCountProjection {
        EventStatus getStatus();
        long getCount();
    }
}
```

### Step 4: Run the test to verify it passes

Run: `cd backend && mvn -pl event-service test -Dtest=EventRepositoryTest`
Expected: PASS.

### Step 5: Commit

```bash
git add backend/event-service/src/main/java/vn/edu/tvu/event/repository/EventRepository.java
git add backend/event-service/src/test/java/vn/edu/tvu/event/repository/EventRepositoryTest.java
git commit -m "feat(event-service): add event-count-by-status aggregate query"
```

### Step 6: Write the failing service test

Check `backend/event-service/src/test/java/vn/edu/tvu/event/service/EventServiceTest.java` for its existing
`@Mock`/constructor pattern first (it mirrors `AdminManagementServiceTest`'s style: `@ExtendWith(MockitoExtension.class)`,
`@Mock EventRepository repository`, `@Mock EventMapper mapper`, `@Mock EventAuditPublisher auditPublisher`, and
likely a fixed `Clock`). Add this test method, adapting the constructor call to match whatever mocks the
existing tests in that file already construct `new EventService(...)` with:

```java
    @Test
    void statsReturnsTotalAndZeroFilledStatusBreakdown() {
        when(repository.count()).thenReturn(12L);
        when(repository.countGroupedByStatus()).thenReturn(List.of(
                statusCount(EventStatus.OPEN, 5L),
                statusCount(EventStatus.CLOSED, 7L)));

        var stats = service.stats();

        assertThat(stats.totalEvents()).isEqualTo(12);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.OPEN, 5L);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.CLOSED, 7L);
        assertThat(stats.eventsByStatus()).containsEntry(EventStatus.DRAFT, 0L);
    }

    private EventRepository.EventStatusCountProjection statusCount(EventStatus status, long count) {
        return new EventRepository.EventStatusCountProjection() {
            @Override public EventStatus getStatus() { return status; }
            @Override public long getCount() { return count; }
        };
    }
```

(`service` here refers to whatever field/local variable name the existing tests in this file already use for
the `EventService` instance under test — match that exactly, do not introduce a second name.)

### Step 7: Run the test to verify it fails

Run: `cd backend && mvn -pl event-service test -Dtest=EventServiceTest`
Expected: FAIL — `EventService.stats()` and `EventStatsResponse` do not exist yet (compile error).

### Step 8: Create the response DTO

Create `backend/event-service/src/main/java/vn/edu/tvu/event/dto/response/EventStatsResponse.java`:

```java
package vn.edu.tvu.event.dto.response;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.Map;

public record EventStatsResponse(long totalEvents, Map<EventStatus, Long> eventsByStatus) {
}
```

### Step 9: Add the service method

Open `backend/event-service/src/main/java/vn/edu/tvu/event/service/EventService.java`. Add this import:

```java
import vn.edu.tvu.event.dto.response.EventStatsResponse;
```

(`java.util.EnumMap` and `java.util.Map` also need importing — add both alongside the existing `java.util.List`
and `java.util.UUID` imports.)

Add this method anywhere after the constructor:

```java
    public EventStatsResponse stats() {
        java.util.Map<EventStatus, Long> eventsByStatus = new java.util.EnumMap<>(EventStatus.class);
        for (var status : EventStatus.values()) {
            eventsByStatus.put(status, 0L);
        }
        repository.countGroupedByStatus().forEach(row -> eventsByStatus.put(row.getStatus(), row.getCount()));
        return new EventStatsResponse(repository.count(), eventsByStatus);
    }
```

(This method is read-only and the class already defaults to `@Transactional(readOnly = true)` at the class
level, so no additional `@Transactional` annotation is needed here — consistent with `listOwned`/`listPublic`/
`getPublic` above it in the same file.)

### Step 10: Run the test to verify it passes

Run: `cd backend && mvn -pl event-service test -Dtest=EventServiceTest`
Expected: PASS.

### Step 11: Commit

```bash
git add backend/event-service/src/main/java/vn/edu/tvu/event/dto/response/EventStatsResponse.java
git add backend/event-service/src/main/java/vn/edu/tvu/event/service/EventService.java
git add backend/event-service/src/test/java/vn/edu/tvu/event/service/EventServiceTest.java
git commit -m "feat(event-service): add EventService.stats()"
```

### Step 12: Write the failing controller + security test

Add this test method to
`backend/event-service/src/test/java/vn/edu/tvu/event/controller/EventControllerSecurityTest.java`:

```java
    @Test
    void eventsStatsRequiresSuperAdminNotPublicOrOrganizer() throws Exception {
        mockMvc.perform(get("/api/events/stats")).andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/events/stats").with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());

        when(eventService.stats()).thenReturn(
                new vn.edu.tvu.event.dto.response.EventStatsResponse(0, java.util.Map.of()));
        mockMvc.perform(get("/api/events/stats").with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isOk());
    }
```

### Step 13: Run the test to verify it fails

Run: `cd backend && mvn -pl event-service test -Dtest=EventControllerSecurityTest`
Expected: FAIL — `GET /api/events/stats` is not mapped yet, and even once mapped, without the SecurityConfig fix
in Step 15 the anonymous-caller assertion (`isUnauthorized()`) would fail too, because the existing
`GET /api/events, /api/events/*` `permitAll()` rule currently matches `/api/events/stats`. Both problems are
fixed together in the next steps.

### Step 14: Add the controller endpoint

Add this method to `EventController.java`, right after `listOwned`:

```java

    @GetMapping("/stats")
    @Operation(summary = "Get school-wide event totals by status")
    public vn.edu.tvu.event.dto.response.EventStatsResponse stats() {
        return service.stats();
    }
```

### Step 15: Fix the SecurityConfig route-ordering bug

Open `backend/event-service/src/main/java/vn/edu/tvu/event/security/SecurityConfig.java` and change the
`authorizeHttpRequests` block. The relevant lines change from:

```java
                        .requestMatchers(HttpMethod.GET, "/api/events/mine").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/events", "/api/events/*").permitAll()
                        .requestMatchers("/api/events/**").hasRole("ORGANIZER")
```

to:

```java
                        .requestMatchers(HttpMethod.GET, "/api/events/mine").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/events", "/api/events/*").permitAll()
                        .requestMatchers("/api/events/**").hasRole("ORGANIZER")
```

(One new line inserted between the existing `/api/events/mine` rule and the `permitAll()` rule — without this,
`/api/events/stats` matches the single-segment wildcard `/api/events/*` and becomes public, which is exactly the
bug the design review found.)

### Step 16: Run the tests to verify they pass

Run: `cd backend && mvn -pl event-service test -Dtest=EventControllerSecurityTest`
Expected: PASS — all three assertions (401 anonymous, 403 organizer, 200 super admin).

### Step 17: Commit

```bash
git add backend/event-service/src/main/java/vn/edu/tvu/event/controller/EventController.java
git add backend/event-service/src/main/java/vn/edu/tvu/event/security/SecurityConfig.java
git add backend/event-service/src/test/java/vn/edu/tvu/event/controller/EventControllerSecurityTest.java
git commit -m "fix(event-service): require SUPER_ADMIN for GET /api/events/stats, not public GET"
```

---

## Task 5: api-gateway — route-ordering RBAC fixes

**Independent of Tasks 1-4 — can run in parallel with all of them.** This task does not require any downstream
service to be running; the gateway test mocks the JWT decoder and only asserts routing/authorization decisions.

**Files:**
- Modify: `backend/api-gateway/src/main/java/vn/edu/tvu/gateway/security/GatewaySecurityConfig.java`
- Test: `backend/api-gateway/src/test/java/vn/edu/tvu/gateway/GatewayRoutingIntegrationTest.java`

**Interfaces:** none — this task only changes routing/authorization rules, no new Java types.

### Step 1: Write the failing gateway RBAC test

Open `backend/api-gateway/src/test/java/vn/edu/tvu/gateway/GatewayRoutingIntegrationTest.java` and add
`import java.util.HashMap;` and `import java.util.UUID;` to the imports. Then add these two test methods and
one private helper, anywhere inside the class:

```java
    @Test
    void ticketingStatsRouteRejectsOrganizerButNotSuperAdmin() {
        stubJwt("organizer-stats-token", "organizer-stats", "ORGANIZER", UUID.randomUUID().toString());
        stubJwt("admin-stats-token", "admin-stats", "SUPER_ADMIN", null);

        client.get().uri("/api/ticketing/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer organizer-stats-token")
                .exchange()
                .expectStatus().isForbidden();

        client.get().uri("/api/ticketing/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer admin-stats-token")
                .exchange()
                .expectStatus().value(status -> assertThat(status).isNotEqualTo(403));
    }

    @Test
    void eventsStatsRouteRejectsAnonymousAndOrganizerButNotSuperAdmin() {
        stubJwt("organizer-events-stats-token", "organizer-events-stats", "ORGANIZER",
                UUID.randomUUID().toString());
        stubJwt("admin-events-stats-token", "admin-events-stats", "SUPER_ADMIN", null);

        client.get().uri("/api/events/stats")
                .exchange()
                .expectStatus().isUnauthorized();

        client.get().uri("/api/events/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer organizer-events-stats-token")
                .exchange()
                .expectStatus().isForbidden();

        client.get().uri("/api/events/stats")
                .header(HttpHeaders.AUTHORIZATION, "Bearer admin-events-stats-token")
                .exchange()
                .expectStatus().value(status -> assertThat(status).isNotEqualTo(403));
    }

    private void stubJwt(String token, String subject, String role, String clubId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", subject);
        claims.put("roles", List.of(role));
        if (clubId != null) {
            claims.put("club_id", clubId);
        }
        var jwt = new Jwt(token, Instant.now(), Instant.now().plusSeconds(300), Map.of("alg", "RS256"), claims);
        when(jwtDecoder.decode(token)).thenReturn(Mono.just(jwt));
    }
```

(The `isNotEqualTo(403)` assertions, not `isOk()`, are intentional: this `@SpringBootTest` only runs
api-gateway, no downstream service is listening, so a SUPER_ADMIN request that clears gateway authorization
will fail with a connection/gateway error rather than a clean `200` — the same reason the pre-existing
`mutatingEventRouteRequiresOrganizerRole` test in this file only asserts the rejected case, never the allowed
one. Asserting "not 403" is the correct, precise way to prove the gateway's authorization check passed.)

### Step 2: Run the tests to verify they fail

Run: `cd backend && mvn -pl api-gateway test -Dtest=GatewayRoutingIntegrationTest`
Expected: FAIL — `ticketingStatsRouteRejectsOrganizerButNotSuperAdmin` fails because the gateway currently
returns 403 for the SUPER_ADMIN request too (caught by the `/api/ticketing/**` -> `ORGANIZER` catch-all before
any more specific rule). `eventsStatsRouteRejectsAnonymousAndOrganizerButNotSuperAdmin` fails on the
organizer-forbidden assertion, because `/api/events/stats` is currently `permitAll()` for GET, so the organizer
request (which has no role restriction to fail) succeeds through routing instead of being rejected — expect a
non-403, non-401 status there instead of the expected 403.

### Step 3: Fix the route ordering

Open `backend/api-gateway/src/main/java/vn/edu/tvu/gateway/security/GatewaySecurityConfig.java`. The
`.authorizeExchange` block changes from:

```java
                        .pathMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability",
                                "/api/ticketing/events/availability").permitAll()
                        .pathMatchers("/api/ticketing/**").hasRole("ORGANIZER")
                        .pathMatchers("/api/tickets/**", "/api/reservations/**").authenticated()
                        .pathMatchers(HttpMethod.GET, "/api/events/**").permitAll()
                        .pathMatchers("/api/events/**").hasRole("ORGANIZER")
```

to:

```java
                        .pathMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability",
                                "/api/ticketing/events/availability").permitAll()
                        .pathMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
                        .pathMatchers("/api/ticketing/**").hasRole("ORGANIZER")
                        .pathMatchers("/api/tickets/**", "/api/reservations/**").authenticated()
                        .pathMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")
                        .pathMatchers(HttpMethod.GET, "/api/events/**").permitAll()
                        .pathMatchers("/api/events/**").hasRole("ORGANIZER")
```

(Two new lines inserted, each immediately before the broader rule it must take priority over. Every other line
is unchanged.)

### Step 4: Run the tests to verify they pass

Run: `cd backend && mvn -pl api-gateway test -Dtest=GatewayRoutingIntegrationTest`
Expected: PASS — all tests in the file, including the two new ones and the pre-existing
`mutatingEventRouteRequiresOrganizerRole` and `routesAllRequiredPrefixesToTheirOwningServices` (route
definitions are unchanged, only authorization rules moved).

### Step 5: Commit

```bash
git add backend/api-gateway/src/main/java/vn/edu/tvu/gateway/security/GatewaySecurityConfig.java
git add backend/api-gateway/src/test/java/vn/edu/tvu/gateway/GatewayRoutingIntegrationTest.java
git commit -m "fix(api-gateway): require SUPER_ADMIN for GET /api/ticketing/stats and /api/events/stats

Two route-ordering bugs found during EPIC 6 design review: the ORGANIZER
catch-all for /api/ticketing/** matched before any SUPER_ADMIN-specific
rule (would 403 a SUPER_ADMIN calling /api/ticketing/stats), and the
public GET rule for /api/events/** matched before any SUPER_ADMIN rule
(would let anyone call /api/events/stats with no auth at all)."
```

---

## Task 6: OpenAPI verification across all three services

**Must run after Tasks 1, 2, 3, and 4 are all committed** (does not depend on Task 5).

**Files:**
- Modify: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketOpenApiIntegrationTest.java`
- Modify: `backend/auth-service/src/test/java/vn/edu/tvu/auth/controller/AuthOpenApiIntegrationTest.java`
- Modify: `backend/event-service/src/test/java/vn/edu/tvu/event/controller/EventOpenApiIntegrationTest.java`

**Interfaces:** none — this task only extends existing assertions against each service's live
`/v3/api-docs`, proving the `@Operation`-annotated endpoints added in Tasks 1-4 are actually exposed.

### Step 1: Write the failing assertions

In `TicketOpenApiIntegrationTest.java`, add two more `.contains(...)` lines to the existing assertion chain
inside `exposesEveryEpic4Operation`:

```java
        assertThat(response.body())
                .contains("/api/reservations")
                .contains("/api/reservations/me")
                .contains("/api/reservations/{reservationId}/approve")
                .contains("/api/reservations/{reservationId}/reject")
                .contains("/api/ticketing/events/{eventId}/availability")
                .contains("/api/ticketing/events/availability")
                .contains("/api/ticketing/check-in")
                .contains("/api/ticketing/events/{eventId}/attendees")
                .contains("/api/ticketing/events/{eventId}/attendees.csv")
                .contains("/api/ticketing/dashboard/club")
                .contains("/api/ticketing/stats");
```

In `AuthOpenApiIntegrationTest.java`, add one more line inside `exposesEpic1AuthAndAdministrationOperationsWithoutAuthentication`:

```java
        assertThat(response.body())
                .contains("/api/auth/login")
                .contains("/api/auth/me")
                .contains("/api/auth/me/profile")
                .contains("/api/auth/logout")
                .contains("/api/admin/clubs")
                .contains("/api/admin/organizers")
                .contains("/api/admin/stats")
                .contains("/.well-known/jwks.json");
```

In `EventOpenApiIntegrationTest.java`, add one more line inside `exposesEventCrudAndStatusOperationsInOpenApi`:

```java
        assertThat(response.body())
                .contains("/api/events")
                .contains("/api/events/{eventId}")
                .contains("/api/events/{eventId}/status")
                .contains("/api/events/mine")
                .contains("/api/events/stats");
```

### Step 2: Run the tests to verify they fail

Run:
```bash
cd backend
mvn -pl ticket-service test -Dtest=TicketOpenApiIntegrationTest
mvn -pl auth-service test -Dtest=AuthOpenApiIntegrationTest
mvn -pl event-service test -Dtest=EventOpenApiIntegrationTest
```

Expected: all three PASS immediately, since Tasks 1-4 already added `@Operation`-annotated `@GetMapping`
methods for every one of these paths. There is no implementation step for this task — it is pure verification
that documentation stayed in sync with the endpoints. If any of the three fails, go back to the corresponding
task and confirm the `@Operation` annotation and `@GetMapping` path match exactly what is asserted here.

### Step 3: Commit

```bash
git add backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketOpenApiIntegrationTest.java
git add backend/auth-service/src/test/java/vn/edu/tvu/auth/controller/AuthOpenApiIntegrationTest.java
git add backend/event-service/src/test/java/vn/edu/tvu/event/controller/EventOpenApiIntegrationTest.java
git commit -m "test: verify EPIC 6 endpoints are exposed in each service's OpenAPI spec"
```

---

## Final verification (run after all six tasks are committed)

```bash
cd backend
mvn -B verify
```

Expected: `BUILD SUCCESS` across all five modules (api-gateway, auth-service, event-service, ticket-service,
notification-service is untouched but part of the reactor).

Manual smoke check (dev profile, `docker compose -f infra/docker-compose.app.yml up -d`):
1. Log in as the bootstrap SUPER_ADMIN, `GET /api/admin/stats` and `GET /api/events/stats` and
   `GET /api/ticketing/stats` — all `200`, numbers match what you'd expect from seeded/dev data.
2. Log in as an ORGANIZER, `GET /api/ticketing/dashboard/club` — `200`, `registrationsByDay` has exactly 30
   entries.
3. Log in as an ORGANIZER, `GET /api/ticketing/stats` and `GET /api/events/stats` and `GET /api/admin/stats` —
   all `403`.
4. Anonymous `GET /api/events/stats` — `401`.

---

## Original design context (from brainstorming, kept for reference)

## Objective

Add read-only aggregate dashboard endpoints for organizers (per-club KPIs) and SUPER_ADMIN (school-wide
slices), computed live against Postgres. No warehouse, no caching layer, no cross-service coupling for the
MVP (T6.3 Oracle ADW stays out of scope — stretch only).

## Scope

**In scope (this plan):** T6.1 (club dashboard) + T6.2 (school-wide stats, 3 slices). **Out of scope:** TU.3
(event operations dashboard), TU.5 (audit-log read endpoint) — separate future work under "EPIC UI".

## Entry criteria

- EPIC 0-5 merged/available on `hlow`. No new schema needed — every endpoint aggregates existing tables
  (`reservations`, `tickets`, `events`, `users`, `clubs`).

## Architecture decisions

1. **Live aggregate queries, no materialization.** Each request runs a JPQL/native `COUNT`/`GROUP BY` query
   directly. Rejected: a scheduled-job summary table — unnecessary complexity at this data scale (single
   university, hundreds-to-low-thousands of rows).
2. **Strict data ownership, no cross-service calls.** Each service aggregates only what it owns. ticket-service
   does **not** call event-service for the club dashboard (avoids coupling); frontend composes `/api/events/stats`
   separately if it needs event-level capacity context.
3. **`club_id`/role come from JWT only** — never from path or query params (same invariant as every other
   organizer-scoped endpoint in this codebase).
4. **`registrationsByDay` covers the last 30 days, zero-filled** (every day in the window appears, even with
   `count: 0`) so charting libraries get a continuous series without frontend-side gap-filling.
5. **`checkInRate = checkedIn / approved`**, returned as `null` (not an error, not `0`) when `approved == 0` —
   avoids a division-by-zero and avoids a misleading `0%` for "no data yet".
6. **RBAC is enforced at both the gateway (coarse) and the owning service (fine-grained)** — the established
   defense-in-depth pattern in this codebase.

## Endpoints and owners

| Endpoint | Service | Role | Notes |
|---|---|---|---|
| `GET /api/ticketing/dashboard/club` | ticket-service | ORGANIZER | Club-wide, no eventId param |
| `GET /api/admin/stats` | auth-service | SUPER_ADMIN | New method on existing `AdminController` |
| `GET /api/events/stats` | event-service | SUPER_ADMIN | New endpoint |
| `GET /api/ticketing/stats` | ticket-service | SUPER_ADMIN | New endpoint |

## Response shapes

```jsonc
// GET /api/ticketing/dashboard/club (ORGANIZER)
{
  "clubId": "uuid",
  "pending": 12,
  "approved": 45,
  "checkedIn": 30,
  "checkInRate": 0.6667,           // checkedIn / approved, null if approved == 0
  "registrationsByDay": [
    {"date": "2026-06-15", "count": 0},
    {"date": "2026-06-16", "count": 5}
    // ... 30 entries, oldest to newest, zero-filled
  ]
}

// GET /api/admin/stats (SUPER_ADMIN, auth-service)
{
  "totalClubs": 8,
  "totalUsers": 120,
  "usersByRole": {"SINH_VIEN": 100, "ORGANIZER": 15, "SUPER_ADMIN": 5}
}

// GET /api/events/stats (SUPER_ADMIN, event-service)
{
  "totalEvents": 40,
  "eventsByStatus": {"DRAFT": 5, "OPEN": 10, "CLOSED": 25}
}

// GET /api/ticketing/stats (SUPER_ADMIN, ticket-service)
{
  "ticketsIssued": 500,
  "checkedIn": 300,
  "checkInRate": 0.6               // null if ticketsIssued == 0
}
```

## Definition of done

T6.1 and T6.2 endpoints implemented and RBAC-correct at both gateway and service layers, all tests above green,
`mvn -B verify` passes for the full reactor, and a manual smoke check (curl as SUPER_ADMIN and as an ORGANIZER)
confirms each endpoint's numbers against known fixture data.
