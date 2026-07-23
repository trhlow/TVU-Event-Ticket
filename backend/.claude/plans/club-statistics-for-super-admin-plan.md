# Per-Club Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give super-admin two read-only endpoints that break existing school-wide statistics down per club, with a 30-day daily activity series per club.

**Architecture:** A composer in the new package `vn.edu.tvu.monolith.stats` reads one page of clubs from `auth`, then issues three `group by club_id` queries (events, tickets, users) scoped to that page's club ids, and joins the results in memory. Four queries per request regardless of page size. `club_id` is already denormalised into every table, so no cross-module join and no new foreign key is needed.

**Tech Stack:** Spring Boot 4.0.7, Java 25, Spring Data JPA, PostgreSQL, Flyway, JUnit 5 + AssertJ + Mockito, Testcontainers.

**Spec:** `backend/.claude/plans/club-statistics-for-super-admin.md`

## Global Constraints

- All commands run from `backend/`. `JAVA_HOME` must point at JDK 25 — the build enforces `[25,26)`. On the dev machine: `export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"`.
- Always run `mvn clean test`, never `mvn test`. Stale bytecode has hidden real failures in this repo before.
- A run is only green if it reports `Skipped: 0`. Testcontainers tests skip silently without Docker.
- Commit messages: English, conventional commits. **Never** add `Co-Authored-By` or any AI attribution.
- Entity field names, verified against source — do not guess:
  - `Ticket`: `clubId`, `status` (`TicketStatus`), `issuedAt`, `checkedInAt`
  - `Event`: `clubId`, `status` (`EventStatus`: `DRAFT`, `OPEN`, `CLOSED`)
  - `User`: **no `clubId` field** — it is `@ManyToOne Club club`, so JPQL must say `u.club.id`. Role field is `role` (`UserRole`: `SINH_VIEN`, `ORGANIZER`, `SUPER_ADMIN`).
  - `Club`: `id`, `name`, `status` (`ClubStatus`), `createdAt`
- Reuse, do not re-create: `vn.edu.tvu.ticket.dto.response.PageResponse` and `vn.edu.tvu.ticket.web.PageableFactory`.

---

### Task 1: Ticket-side aggregates and the index they need

**Files:**
- Create: `monolith/src/main/resources/db/migration/V5__ticket_club_stats_indexes.sql`
- Modify: `monolith/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java`
- Test: `monolith/src/test/java/vn/edu/tvu/ticket/repository/TicketClubStatsQueryTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `TicketRepository.totalsByClub(Collection<UUID>) -> List<ClubTicketTotals>`, `TicketRepository.issuedPerDay(UUID, Instant) -> List<DailyCount>`, `TicketRepository.checkedInPerDay(UUID, Instant) -> List<DailyCount>`. Projection interfaces `ClubTicketTotals { UUID getClubId(); long getIssued(); long getCheckedIn(); }` and `DailyCount { LocalDate getDay(); long getTotal(); }`, both declared in `vn.edu.tvu.ticket.repository`.

- [ ] **Step 1: Write the failing test**

Create `monolith/src/test/java/vn/edu/tvu/ticket/repository/TicketClubStatsQueryTest.java`:

```java
package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.Ticket;
import vn.edu.tvu.ticket.domain.TicketStatus;
import vn.edu.tvu.ticket.support.AbstractPostgresIntegrationTest;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class TicketClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired TicketRepository repository;

    @Test
    void totalsByClubCountIssuedAndCheckedInSeparatelyPerClub() {
        var clubA = UUID.randomUUID();
        var clubB = UUID.randomUUID();
        save(clubA, TicketStatus.VALID, Instant.now(), null);
        save(clubA, TicketStatus.CHECKED_IN, Instant.now(), Instant.now());
        save(clubA, TicketStatus.CHECKED_IN, Instant.now(), Instant.now());
        save(clubB, TicketStatus.VALID, Instant.now(), null);

        var totals = repository.totalsByClub(List.of(clubA, clubB));

        assertThat(totals)
                .extracting(ClubTicketTotals::getClubId, ClubTicketTotals::getIssued,
                        ClubTicketTotals::getCheckedIn)
                .containsExactlyInAnyOrder(tuple(clubA, 3L, 2L), tuple(clubB, 1L, 0L));
    }

    /**
     * A club with no tickets must simply be absent from this result — the service supplies the zeros.
     * If the query were ever changed to an inner join against clubs it would hide inactive clubs, which
     * are exactly the ones a super-admin is looking for.
     */
    @Test
    void totalsByClubOmitsClubsWithNoTickets() {
        var empty = UUID.randomUUID();

        assertThat(repository.totalsByClub(List.of(empty))).isEmpty();
    }

    @Test
    void perDaySeriesUseIssuedAtAndCheckedInAtIndependently() {
        var club = UUID.randomUUID();
        var today = Instant.now().truncatedTo(ChronoUnit.DAYS).plusSeconds(43200);
        var threeDaysAgo = today.minus(3, ChronoUnit.DAYS);
        // Issued three days ago, checked in today: the two series must place it on different days.
        save(club, TicketStatus.CHECKED_IN, threeDaysAgo, today);
        save(club, TicketStatus.VALID, today, null);

        var from = today.minus(30, ChronoUnit.DAYS);
        var issued = repository.issuedPerDay(club, from);
        var checkedIn = repository.checkedInPerDay(club, from);

        assertThat(issued)
                .extracting(DailyCount::getDay, DailyCount::getTotal)
                .containsExactlyInAnyOrder(
                        tuple(threeDaysAgo.atZone(ZoneOffset.UTC).toLocalDate(), 1L),
                        tuple(today.atZone(ZoneOffset.UTC).toLocalDate(), 1L));
        assertThat(checkedIn)
                .extracting(DailyCount::getDay, DailyCount::getTotal)
                .containsExactly(tuple(today.atZone(ZoneOffset.UTC).toLocalDate(), 1L));
    }

    /**
     * A ticket has a foreign key to reservations, so the reservation must exist and be approved first.
     * Ticket exposes no check-in mutator and no way to set issuedAt — check-in goes through the
     * repository's conditional UPDATE in production — so the row's timestamps and status are set with
     * SQL here rather than by adding a test-only method to the entity or repository.
     */
    private void save(UUID clubId, TicketStatus status, Instant issuedAt, Instant checkedInAt) {
        var reservation = Reservation.pending(UUID.randomUUID(), clubId, UUID.randomUUID(),
                "student@example.com", "110122001", UUID.randomUUID().toString());
        reservation.approve(UUID.randomUUID());
        reservationRepository.saveAndFlush(reservation);
        var ticket = repository.saveAndFlush(Ticket.issue(reservation));
        jdbcTemplate.update("update tickets set status = ?, issued_at = ?, checked_in_at = ? where id = ?",
                status.name(),
                java.sql.Timestamp.from(issuedAt),
                checkedInAt == null ? null : java.sql.Timestamp.from(checkedInAt),
                ticket.getId());
    }
}
```

Add these fields and imports to the test class:

```java
    @Autowired ReservationRepository reservationRepository;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
```

```java
import vn.edu.tvu.ticket.domain.Reservation;
```

Verified signatures used above: `Reservation.pending(UUID eventId, UUID clubId, UUID studentId, String email, String mssv, String idempotencyKey)`, `Reservation#approve(UUID actorId)`, `Ticket.issue(Reservation reservation)`. `Ticket` has getters only — no public setter or check-in method.

- [ ] **Step 2: Run test to verify it fails**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
mvn clean test -Dtest=TicketClubStatsQueryTest -DfailIfNoTests=false
```

Expected: compilation failure — `totalsByClub`, `issuedPerDay`, `checkedInPerDay`, `ClubTicketTotals`, and `DailyCount` do not exist.

- [ ] **Step 3: Add the projection interfaces**

Create `monolith/src/main/java/vn/edu/tvu/ticket/repository/ClubTicketTotals.java`:

```java
package vn.edu.tvu.ticket.repository;

import java.util.UUID;

/** Per-club ticket totals. Clubs with no tickets are absent, not zero — the caller supplies zeros. */
public interface ClubTicketTotals {
    UUID getClubId();
    long getIssued();
    long getCheckedIn();
}
```

Create `monolith/src/main/java/vn/edu/tvu/ticket/repository/DailyCount.java`:

```java
package vn.edu.tvu.ticket.repository;

import java.time.LocalDate;

/** One day of a per-club activity series. Days with no activity are absent, not zero. */
public interface DailyCount {
    LocalDate getDay();
    long getTotal();
}
```

- [ ] **Step 4: Add the queries**

Add to `monolith/src/main/java/vn/edu/tvu/ticket/repository/TicketRepository.java`:

```java
    @Query("""
            select t.clubId as clubId, count(t.id) as issued,
                   sum(case when t.status = vn.edu.tvu.ticket.domain.TicketStatus.CHECKED_IN then 1L else 0L end)
                       as checkedIn
            from Ticket t
            where t.clubId in :clubIds
            group by t.clubId
            """)
    List<ClubTicketTotals> totalsByClub(@Param("clubIds") Collection<UUID> clubIds);

    // Native: JPQL has no date truncation. `at time zone 'UTC'` pins the day boundary to UTC so the
    // series does not shift with the server's zone.
    @Query(value = """
            SELECT date(issued_at AT TIME ZONE 'UTC') AS day, count(*) AS total
            FROM tickets
            WHERE club_id = :clubId AND issued_at >= :from
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<DailyCount> issuedPerDay(@Param("clubId") UUID clubId, @Param("from") Instant from);

    // checked_in_at, not issued_at: a ticket issued last week and scanned today belongs to today on
    // this series and to last week on the other one.
    @Query(value = """
            SELECT date(checked_in_at AT TIME ZONE 'UTC') AS day, count(*) AS total
            FROM tickets
            WHERE club_id = :clubId AND checked_in_at IS NOT NULL AND checked_in_at >= :from
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<DailyCount> checkedInPerDay(@Param("clubId") UUID clubId, @Param("from") Instant from);
```

Add the imports `java.util.Collection` and `java.time.Instant` if absent.

- [ ] **Step 5: Add the migration**

Create `monolith/src/main/resources/db/migration/V5__ticket_club_stats_indexes.sql`:

```sql
-- The tickets table has indexes on event_id and student_id but none on club_id, so every per-club
-- aggregate below would sequentially scan the whole table.
CREATE INDEX ix_tickets_club_status ON tickets(club_id, status);
CREATE INDEX ix_tickets_club_issued ON tickets(club_id, issued_at);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
mvn clean test -Dtest=TicketClubStatsQueryTest -DfailIfNoTests=false
```

Expected: `Tests run: 3, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 7: Commit**

```bash
git add monolith/src/main/java/vn/edu/tvu/ticket/repository/ \
        monolith/src/main/resources/db/migration/V5__ticket_club_stats_indexes.sql \
        monolith/src/test/java/vn/edu/tvu/ticket/repository/TicketClubStatsQueryTest.java
git commit -m "feat: add per-club ticket aggregate queries and their indexes"
```

---

### Task 2: Event-side and auth-side aggregates

**Files:**
- Modify: `monolith/src/main/java/vn/edu/tvu/event/repository/EventRepository.java`
- Modify: `monolith/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java`
- Create: `monolith/src/main/java/vn/edu/tvu/event/repository/ClubEventCount.java`
- Create: `monolith/src/main/java/vn/edu/tvu/auth/repository/ClubMemberCount.java`
- Test: `monolith/src/test/java/vn/edu/tvu/event/repository/EventClubStatsQueryTest.java`
- Test: `monolith/src/test/java/vn/edu/tvu/auth/repository/UserClubStatsQueryTest.java`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `EventRepository.countByClubAndStatus(Collection<UUID>) -> List<ClubEventCount>` where `ClubEventCount { UUID getClubId(); EventStatus getStatus(); long getTotal(); }`; `UserRepository.countOrganizersByClub(Collection<UUID>) -> List<ClubMemberCount>` where `ClubMemberCount { UUID getClubId(); long getTotal(); }`.

- [ ] **Step 1: Write the failing event test**

Create `monolith/src/test/java/vn/edu/tvu/event/repository/EventClubStatsQueryTest.java`:

```java
package vn.edu.tvu.event.repository;

import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.support.AbstractPostgresIntegrationTest;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired EventRepository repository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void countsEventsPerClubSplitByStatus() {
        var clubA = UUID.randomUUID();
        var clubB = UUID.randomUUID();
        insert(clubA, EventStatus.OPEN);
        insert(clubA, EventStatus.OPEN);
        insert(clubA, EventStatus.DRAFT);
        insert(clubB, EventStatus.CLOSED);

        var counts = repository.countByClubAndStatus(List.of(clubA, clubB));

        assertThat(counts)
                .extracting(ClubEventCount::getClubId, ClubEventCount::getStatus, ClubEventCount::getTotal)
                .containsExactlyInAnyOrder(
                        tuple(clubA, EventStatus.OPEN, 2L),
                        tuple(clubA, EventStatus.DRAFT, 1L),
                        tuple(clubB, EventStatus.CLOSED, 1L));
    }

    @Test
    void omitsClubsWithNoEvents() {
        assertThat(repository.countByClubAndStatus(List.of(UUID.randomUUID()))).isEmpty();
    }

    private void insert(UUID clubId, EventStatus status) {
        jdbcTemplate.update("""
                INSERT INTO events (id, club_id, title, description, location, starts_at, ends_at,
                                    capacity, status, created_by, created_at, updated_at)
                VALUES (?, ?, 'Test event', '', 'Hall', now() + interval '1 day',
                        now() + interval '2 day', 100, ?, ?, now(), now())
                """, UUID.randomUUID(), clubId, status.name(), UUID.randomUUID());
    }
}
```

**Before running:** open `monolith/src/main/resources/db/migration/V2__create_events.sql` and align the `INSERT` column list with the real table. Add any `NOT NULL` column that is missing and drop any column that does not exist.

- [ ] **Step 2: Run it to verify it fails**

```bash
mvn clean test -Dtest=EventClubStatsQueryTest -DfailIfNoTests=false
```

Expected: compilation failure — `countByClubAndStatus` and `ClubEventCount` do not exist.

- [ ] **Step 3: Implement the event side**

Create `monolith/src/main/java/vn/edu/tvu/event/repository/ClubEventCount.java`:

```java
package vn.edu.tvu.event.repository;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.UUID;

/** One (club, status) pair with its event count. Absent pairs mean zero. */
public interface ClubEventCount {
    UUID getClubId();
    EventStatus getStatus();
    long getTotal();
}
```

Add to `EventRepository`:

```java
    @Query("""
            select e.clubId as clubId, e.status as status, count(e.id) as total
            from Event e
            where e.clubId in :clubIds
            group by e.clubId, e.status
            """)
    List<ClubEventCount> countByClubAndStatus(@Param("clubIds") Collection<UUID> clubIds);
```

- [ ] **Step 4: Run it to verify it passes**

```bash
mvn clean test -Dtest=EventClubStatsQueryTest -DfailIfNoTests=false
```

Expected: `Tests run: 2, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 5: Write the failing user test**

Create `monolith/src/test/java/vn/edu/tvu/auth/repository/UserClubStatsQueryTest.java`:

```java
package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserClubStatsQueryTest extends AbstractPostgresIntegrationTest {

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    /** Only organizers count as club staff; students carry no club and must never inflate the figure. */
    @Test
    void countsOnlyOrganizersPerClub() {
        var clubA = clubRepository.saveAndFlush(new Club("Club A", "first"));
        var clubB = clubRepository.saveAndFlush(new Club("Club B", "second"));
        userRepository.saveAndFlush(User.organizer("ext-1", "o1@tvu.edu.vn", "O1", clubA));
        userRepository.saveAndFlush(User.organizer("ext-2", "o2@tvu.edu.vn", "O2", clubA));
        userRepository.saveAndFlush(User.organizer("ext-3", "o3@tvu.edu.vn", "O3", clubB));

        var counts = userRepository.countOrganizersByClub(List.of(clubA.getId(), clubB.getId()));

        assertThat(counts)
                .extracting(ClubMemberCount::getClubId, ClubMemberCount::getTotal)
                .containsExactlyInAnyOrder(tuple(clubA.getId(), 2L), tuple(clubB.getId(), 1L));
    }
}
```

Verified signatures used above: `new Club(String name, String description)` (public constructor, no static factory — same call as `AuthRepositoryTest`) and `User.organizer(String extSubject, String email, String displayName, Club club)`.

- [ ] **Step 6: Run it to verify it fails**

```bash
mvn clean test -Dtest=UserClubStatsQueryTest -DfailIfNoTests=false
```

Expected: compilation failure — `countOrganizersByClub` and `ClubMemberCount` do not exist.

- [ ] **Step 7: Implement the auth side**

Create `monolith/src/main/java/vn/edu/tvu/auth/repository/ClubMemberCount.java`:

```java
package vn.edu.tvu.auth.repository;

import java.util.UUID;

/** Number of organizers attached to a club. Clubs with none are absent. */
public interface ClubMemberCount {
    UUID getClubId();
    long getTotal();
}
```

Add to `UserRepository`:

```java
    // u.club.id, not u.clubId: User maps the club as a @ManyToOne association, not a raw UUID column.
    @Query("""
            select u.club.id as clubId, count(u.id) as total
            from User u
            where u.club.id in :clubIds and u.role = vn.edu.tvu.auth.domain.UserRole.ORGANIZER
            group by u.club.id
            """)
    List<ClubMemberCount> countOrganizersByClub(@Param("clubIds") Collection<UUID> clubIds);
```

- [ ] **Step 8: Run it to verify it passes**

```bash
mvn clean test -Dtest=UserClubStatsQueryTest -DfailIfNoTests=false
```

Expected: `Tests run: 1, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 9: Commit**

```bash
git add monolith/src/main/java/vn/edu/tvu/event/repository/ \
        monolith/src/main/java/vn/edu/tvu/auth/repository/ \
        monolith/src/test/java/vn/edu/tvu/event/repository/EventClubStatsQueryTest.java \
        monolith/src/test/java/vn/edu/tvu/auth/repository/UserClubStatsQueryTest.java
git commit -m "feat: add per-club event and organizer aggregate queries"
```

---

### Task 3: DTOs and the composing service

**Files:**
- Create: `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsSummary.java`
- Create: `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsDetail.java`
- Create: `monolith/src/main/java/vn/edu/tvu/monolith/stats/DailyPoint.java`
- Create: `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsService.java`
- Test: `monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsServiceTest.java`

**Interfaces:**
- Consumes: `TicketRepository.totalsByClub`, `issuedPerDay`, `checkedInPerDay`; `EventRepository.countByClubAndStatus`; `UserRepository.countOrganizersByClub`; `ClubRepository.findAll(Pageable)` (inherited from `JpaRepository`).
- Produces: `ClubStatsService.summaries(Pageable) -> Page<ClubStatsSummary>` and `ClubStatsService.detail(UUID) -> ClubStatsDetail`.

- [ ] **Step 1: Write the DTOs**

`ClubStatsSummary.java`:

```java
package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.Map;
import java.util.UUID;

public record ClubStatsSummary(
        UUID clubId,
        String clubName,
        long totalEvents,
        Map<EventStatus, Long> eventsByStatus,
        long organizers,
        long ticketsIssued,
        long checkedIn,
        Double checkInRate) {
}
```

`DailyPoint.java`:

```java
package vn.edu.tvu.monolith.stats;

import java.time.LocalDate;

public record DailyPoint(LocalDate date, long ticketsIssued, long checkedIn) {
}
```

`ClubStatsDetail.java`:

```java
package vn.edu.tvu.monolith.stats;

import java.util.List;

public record ClubStatsDetail(ClubStatsSummary summary, List<DailyPoint> last30Days) {
}
```

- [ ] **Step 2: Write the failing service test**

Create `monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsServiceTest.java`:

```java
package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

class ClubStatsServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-22T10:00:00Z");

    private final ClubRepository clubRepository = Mockito.mock(ClubRepository.class);
    private final EventRepository eventRepository = Mockito.mock(EventRepository.class);
    private final TicketRepository ticketRepository = Mockito.mock(TicketRepository.class);
    private final UserRepository userRepository = Mockito.mock(UserRepository.class);

    private ClubStatsService service;

    @BeforeEach
    void setUp() {
        service = new ClubStatsService(clubRepository, eventRepository, ticketRepository, userRepository,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    /**
     * The three aggregate queries omit clubs that have no rows. If the composer only walked those
     * results, an inactive club would vanish from the listing — and inactive clubs are precisely what a
     * super-admin is looking for.
     */
    @Test
    void clubWithNoActivityAppearsWithZerosRatherThanVanishing() {
        var club = club("Quiet Club");
        when(clubRepository.findAll(any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(club), PageRequest.of(0, 20), 1));
        when(eventRepository.countByClubAndStatus(anyCollection())).thenReturn(List.of());
        when(ticketRepository.totalsByClub(anyCollection())).thenReturn(List.of());
        when(userRepository.countOrganizersByClub(anyCollection())).thenReturn(List.of());

        var page = service.summaries(PageRequest.of(0, 20));

        assertThat(page.getContent()).hasSize(1);
        var summary = page.getContent().get(0);
        assertThat(summary.clubName()).isEqualTo("Quiet Club");
        assertThat(summary.totalEvents()).isZero();
        assertThat(summary.ticketsIssued()).isZero();
        assertThat(summary.organizers()).isZero();
        assertThat(summary.checkInRate())
                .as("no tickets means no rate; 0.0 would read as 'nobody showed up'")
                .isNull();
    }

    /**
     * `group by date` returns only dates that have rows. Passing that straight through leaves holes, and
     * a line chart joins the points on either side of a hole into a straight line — a quiet week is
     * rendered as steady activity with nothing to signal the gap.
     */
    @Test
    void dailySeriesAlwaysHasThirtyPointsIncludingSilentDays() {
        var club = club("Busy Club");
        when(clubRepository.findById(club.getId())).thenReturn(java.util.Optional.of(club));
        when(eventRepository.countByClubAndStatus(anyCollection())).thenReturn(List.of());
        when(ticketRepository.totalsByClub(anyCollection())).thenReturn(List.of());
        when(userRepository.countOrganizersByClub(anyCollection())).thenReturn(List.of());
        when(ticketRepository.issuedPerDay(any(), any()))
                .thenReturn(List.of(dailyCount(LocalDate.of(2026, 7, 20), 5L)));
        when(ticketRepository.checkedInPerDay(any(), any())).thenReturn(List.of());

        var detail = service.detail(club.getId());

        assertThat(detail.last30Days()).hasSize(30);
        assertThat(detail.last30Days().get(0).date()).isEqualTo(LocalDate.of(2026, 6, 23));
        assertThat(detail.last30Days().get(29).date()).isEqualTo(LocalDate.of(2026, 7, 22));
        assertThat(detail.last30Days())
                .filteredOn(point -> point.date().equals(LocalDate.of(2026, 7, 20)))
                .singleElement()
                .satisfies(point -> assertThat(point.ticketsIssued()).isEqualTo(5L));
        assertThat(detail.last30Days())
                .filteredOn(point -> point.date().equals(LocalDate.of(2026, 7, 21)))
                .singleElement()
                .satisfies(point -> assertThat(point.ticketsIssued()).isZero());
    }

    private Club club(String name) {
        var club = Mockito.mock(Club.class);
        when(club.getId()).thenReturn(UUID.randomUUID());
        when(club.getName()).thenReturn(name);
        return club;
    }

    private vn.edu.tvu.ticket.repository.DailyCount dailyCount(LocalDate day, long total) {
        return new vn.edu.tvu.ticket.repository.DailyCount() {
            @Override public LocalDate getDay() { return day; }
            @Override public long getTotal() { return total; }
        };
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

```bash
mvn clean test -Dtest=ClubStatsServiceTest -DfailIfNoTests=false
```

Expected: compilation failure — `ClubStatsService` does not exist.

- [ ] **Step 4: Implement the service**

Create `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsService.java`:

```java
package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.repository.ClubMemberCount;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.repository.ClubEventCount;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.ticket.repository.ClubTicketTotals;
import vn.edu.tvu.ticket.repository.DailyCount;
import vn.edu.tvu.ticket.repository.TicketRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Composes per-club figures that live in three different feature modules.
 *
 * <p>This sits in {@code monolith} rather than in {@code auth} on purpose: putting it in auth would make
 * that module depend on event and ticket, a direction the module split deliberately avoids.
 * {@code vn.edu.tvu.monolith} is the application composition root and already hosts cross-cutting
 * components.
 *
 * <p>Paging is driven by the club list, never by the aggregates: one page of clubs, then three
 * {@code group by club_id} queries scoped to that page's ids. Four queries per request regardless of
 * page size.
 */
@Service
public class ClubStatsService {

    static final int SERIES_DAYS = 30;

    private final ClubRepository clubRepository;
    private final EventRepository eventRepository;
    private final TicketRepository ticketRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    public ClubStatsService(ClubRepository clubRepository, EventRepository eventRepository,
            TicketRepository ticketRepository, UserRepository userRepository, Clock clock) {
        this.clubRepository = clubRepository;
        this.eventRepository = eventRepository;
        this.ticketRepository = ticketRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<ClubStatsSummary> summaries(Pageable pageable) {
        var clubs = clubRepository.findAll(pageable);
        var summaries = summarise(clubs.getContent());
        return clubs.map(club -> summaries.get(club.getId()));
    }

    @Transactional(readOnly = true)
    public ClubStatsDetail detail(UUID clubId) {
        var club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        var summary = summarise(List.of(club)).get(clubId);
        // One window value for both series: computing `now` twice could straddle midnight and offset the
        // two lines by a day.
        var today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        var from = today.minusDays(SERIES_DAYS - 1L).atStartOfDay(ZoneOffset.UTC).toInstant();
        var issued = byDay(ticketRepository.issuedPerDay(clubId, from));
        var checkedIn = byDay(ticketRepository.checkedInPerDay(clubId, from));

        var points = new ArrayList<DailyPoint>(SERIES_DAYS);
        for (var offset = SERIES_DAYS - 1; offset >= 0; offset--) {
            var day = today.minusDays(offset);
            points.add(new DailyPoint(day,
                    issued.getOrDefault(day, 0L),
                    checkedIn.getOrDefault(day, 0L)));
        }
        return new ClubStatsDetail(summary, List.copyOf(points));
    }

    private Map<UUID, ClubStatsSummary> summarise(List<Club> clubs) {
        var clubIds = clubs.stream().map(Club::getId).toList();
        if (clubIds.isEmpty()) {
            return Map.of();
        }
        var eventCounts = groupEvents(eventRepository.countByClubAndStatus(clubIds));
        var ticketTotals = ticketRepository.totalsByClub(clubIds).stream()
                .collect(Collectors.toMap(ClubTicketTotals::getClubId, Function.identity()));
        var organizers = userRepository.countOrganizersByClub(clubIds).stream()
                .collect(Collectors.toMap(ClubMemberCount::getClubId, ClubMemberCount::getTotal));

        return clubs.stream().collect(Collectors.toMap(Club::getId, club -> {
            var byStatus = eventCounts.getOrDefault(club.getId(), new EnumMap<>(EventStatus.class));
            var totals = ticketTotals.get(club.getId());
            var issued = totals == null ? 0L : totals.getIssued();
            var checkedIn = totals == null ? 0L : totals.getCheckedIn();
            return new ClubStatsSummary(
                    club.getId(),
                    club.getName(),
                    byStatus.values().stream().mapToLong(Long::longValue).sum(),
                    Map.copyOf(byStatus),
                    organizers.getOrDefault(club.getId(), 0L),
                    issued,
                    checkedIn,
                    issued == 0 ? null : (double) checkedIn / issued);
        }));
    }

    private Map<UUID, EnumMap<EventStatus, Long>> groupEvents(Collection<ClubEventCount> counts) {
        var grouped = new java.util.HashMap<UUID, EnumMap<EventStatus, Long>>();
        counts.forEach(count -> grouped
                .computeIfAbsent(count.getClubId(), ignored -> new EnumMap<>(EventStatus.class))
                .put(count.getStatus(), count.getTotal()));
        return grouped;
    }

    private Map<LocalDate, Long> byDay(Collection<DailyCount> counts) {
        return counts.stream().collect(Collectors.toMap(DailyCount::getDay, DailyCount::getTotal));
    }
}
```

- [ ] **Step 5: Register a Clock bean if one does not exist**

Check first:

```bash
grep -rn "Clock.systemUTC\|@Bean.*Clock" monolith/src/main/java/vn/edu/tvu/ | head
```

If no `Clock` bean is exposed, add one to `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsConfiguration.java`:

```java
package vn.edu.tvu.monolith.stats;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ConditionalOnMissingBean;

@Configuration
public class ClubStatsConfiguration {

    /** Injected rather than called statically so the 30-day window is deterministic in tests. */
    @Bean
    @ConditionalOnMissingBean
    public Clock statsClock() {
        return Clock.systemUTC();
    }
}
```

If `@ConditionalOnMissingBean` cannot be imported from `org.springframework.context.annotation`, use `org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean`.

- [ ] **Step 6: Run it to verify it passes**

```bash
mvn clean test -Dtest=ClubStatsServiceTest -DfailIfNoTests=false
```

Expected: `Tests run: 2, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 7: Commit**

```bash
git add monolith/src/main/java/vn/edu/tvu/monolith/stats/ \
        monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsServiceTest.java
git commit -m "feat: compose per-club statistics across auth, event and ticket"
```

---

### Task 4: Endpoints and authorisation

**Files:**
- Create: `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsController.java`
- Modify: `monolith/src/main/java/vn/edu/tvu/auth/security/SecurityConfig.java` (add matchers next to the existing `/api/ticketing/stats` rule)
- Test: `monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsControllerSecurityTest.java`

**Interfaces:**
- Consumes: `ClubStatsService.summaries(Pageable)`, `ClubStatsService.detail(UUID)`.
- Produces: `GET /api/admin/clubs/stats`, `GET /api/admin/clubs/{clubId}/stats`.

- [ ] **Step 1: Write the failing controller test**

Create `monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsControllerSecurityTest.java`:

```java
package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.security.CookieCsrfFilter;
import vn.edu.tvu.auth.security.SecurityConfig;
import vn.edu.tvu.testsupport.AuthSecurityTestConfiguration;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ClubStatsController.class)
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class})
class ClubStatsControllerSecurityTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean ClubStatsService service;
    @MockitoBean JwtDecoder jwtDecoder;

    @Test
    void superAdminCanReadTheClubStatsListing() throws Exception {
        when(service.summaries(any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/clubs/stats").with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isOk());
    }

    /**
     * Asserting non-invocation, not just the status: an organizer would also be refused deeper in the
     * stack, so a status-only assertion would pass whether or not the web layer actually holds.
     */
    @Test
    void organizerIsRejectedBeforeReachingTheService() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats").with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/clubs/{id}/stats", UUID.randomUUID())
                        .with(jwt().authorities(() -> "ROLE_ORGANIZER")))
                .andExpect(status().isForbidden());

        verify(service, never()).summaries(any());
        verify(service, never()).detail(any());
    }

    @Test
    void anonymousIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats")).andExpect(status().isUnauthorized());
    }

    @Test
    void sortOutsideTheWhitelistIsRejected() throws Exception {
        mockMvc.perform(get("/api/admin/clubs/stats")
                        .param("sort", "ticketsIssued,desc")
                        .with(jwt().authorities(() -> "ROLE_SUPER_ADMIN")))
                .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
mvn clean test -Dtest=ClubStatsControllerSecurityTest -DfailIfNoTests=false
```

Expected: compilation failure — `ClubStatsController` does not exist.

- [ ] **Step 3: Implement the controller**

Create `monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsController.java`:

```java
package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.ticket.dto.response.PageResponse;
import vn.edu.tvu.ticket.web.PageableFactory;

import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only cross-club statistics for super-admin. A super-admin administers club accounts and reads
 * data; it never acts inside a club's scope, so there is no write endpoint here by design.
 *
 * <p>Authorisation is declared here and in {@code SecurityConfig}. The matcher keeps the rule where
 * every other route's rule lives; the annotation survives anyone rewriting the matcher list.
 */
@RestController
@PreAuthorize("hasRole('SUPER_ADMIN')")
@Tag(name = "Admin statistics", description = "Per-club activity figures for super-admin")
public class ClubStatsController {

    /**
     * Sortable by club attributes only. Paging is driven by the club list, so sorting by a computed
     * figure such as "most tickets issued" would require paging the aggregates instead — see the spec.
     */
    private static final Map<String, String> SORT_FIELDS = Map.of(
            "name", "name",
            "createdAt", "createdAt");

    private static final String DEFAULT_SORT = "name,asc";

    private final ClubStatsService service;

    public ClubStatsController(ClubStatsService service) {
        this.service = service;
    }

    @GetMapping("/api/admin/clubs/stats")
    @Operation(summary = "List clubs with their event, ticket and organizer totals")
    public PageResponse<ClubStatsSummary> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return PageResponse.from(
                service.summaries(PageableFactory.of(page, size, sort, SORT_FIELDS, DEFAULT_SORT)));
    }

    @GetMapping("/api/admin/clubs/{clubId}/stats")
    @Operation(summary = "Get one club's totals plus its 30-day daily activity series")
    public ClubStatsDetail detail(@PathVariable UUID clubId) {
        return service.detail(clubId);
    }
}
```

- [ ] **Step 4: Add the security matchers**

In `monolith/src/main/java/vn/edu/tvu/auth/security/SecurityConfig.java`, immediately after the existing line

```java
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
```

add:

```java
                        .requestMatchers(HttpMethod.GET, "/api/admin/clubs/stats",
                                "/api/admin/clubs/*/stats").hasRole("SUPER_ADMIN")
```

- [ ] **Step 5: Run it to verify it passes**

```bash
mvn clean test -Dtest=ClubStatsControllerSecurityTest -DfailIfNoTests=false
```

Expected: `Tests run: 4, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 6: Run the whole suite**

```bash
mvn clean test
```

Expected: `BUILD SUCCESS`, `Failures: 0, Errors: 0, Skipped: 0`, and a total of at least 182 tests (173 before this plan, plus 12 added here).

If `Skipped` is anything but 0, Docker is not running and the Testcontainers tests silently did nothing. Start Docker and re-run — do not report success.

- [ ] **Step 7: Commit**

```bash
git add monolith/src/main/java/vn/edu/tvu/monolith/stats/ClubStatsController.java \
        monolith/src/main/java/vn/edu/tvu/auth/security/SecurityConfig.java \
        monolith/src/test/java/vn/edu/tvu/monolith/stats/ClubStatsControllerSecurityTest.java
git commit -m "feat: expose per-club statistics endpoints to super-admin"
```

---

## Verification checklist

Before declaring the feature done:

- [ ] `mvn clean test` reports `BUILD SUCCESS` with `Skipped: 0`.
- [ ] `GET /api/admin/clubs/stats` as ORGANIZER returns 403 **and** `ClubStatsService` was never called.
- [ ] A club with no events and no tickets still appears in the listing, with zeros and a null `checkInRate`.
- [ ] `detail(...)` returns exactly 30 points, oldest first, with silent days present as zeros.
- [ ] `sort=ticketsIssued,desc` returns 400, not a 500 and not a silently ignored parameter.
- [ ] Migration `V5` applied cleanly — check the Flyway log line in the test output.
