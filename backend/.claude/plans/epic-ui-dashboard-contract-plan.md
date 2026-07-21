# EPIC UI Implementation Plan - Admin/Organizer dashboard API contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Close the three remaining EPIC UI gaps — an organizer event-operations dashboard (TU.3), pagination
and filtering on the attendee list (TU.4), and a paginated SUPER_ADMIN audit log (TU.5).

**Architecture:** Live queries against Postgres, no caching layer. Each service declares its own
`PageResponse<T>` record and `PageableFactory` helper rather than sharing a module, preserving service
isolation. `Pageable`/`Page` are used at the repository layer only; controllers return `PageResponse<T>` so the
JSON contract does not depend on Spring Data internals.

**Tech Stack:** Spring Boot 4.0.7, Java 25, Spring Data JPA, Spring Security (URL matchers in ticket-service,
method security in auth-service), Testcontainers (Postgres), JUnit 5, AssertJ, Mockito. Frontend: React +
TypeScript + vitest.

**Spec:** `backend/.claude/plans/epic-ui-dashboard-contract.md`

## Global Constraints

- `JAVA_HOME` must point at JDK 25 (`/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot`). The machine
  default is JDK 21 and fails with `release version 25 not supported`. Export it before any `mvn` command.
- Run Maven from the `backend/` directory. Scope to one module: `mvn -pl <module> test`.
- Constructor injection only. Never field `@Autowired`.
- No `Co-Authored-By` trailers and no AI attribution in commit messages, ever.
- Commit messages follow the existing convention: `feat(<service>): ...`, `fix(<service>): ...`,
  `test: ...`.
- Page size is hard-capped at **100**; over the cap returns **400**. Default page 0, size 20.
- `sort` is validated against a per-endpoint whitelist; an unknown field returns **400**.
- `checkInRate` is `Double` and is `null` when the denominator is 0 — never `0`, never an exception.
- Do not modify `@Testcontainers(disabledWithoutDocker = true)`; it is out of scope for this plan.
- All work happens on branch `hlow`. Do not create branches or worktrees.

## Task order and parallelism

- **Task 1 → Task 2** are sequential: both modify ticket-service, and Task 2 consumes Task 1's `PageResponse`.
- **Task 3** (auth-service) is independent of Tasks 1–2 and may run in parallel.
- **Task 4** (frontend) depends on Task 1's response shape.
- **Task 5** depends on Tasks 1, 2, and 3.

---

### Task 1: ticket-service — paginated, filterable attendees (TU.4)

**Files:**
- Create: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/PageResponse.java`
- Create: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/web/PageableFactory.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/TicketingService.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java`

**Interfaces:**
- Produces:
  - `PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages)` with
    `static <T> PageResponse<T> from(Page<T>)` — Task 2 and Task 5 rely on this shape; Task 4 consumes its JSON.
  - `PageableFactory.of(int page, int size, String sort, Map<String,String> whitelist, String defaultSort)
    : Pageable`
  - `TicketRepository.findAttendees(UUID eventId, UUID clubId, TicketStatus status, String keyword,
    Pageable pageable) : Page<AttendeeProjection>` — replaces the old `List`-returning native query.
  - `TicketingService.attendees(CurrentUser, UUID, TicketStatus, String, Pageable)
    : PageResponse<AttendeeResponse>`
  - `TicketingService.attendeesCsv(CurrentUser, UUID, TicketStatus, String) : String`
  - `TicketingService.ATTENDEE_SORT_FIELDS : Map<String,String>` and
    `TicketingService.DEFAULT_ATTENDEE_SORT : String`

**Background you need:**

The existing `findAttendees` is a **native** query. Spring Data JPA does **not** support dynamic `Sort` on
native queries, so this task converts it to JPQL. `Ticket` has no JPA association to `Reservation` (it stores a
plain `reservationId` UUID), so the JPQL uses two roots (`from Ticket t, Reservation r where r.id =
t.reservationId`). Because there are two roots, **sort properties must be alias-qualified** (`t.issuedAt`,
`r.studentEmail`) — an unqualified `issuedAt` would be resolved against the first alias only and break sorting
by student fields. The whitelist therefore maps the public API field name to the qualified JPQL path. Step 2's
test sorts by a `r.`-qualified field specifically to prove this works; if it fails, fix the query rather than
weakening the test.

`AttendeeProjection.getStatus()` changes from `String` (native) to `TicketStatus` (JPQL). `AttendeeResponse`
keeps `String status`, so the service maps with `.name()`. Do not change `AttendeeResponse` — Task 4 depends on
its field names.

- [ ] **Step 1: Create `PageResponse`**

```java
package vn.edu.tvu.ticket.dto.response;

import java.util.List;

import org.springframework.data.domain.Page;

public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
```

- [ ] **Step 2: Create `PageableFactory`**

```java
package vn.edu.tvu.ticket.web;

import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class PageableFactory {

    public static final int MAX_PAGE_SIZE = 100;

    private PageableFactory() {
    }

    public static Pageable of(int page, int size, String sort, Map<String, String> sortWhitelist,
            String defaultSort) {
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return PageRequest.of(page, size, parseSort(sort == null || sort.isBlank() ? defaultSort : sort,
                sortWhitelist));
    }

    private static Sort parseSort(String sort, Map<String, String> whitelist) {
        var parts = sort.split(",");
        var mapped = whitelist.get(parts[0].trim());
        if (mapped == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "sort field must be one of " + whitelist.keySet());
        }
        var direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return Sort.by(direction, mapped);
    }
}
```

- [ ] **Step 3: Write the failing repository test**

Add to `TicketRepositoryTest`. The existing fixture helpers `inventory(...)` and `reservation(...)` are already
in that file — reuse them, do not redefine them.

```java
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
        var reservation = Reservation.pending(eventId, clubId, UUID.randomUUID(), email, mssv, idempotencyKey);
        reservationRepository.saveAndFlush(reservation);
        reservation.approve(UUID.randomUUID());
        reservationRepository.saveAndFlush(reservation);
        ticketRepository.saveAndFlush(Ticket.issue(reservation));
    }
```

Add these imports to the test file:

```java
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl ticket-service test -Dtest=TicketRepositoryTest
```

Expected: FAIL — compilation error, `cannot find symbol: method findAttendees(UUID,UUID,TicketStatus,String,PageRequest)`.

- [ ] **Step 5: Replace the native attendee query with the paginated JPQL query**

In `TicketRepository`, delete the existing `findAttendees` method and its native `@Query`, and replace with:

```java
    long countByEventIdAndStatus(UUID eventId, vn.edu.tvu.ticket.domain.TicketStatus status);

    @Query("""
            select t.id as ticketId, t.eventId as eventId, r.studentId as studentId,
                   r.studentEmail as studentEmail, r.studentMssv as studentMssv,
                   t.status as status, t.issuedAt as issuedAt, t.checkedInAt as checkedInAt
            from Ticket t, Reservation r
            where r.id = t.reservationId and t.eventId = :eventId and t.clubId = :clubId
              and (:status is null or t.status = :status)
              and (:keyword is null or lower(r.studentEmail) like :keyword
                   or lower(r.studentMssv) like :keyword)
            """)
    Page<AttendeeProjection> findAttendees(@Param("eventId") UUID eventId, @Param("clubId") UUID clubId,
            @Param("status") vn.edu.tvu.ticket.domain.TicketStatus status, @Param("keyword") String keyword,
            Pageable pageable);

    interface AttendeeProjection {
        UUID getTicketId();
        UUID getEventId();
        UUID getStudentId();
        String getStudentEmail();
        String getStudentMssv();
        vn.edu.tvu.ticket.domain.TicketStatus getStatus();
        Instant getIssuedAt();
        Instant getCheckedInAt();
    }
```

`countByEventIdAndStatus` is added now because Task 2 needs it and Task 2 must not have to reopen this file.

Update the imports in `TicketRepository`: remove `java.util.List` if nothing else uses it, and add:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd backend && mvn -pl ticket-service test -Dtest=TicketRepositoryTest
```

Expected: PASS — all tests green. If sorting by `r.studentEmail` fails to resolve, fix the JPQL; do not remove
the assertion.

- [ ] **Step 7: Commit**

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java \
        backend/ticket-service/src/test/java/vn/edu/tvu/ticket/repository/TicketRepositoryTest.java
git commit -m "feat(ticket-service): add paginated, filterable attendee query"
```

- [ ] **Step 8: Rewrite `TicketingService.attendees` and `attendeesCsv`**

Replace the existing `attendees` and `attendeesCsv` methods with:

```java
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
```

Add these imports to `TicketingService`:

```java
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.PageResponse;

import java.util.Locale;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
```

`java.util.List` may become unused in this file — remove it only if the compiler warns.

- [ ] **Step 9: Update `TicketingController` attendee endpoints**

Replace the two attendee endpoints with:

```java
    @GetMapping("/api/ticketing/events/{eventId}/attendees")
    @Operation(summary = "List attendees for the organizer's event, paginated and filterable")
    public PageResponse<AttendeeResponse> attendees(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID eventId,
            @RequestParam(required = false) TicketStatus status,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        var pageable = PageableFactory.of(page, size, sort, TicketingService.ATTENDEE_SORT_FIELDS,
                TicketingService.DEFAULT_ATTENDEE_SORT);
        return service.attendees(CurrentUser.from(jwt), eventId, status, keyword, pageable);
    }

    @GetMapping(value = "/api/ticketing/events/{eventId}/attendees.csv", produces = "text/csv")
    @Operation(summary = "Export every attendee matching the filters as UTF-8 CSV")
    public ResponseEntity<byte[]> attendeesCsv(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID eventId,
            @RequestParam(required = false) TicketStatus status,
            @RequestParam(required = false) String keyword) {
        var body = service.attendeesCsv(CurrentUser.from(jwt), eventId, status, keyword)
                .getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=attendees-" + eventId + ".csv")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }
```

Add these imports to `TicketingController`:

```java
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.dto.response.PageResponse;
import vn.edu.tvu.ticket.web.PageableFactory;
```

- [ ] **Step 10: Write the failing contract/RBAC test**

Add to `TicketControllerSecurityTest`:

```java
    @Test
    void attendeesRejectsOversizedPageAndUnknownSortField() throws Exception {
        var eventId = UUID.randomUUID();
        when(ticketingService.attendees(any(), any(), any(), any(), any()))
                .thenReturn(new vn.edu.tvu.ticket.dto.response.PageResponse<>(List.of(), 0, 20, 0, 0));

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("size", "101")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("sort", "studentPassword")
                        .with(organizerJwt()))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/ticketing/events/{eventId}/attendees", eventId)
                        .param("size", "100")
                        .param("sort", "studentEmail,asc")
                        .with(organizerJwt()))
                .andExpect(status().isOk());
    }
```

Update the two existing tests in this file that stub or call the attendees endpoint:
`studentCanSubmitButCannotReadOrganizerAttendees` needs no change (it asserts 403 before the handler runs).
`organizerCanCheckInAndReadAttendeesWithClubClaim` currently stubs
`when(ticketingService.attendees(any(), any())).thenReturn(List.of())` — change it to:

```java
        when(ticketingService.attendees(any(), any(), any(), any(), any()))
                .thenReturn(new vn.edu.tvu.ticket.dto.response.PageResponse<>(List.of(), 0, 20, 0, 0));
```

- [ ] **Step 11: Run the tests to verify they pass**

```bash
cd backend && mvn -pl ticket-service test -Dtest=TicketControllerSecurityTest
```

Expected: PASS.

- [ ] **Step 12: Run the full ticket-service suite**

```bash
cd backend && mvn -pl ticket-service test
```

Expected: BUILD SUCCESS. A `JDBCConnectionException`/`Connection refused` stack trace printed *after* the
surefire summary is pre-existing background noise from `OutboxRelayService`'s scheduled task firing during
Testcontainers shutdown — it does not affect the result. Any failure *before* the summary is real.

- [ ] **Step 13: Commit**

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/PageResponse.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/web/PageableFactory.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/TicketingService.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java \
        backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java
git commit -m "feat(ticket-service): paginate and filter the attendee endpoint (TU.4)"
```

---

### Task 2: ticket-service — event operations dashboard (TU.3)

**Depends on:** Task 1 (`PageResponse` exists; `TicketRepository.countByEventIdAndStatus` already added).

**Files:**
- Create: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/EventDashboardResponse.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/DashboardService.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java`
- Modify: `backend/ticket-service/src/main/java/vn/edu/tvu/ticket/security/SecurityConfig.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java`
- Test: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java`

**Interfaces:**
- Consumes: `TicketRepository.countByEventIdAndStatus(UUID, TicketStatus)` (Task 1, Step 5).
- Produces:
  - `EventDashboardResponse(UUID eventId, UUID clubId, int totalCapacity, int remaining, int approved,
    long checkedIn, Double checkInRate)` — Task 5 asserts this path in the OpenAPI spec.
  - `DashboardService.eventDashboard(CurrentUser actor, UUID eventId) : EventDashboardResponse`
  - New `DashboardService` constructor signature:
    `DashboardService(ReservationRepository, TicketRepository, TicketInventoryRepository, TicketingService)`

**Background you need:**

`remaining` is deliberately obtained by calling `TicketingService.availability(eventId)` rather than
recomputing it. That method carries a subtle seed-if-missing plus negative-counter fallback; a second copy
would drift. This makes `DashboardService` depend on `TicketingService`, which is intended and not a smell —
there is no cycle, since `TicketingService` does not reference `DashboardService`.

`approved` comes from `TicketInventory.getApprovedCount()`, which is the event-authoritative count, not from a
reservation query.

- [ ] **Step 1: Create `EventDashboardResponse`**

```java
package vn.edu.tvu.ticket.dto.response;

import java.util.UUID;

/**
 * Event operations KPIs for an organizer. {@code checkInRate} is checkedIn/approved and is null when no
 * reservation has been approved yet — the club-wide dashboard uses the same denominator, while the
 * school-wide {@link TicketStatsResponse} intentionally divides by tickets issued instead.
 */
public record EventDashboardResponse(UUID eventId, UUID clubId, int totalCapacity, int remaining,
        int approved, long checkedIn, Double checkInRate) {
}
```

- [ ] **Step 2: Write the failing service test**

Add to `DashboardServiceTest`. The class currently builds the service via a `dashboardService()` helper with two
mocks — replace that helper and add the two new mocks:

```java
    @Mock TicketInventoryRepository inventoryRepository;
    @Mock TicketingService ticketingService;

    private DashboardService dashboardService() {
        return new DashboardService(reservationRepository, ticketRepository, inventoryRepository,
                ticketingService);
    }

    @Test
    void eventDashboardCombinesInventoryCapacityWithLiveRemainingAndCheckIns() {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory(eventId, clubId, 50, 20)));
        when(ticketingService.availability(eventId))
                .thenReturn(new AvailabilityResponse(eventId, 50, 20, 30));
        when(ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN)).thenReturn(5L);

        var response = dashboardService().eventDashboard(actor, eventId);

        assertThat(response.eventId()).isEqualTo(eventId);
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.totalCapacity()).isEqualTo(50);
        assertThat(response.remaining()).isEqualTo(30);
        assertThat(response.approved()).isEqualTo(20);
        assertThat(response.checkedIn()).isEqualTo(5);
        assertThat(response.checkInRate()).isEqualTo(0.25);
    }

    @Test
    void eventDashboardReturnsNullCheckInRateWhenNothingApproved() {
        var clubId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER, clubId, null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.of(inventory(eventId, clubId, 50, 0)));
        when(ticketingService.availability(eventId))
                .thenReturn(new AvailabilityResponse(eventId, 50, 0, 50));
        when(ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN)).thenReturn(0L);

        assertThat(dashboardService().eventDashboard(actor, eventId).checkInRate()).isNull();
    }

    @Test
    void eventDashboardRejectsEventOutsideOrganizerClub() {
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER,
                UUID.randomUUID(), null);
        when(inventoryRepository.findByEventId(eventId))
                .thenReturn(Optional.of(inventory(eventId, UUID.randomUUID(), 50, 1)));

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, eventId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void eventDashboardRejectsNonOrganizer() {
        var actor = new CurrentUser(UUID.randomUUID(), "student@example.com", UserRole.SINH_VIEN, null, "110122001");

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void eventDashboardReturns404WhenInventoryMissing() {
        var eventId = UUID.randomUUID();
        var actor = new CurrentUser(UUID.randomUUID(), "organizer@example.com", UserRole.ORGANIZER,
                UUID.randomUUID(), null);
        when(inventoryRepository.findByEventId(eventId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService().eventDashboard(actor, eventId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    private static TicketInventory inventory(UUID eventId, UUID clubId, int capacity, int approvedCount) {
        var inventory = TicketInventory.create(eventId, clubId, capacity, "Demo event",
                Instant.parse("2026-07-02T09:00:00Z"), Instant.parse("2026-07-02T11:00:00Z"), "TVU Hall");
        for (var i = 0; i < approvedCount; i++) {
            inventory.reserveApprovedSlot();
        }
        return inventory;
    }
```

Add these imports to `DashboardServiceTest`:

```java
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.dto.response.AvailabilityResponse;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;

import java.util.Optional;
```

`TicketInventory` exposes no `approvedCount` setter; `reserveApprovedSlot()` (`TicketInventory.java:90`) is the
real mutator the approval flow uses. It increments `approvedCount` and returns `false` once capacity is
reached — the fixture never exceeds capacity, so its return value is ignored here.

- [ ] **Step 3: Run the test to verify it fails**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl ticket-service test -Dtest=DashboardServiceTest
```

Expected: FAIL — `cannot find symbol: method eventDashboard(...)`.

- [ ] **Step 4: Implement `DashboardService.eventDashboard`**

Change the constructor and add the method:

```java
    private final ReservationRepository reservationRepository;
    private final TicketRepository ticketRepository;
    private final TicketInventoryRepository inventoryRepository;
    private final TicketingService ticketingService;

    public DashboardService(ReservationRepository reservationRepository, TicketRepository ticketRepository,
            TicketInventoryRepository inventoryRepository, TicketingService ticketingService) {
        this.reservationRepository = reservationRepository;
        this.ticketRepository = ticketRepository;
        this.inventoryRepository = inventoryRepository;
        this.ticketingService = ticketingService;
    }

    public EventDashboardResponse eventDashboard(CurrentUser actor, UUID eventId) {
        requireOrganizer(actor);
        var inventory = inventoryRepository.findByEventId(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event ticketing not found"));
        if (!inventory.getClubId().equals(actor.clubId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Event is outside organizer club scope");
        }
        var availability = ticketingService.availability(eventId);
        var approved = inventory.getApprovedCount();
        var checkedIn = ticketRepository.countByEventIdAndStatus(eventId, TicketStatus.CHECKED_IN);
        Double checkInRate = approved == 0 ? null : (double) checkedIn / approved;
        return new EventDashboardResponse(eventId, inventory.getClubId(), availability.totalCapacity(),
                availability.remaining(), approved, checkedIn, checkInRate);
    }

    private void requireOrganizer(CurrentUser actor) {
        if (actor.role() != UserRole.ORGANIZER || actor.clubId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Organizer club scope is required");
        }
    }
```

Also refactor the existing `clubDashboard` to call the new `requireOrganizer(actor)` helper instead of
repeating the inline check — the check is now needed twice, so extracting it is warranted.

Add these imports to `DashboardService`:

```java
import vn.edu.tvu.ticket.dto.response.EventDashboardResponse;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;

import java.util.UUID;
```

Replace the fully-qualified `java.util.UUID` / `java.util.List` usages in the existing
`registrationsByDay(java.util.UUID clubId)` signature with the imported short names while you are in the file —
the fully-qualified names there were a plan artifact, and the file now imports `UUID` anyway.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && mvn -pl ticket-service test -Dtest=DashboardServiceTest
```

Expected: PASS.

- [ ] **Step 6: Add the controller endpoint**

In `TicketingController`, add:

```java
    @GetMapping("/api/ticketing/events/{eventId}/dashboard")
    @Operation(summary = "Get live capacity and check-in KPIs for the organizer's event")
    public EventDashboardResponse eventDashboard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        return dashboardService.eventDashboard(CurrentUser.from(jwt), eventId);
    }
```

Add the import:

```java
import vn.edu.tvu.ticket.dto.response.EventDashboardResponse;
```

- [ ] **Step 7: Add the security rule**

In `SecurityConfig`, add this line **immediately after** the existing
`.requestMatchers(HttpMethod.GET, "/api/ticketing/dashboard/club").hasRole("ORGANIZER")` line:

```java
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/*/dashboard")
                        .hasRole("ORGANIZER")
```

Without this rule the path falls through to `anyRequest().authenticated()`, which would let any authenticated
student reach the handler and rely solely on the service-layer role check.

- [ ] **Step 8: Write the failing RBAC test**

Add to `TicketControllerSecurityTest`:

```java
    @Test
    void eventDashboardRequiresOrganizer() throws Exception {
        var eventId = UUID.randomUUID();
        when(dashboardService.eventDashboard(any(), any())).thenReturn(
                new vn.edu.tvu.ticket.dto.response.EventDashboardResponse(
                        eventId, UUID.randomUUID(), 50, 30, 20, 5L, 0.25));

        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId).with(studentJwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ticketing/events/{eventId}/dashboard", eventId).with(organizerJwt()))
                .andExpect(status().isOk());
    }
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd backend && mvn -pl ticket-service test -Dtest=TicketControllerSecurityTest,DashboardServiceTest
```

Expected: PASS.

- [ ] **Step 10: Run the full ticket-service suite**

```bash
cd backend && mvn -pl ticket-service test
```

Expected: BUILD SUCCESS.

- [ ] **Step 11: Commit**

```bash
git add backend/ticket-service/src/main/java/vn/edu/tvu/ticket/dto/response/EventDashboardResponse.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/service/DashboardService.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/controller/TicketingController.java \
        backend/ticket-service/src/main/java/vn/edu/tvu/ticket/security/SecurityConfig.java \
        backend/ticket-service/src/test/java/vn/edu/tvu/ticket/service/DashboardServiceTest.java \
        backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketControllerSecurityTest.java
git commit -m "feat(ticket-service): add TU.3 event operations dashboard endpoint"
```

---

### Task 3: auth-service — paginated audit log (TU.5)

**Independent of Tasks 1, 2 and 4.** Touches only `backend/auth-service/`.

**Files:**
- Create: `backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/PageResponse.java`
- Create: `backend/auth-service/src/main/java/vn/edu/tvu/auth/web/PageableFactory.java`
- Create: `backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/AuditLogResponse.java`
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/repository/AuditLogRepository.java`
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/service/AuditLogService.java`
- Modify: `backend/auth-service/src/main/java/vn/edu/tvu/auth/controller/AdminController.java`
- Test: `backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuditLogRepositoryTest.java`

**Interfaces:**
- Produces:
  - `PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages)` +
    `static <T> PageResponse<T> from(Page<T>)`
  - `AuditLogResponse(UUID id, UUID actorId, String actorEmail, String action, String targetType,
    UUID targetId, String detail, Instant createdAt)` — Task 5 asserts `/api/admin/audit-log` in the spec.
  - `AuditLogService.search(UUID actorId, String action, Instant from, Instant to, Pageable pageable)
    : PageResponse<AuditLogResponse>`

**Background you need:**

`AuditLog` stores only `actorId`; there is no JPA association to `User`. The query uses an ad-hoc JPQL entity
join (`left join User u on u.id = a.actorId`), which Hibernate supports. It must be a **left** join: entries
written by the system, or whose actor was later deleted, have no matching user and must still be returned with
`actorEmail = null`. That is a valid state, not an error — the test asserts it explicitly.

`AdminController` carries a class-level `@PreAuthorize("hasRole('SUPER_ADMIN')")`, so the new endpoint inherits
SUPER_ADMIN authorization with no extra annotation and no `SecurityConfig` change. The gateway already routes
`/api/admin/**` to SUPER_ADMIN.

- [ ] **Step 1: Create `PageResponse`**

```java
package vn.edu.tvu.auth.dto.response;

import java.util.List;

import org.springframework.data.domain.Page;

public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
```

- [ ] **Step 2: Create `PageableFactory`**

```java
package vn.edu.tvu.auth.web;

import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class PageableFactory {

    public static final int MAX_PAGE_SIZE = 100;

    private PageableFactory() {
    }

    public static Pageable of(int page, int size, String sort, Map<String, String> sortWhitelist,
            String defaultSort) {
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return PageRequest.of(page, size, parseSort(sort == null || sort.isBlank() ? defaultSort : sort,
                sortWhitelist));
    }

    private static Sort parseSort(String sort, Map<String, String> whitelist) {
        var parts = sort.split(",");
        var mapped = whitelist.get(parts[0].trim());
        if (mapped == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "sort field must be one of " + whitelist.keySet());
        }
        var direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return Sort.by(direction, mapped);
    }
}
```

- [ ] **Step 3: Create `AuditLogResponse`**

```java
package vn.edu.tvu.auth.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * One audit entry. {@code actorEmail} is null when the entry was written by the system or its actor has since
 * been deleted; the actor id is retained either way.
 */
public record AuditLogResponse(UUID id, UUID actorId, String actorEmail, String action, String targetType,
        UUID targetId, String detail, Instant createdAt) {
}
```

- [ ] **Step 4: Write the failing repository test**

Create `backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuditLogRepositoryTest.java`. The
annotations and base class below match the existing `AuthRepositoryTest` in the same package.

```java
package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AuditLogRepositoryTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void searchJoinsActorEmailAndKeepsEntriesWithoutAMatchingUser() {
        var actor = userRepository.saveAndFlush(actor("admin@example.com"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(UUID.randomUUID(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));

        var page = auditLogRepository.search(null, null, null, null,
                PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "a.createdAt")));

        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting(AuditLogRepository.AuditLogEntryProjection::getActorEmail)
                .containsExactlyInAnyOrder("admin@example.com", null);
    }

    @Test
    void searchFiltersByActorActionAndTimeWindow() {
        var actor = userRepository.saveAndFlush(actor("admin2@example.com"));
        var other = userRepository.saveAndFlush(actor("admin3@example.com"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(actor.getId(), "auth.organizer.lock", "user",
                UUID.randomUUID(), "{}"));
        auditLogRepository.saveAndFlush(AuditLog.local(other.getId(), "auth.club.create", "club",
                UUID.randomUUID(), "{}"));
        var pageable = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "a.createdAt"));

        assertThat(auditLogRepository.search(actor.getId(), null, null, null, pageable).getTotalElements())
                .isEqualTo(2);
        assertThat(auditLogRepository.search(null, "auth.organizer.lock", null, null, pageable)
                .getTotalElements()).isEqualTo(1);
        assertThat(auditLogRepository.search(null, null, Instant.now().plusSeconds(60), null, pageable)
                .getTotalElements()).isZero();
        assertThat(auditLogRepository.search(null, null, null, Instant.now().plusSeconds(60), pageable)
                .getTotalElements()).isEqualTo(3);
    }

    private static User actor(String email) {
        return User.superAdmin("ext-" + email, email, "Audit Actor");
    }
}
```

`User.superAdmin(extSubject, email, displayName)` (`User.java:84`) is the real factory — `extSubject` is unique
per user, so it is derived from the email here to keep the two fixtures distinct.

- [ ] **Step 5: Run the test to verify it fails**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl auth-service test -Dtest=AuditLogRepositoryTest
```

Expected: FAIL — `cannot find symbol: method search(...)`.

- [ ] **Step 6: Add the query to `AuditLogRepository`**

```java
    @Query("""
            select a.id as id, a.actorId as actorId, u.email as actorEmail, a.action as action,
                   a.targetType as targetType, a.targetId as targetId, a.detail as detail,
                   a.createdAt as createdAt
            from AuditLog a left join User u on u.id = a.actorId
            where (:actorId is null or a.actorId = :actorId)
              and (:action is null or a.action = :action)
              and (:from is null or a.createdAt >= :from)
              and (:to is null or a.createdAt <= :to)
            """)
    Page<AuditLogEntryProjection> search(@Param("actorId") UUID actorId, @Param("action") String action,
            @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    interface AuditLogEntryProjection {
        UUID getId();
        UUID getActorId();
        String getActorEmail();
        String getAction();
        String getTargetType();
        UUID getTargetId();
        String getDetail();
        Instant getCreatedAt();
    }
```

Add these imports:

```java
import java.time.Instant;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd backend && mvn -pl auth-service test -Dtest=AuditLogRepositoryTest
```

Expected: PASS.

- [ ] **Step 8: Add `search` to `AuditLogService`**

```java
    public static final Map<String, String> AUDIT_SORT_FIELDS = Map.of(
            "createdAt", "a.createdAt",
            "action", "a.action");

    public static final String DEFAULT_AUDIT_SORT = "createdAt,desc";

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(UUID actorId, String action, Instant from, Instant to,
            Pageable pageable) {
        return PageResponse.from(auditLogRepository.search(actorId, trimToNull(action), from, to, pageable)
                .map(row -> new AuditLogResponse(row.getId(), row.getActorId(), row.getActorEmail(),
                        row.getAction(), row.getTargetType(), row.getTargetId(), row.getDetail(),
                        row.getCreatedAt())));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        var trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
```

Add these imports to `AuditLogService`:

```java
import vn.edu.tvu.auth.dto.response.AuditLogResponse;
import vn.edu.tvu.auth.dto.response.PageResponse;

import java.time.Instant;
import java.util.Map;

import org.springframework.data.domain.Pageable;
```

- [ ] **Step 9: Add the controller endpoint**

In `AdminController`, add `AuditLogService` as a second constructor dependency and add the endpoint:

```java
    private final AdminManagementService adminManagementService;
    private final AuditLogService auditLogService;

    public AdminController(AdminManagementService adminManagementService, AuditLogService auditLogService) {
        this.adminManagementService = adminManagementService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/audit-log")
    @Operation(summary = "Search the audit log, paginated")
    public PageResponse<AuditLogResponse> auditLog(
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        var pageable = PageableFactory.of(page, size, sort, AuditLogService.AUDIT_SORT_FIELDS,
                AuditLogService.DEFAULT_AUDIT_SORT);
        return auditLogService.search(actorId, action, from, to, pageable);
    }
```

Add these imports to `AdminController`:

```java
import vn.edu.tvu.auth.dto.response.AuditLogResponse;
import vn.edu.tvu.auth.dto.response.PageResponse;
import vn.edu.tvu.auth.service.AuditLogService;
import vn.edu.tvu.auth.web.PageableFactory;

import java.time.Instant;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.RequestParam;
```

- [ ] **Step 10: Run the full auth-service suite**

```bash
cd backend && mvn -pl auth-service test
```

Expected: BUILD SUCCESS. If an existing test constructs `AdminController` directly, update it for the new
constructor parameter.

- [ ] **Step 11: Commit**

```bash
git add backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/PageResponse.java \
        backend/auth-service/src/main/java/vn/edu/tvu/auth/dto/response/AuditLogResponse.java \
        backend/auth-service/src/main/java/vn/edu/tvu/auth/web/PageableFactory.java \
        backend/auth-service/src/main/java/vn/edu/tvu/auth/repository/AuditLogRepository.java \
        backend/auth-service/src/main/java/vn/edu/tvu/auth/service/AuditLogService.java \
        backend/auth-service/src/main/java/vn/edu/tvu/auth/controller/AdminController.java \
        backend/auth-service/src/test/java/vn/edu/tvu/auth/repository/AuditLogRepositoryTest.java
git commit -m "feat(auth-service): add TU.5 paginated audit-log endpoint"
```

---

### Task 4: frontend — consume the paginated attendee contract

**Depends on:** Task 1.

**Files:**
- Modify: `frontend/src/services/ticketService.ts`
- Modify: `frontend/src/pages/organizer/AttendeesPage.tsx`
- Test: `frontend/src/services/__tests__/ticketService.test.ts` (create only if absent — check first)

**Interfaces:**
- Consumes: `GET /api/ticketing/events/{eventId}/attendees` now returns
  `{ content: AttendeeResponse[], page, size, totalElements, totalPages }`.

**Background you need:**

`ticketService.listAttendees` currently does
`(await apiRequest<AttendeeResponse[]>(...)).map(mapAttendeeTicket)` — that `.map` throws once the body is an
object rather than an array. `AttendeesPage` then filters client-side, which is the load TU.4 removes. Keep the
change minimal: this task is about not shipping a broken caller, not about redesigning the page.

- [ ] **Step 1: Add the page envelope type and read `.content`**

In `frontend/src/services/ticketService.ts`, add near the other response interfaces:

```ts
interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
```

Replace `listAttendees` with:

```ts
  async listAttendees(eventId: string, keyword?: string): Promise<Ticket[]> {
    return withTicketFallback(
      async () => {
        const query = new URLSearchParams({ size: "100" });
        if (keyword?.trim()) query.set("keyword", keyword.trim());
        const page = await apiRequest<PageResponse<AttendeeResponse>>(
          `/ticketing/events/${eventId}/attendees?${query.toString()}`,
        );
        return page.content.map(mapAttendeeTicket);
      },
      () => getTickets().filter((ticket) => ticket.eventId === eventId),
    );
  },
```

- [ ] **Step 2: Push the search to the server in `AttendeesPage`**

In `frontend/src/pages/organizer/AttendeesPage.tsx`:

Change the effect to pass the search term and re-run when it changes, and delete the `filteredAttendees`
`useMemo` entirely:

```tsx
  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    ticketService.listAttendees(eventId, search)
      .then((items) => {
        if (mounted) setAttendees(items);
      })
      .catch((error) => {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Không thể tải danh sách tham dự.");
      });
    return () => {
      mounted = false;
    };
  }, [eventId, search]);
```

Then change the table to render `attendees` directly:

```tsx
        <DataTable data={attendees} columns={columns} searchPlaceholder="Lọc nhanh..." searchField="ticketCode" />
```

Remove the now-unused `useMemo` import if nothing else in the file uses it.

- [ ] **Step 3: Update the CSV export to carry the same filter**

In the same file, change the export handler's request line to include the keyword:

```tsx
      const query = search.trim() ? `?keyword=${encodeURIComponent(search.trim())}` : "";
      const csv = await apiRequest<string>(`/ticketing/events/${eventId}/attendees.csv${query}`);
```

- [ ] **Step 4: Run the frontend checks**

```bash
cd frontend && npm run lint && npx tsc --noEmit && npm test -- --run
```

Expected: all pass. If a vitest test stubs the attendees response as a bare array, update that stub to the page
envelope — that is a real contract change, not a test to work around.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/ticketService.ts frontend/src/pages/organizer/AttendeesPage.tsx
git commit -m "fix(frontend): consume the paginated attendee contract and filter server-side"
```

---

### Task 5: verify the new endpoints appear in the OpenAPI specs

**Depends on:** Tasks 1, 2, 3.

**Files:**
- Modify: `backend/ticket-service/src/test/java/vn/edu/tvu/ticket/controller/TicketOpenApiIntegrationTest.java`
- Modify: `backend/auth-service/src/test/java/vn/edu/tvu/auth/controller/AuthOpenApiIntegrationTest.java`

**Background you need:**

Both files already exist and assert that `/v3/api-docs` contains the EPIC 6 paths. Extend the existing
`.contains(...)` assertions rather than adding new test methods.

- [ ] **Step 1: Add the ticket-service assertion**

In the ticket-service OpenAPI test, add `"/api/ticketing/events/{eventId}/dashboard"` to the existing
`assertThat(body).contains(...)` argument list.

- [ ] **Step 2: Add the auth-service assertion**

In the auth-service OpenAPI test, add `"/api/admin/audit-log"` to the existing
`assertThat(body).contains(...)` argument list.

- [ ] **Step 3: Run both OpenAPI tests**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl ticket-service,auth-service test -Dtest='*OpenApiIntegrationTest'
```

Expected: PASS. A failure here means the endpoint is not actually exposed — fix the endpoint, not the
assertion.

- [ ] **Step 4: Run the whole backend build**

```bash
cd backend && mvn -B verify
```

Expected: BUILD SUCCESS across all five modules.

- [ ] **Step 5: Commit**

```bash
git add backend/ticket-service/src/test backend/auth-service/src/test
git commit -m "test: verify EPIC UI endpoints are exposed in each service's OpenAPI spec"
```

---

## Definition of done

- `GET /api/ticketing/events/{id}/dashboard` returns live capacity/remaining/approved/checked-in for the
  organizer's own club, 403 for another club, 404 when the event has no inventory.
- `GET /api/ticketing/events/{id}/attendees` paginates, filters by `status` and `keyword`, sorts by a
  whitelisted field, rejects `size > 100` and unknown sort fields with 400.
- `GET .../attendees.csv` honours `status`/`keyword` and exports every matching row.
- `GET /api/admin/audit-log` paginates and filters by actor/action/time, returns `actorEmail` where the actor
  still exists and `null` where it does not, and is reachable only by SUPER_ADMIN.
- The frontend attendee page works against the new contract.
- All four new paths appear in the generated OpenAPI specs.
- `mvn -B verify` is green.
