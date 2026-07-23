# Spec: Per-club statistics for super-admin

**Date:** 2026-07-22
**Status:** Approved, not yet implemented
**Base commit:** `99e4932`

## Why

A super-admin administers club accounts and reads data across clubs; it does not act inside any club's
scope. That boundary is now enforced (`SecurityConfig` grants `/api/ticketing/**` to ORGANIZER only, and
`TicketingService#requireOrganizer` refuses anything else), but the read side of the role is unfinished:
all three existing statistics endpoints return school-wide totals with no per-club breakdown.

```java
AdminStatsResponse(long totalClubs, long totalUsers, Map<UserRole,Long> usersByRole)
EventStatsResponse(long totalEvents, Map<EventStatus,Long> eventsByStatus)
TicketStatsResponse(long ticketsIssued, long checkedIn, Double checkInRate)
```

`DashboardService#ticketStats` runs `ticketRepository.count()` — every ticket in the school, no
`group by club`. A super-admin cannot currently answer "which clubs are active and which are not".

## What exists already

`club_id` is denormalised into every relevant table, so each module can aggregate by club without any
cross-module join or new foreign key:

| Table | Column | Index |
|---|---|---|
| `users` | `club_id` | `ix_users_club_id` |
| `events` | `club_id` | `idx_events_club_id` |
| `ticket_inventories` | `club_id` | `ix_ticket_inventories_club_id` |
| `reservations` | `club_id` | `ix_reservations_club_status` |
| `tickets` | `club_id` | **none** — only `event_id` and `student_id` |

`DashboardService#registrationsByDay(UUID)` is the existing precedent for a fixed-window daily series,
scoped to one organizer's club.

## Design

### Placement

New package **`vn.edu.tvu.monolith.stats`**.

Not `auth`: composing these numbers requires reading `event` and `ticket` data, and putting the composer
in `auth` would create an `auth -> event, ticket` dependency that the module split deliberately avoids.
`vn.edu.tvu.monolith` is already the application composition root (`MonolithApplication`'s
`scanBasePackages`) and already hosts cross-cutting components (`monolith.security`, `monolith.auth`).

### Endpoints

Both `GET`, both SUPER_ADMIN only — consistent with "receives data, never acts on a club".

```
GET /api/admin/clubs/stats?page=&size=&sort=   -> PageResponse<ClubStatsSummary>
GET /api/admin/clubs/{clubId}/stats            -> ClubStatsDetail
```

Authorisation is declared twice on purpose: a matcher in `auth/security/SecurityConfig` **and** a
class-level `@PreAuthorize("hasRole('SUPER_ADMIN')")`. The matcher states the rule where every other
route's rule lives; the annotation survives anyone later rewriting the matcher list.

### Response shapes

```java
ClubStatsSummary(UUID clubId, String clubName, long totalEvents,
                 Map<EventStatus,Long> eventsByStatus, long organizers,
                 long ticketsIssued, long checkedIn, Double checkInRate)

ClubStatsDetail(ClubStatsSummary summary, List<DailyPoint> last30Days)

DailyPoint(LocalDate date, long ticketsIssued, long checkedIn)
```

`checkInRate` is `null` when `ticketsIssued == 0`, matching `TicketStatsResponse`. A club with no tickets
has no check-in rate; reporting `0.0` would read as "nobody showed up" rather than "nothing happened yet".

Paging reuses the existing `PageResponse<T>` record and `PageableFactory` (sort whitelist, `MAX_PAGE_SIZE`
of 100), so this endpoint behaves like the attendee and audit-log listings.

### Query strategy

Paging is driven by the **club list**, never by the aggregates:

1. Read one page of `clubs` (owned by `auth`) — yields ~20 club ids.
2. Three `group by club_id where club_id in (:pageIds)` queries: one over `events`, one over `tickets`,
   one over `users`.
3. Compose in memory, keyed by club id.

**Four queries total, independent of page size.** Not N+1.

A single SQL statement joining all three areas was rejected: `events x tickets` fan-out inflates counts
unless every branch is wrapped in a subquery, and the resulting statement would belong to no module.

The service injects the three repositories directly. Introducing a port interface per module was
considered and dropped as an abstraction this codebase does not otherwise use.

### Sorting — accepted limitation

Because paging is driven by the club list, `sort` accepts club attributes only (`name`, `createdAt`).
Sorting by a computed figure such as "most tickets issued" is **not supported**; that would require
paging the aggregate instead, which reintroduces the fan-out problem. Revisit only if the admin UI
actually needs a leaderboard.

### Migration V5

```sql
CREATE INDEX ix_tickets_club_status ON tickets(club_id, status);
CREATE INDEX ix_tickets_club_issued ON tickets(club_id, issued_at);
```

Required: `tickets` currently has no index on `club_id` at all, so both the totals query and the daily
series would sequentially scan the whole table. No other table needs one.

## Failure modes the tests must cover

**A day with no activity must appear as zero, not be omitted.** `group by date` returns only dates that
have rows. Passing that result straight through leaves the 30-day series with holes, and a line chart
joins the points on either side of a hole into a straight line — the graph misreports a quiet week as
steady activity, with nothing to indicate anything is missing. The composer fills all 30 days.

**A club with no events or tickets must appear with zeros, not vanish from the list.** The inner join
implied by "clubs that have rows in `tickets`" would silently hide exactly the inactive clubs a
super-admin is looking for.

**Boundary of the 30-day window** is computed once per request and applied to both series queries, so the
two lines cannot be offset by a day when a request straddles midnight.

## Test plan

| Level | Covers |
|---|---|
| Repository (Testcontainers, real Postgres) | the three `group by` queries, including a club id with no matching rows |
| Service | 30-day gap filling; zero-defaults for inactive clubs; `checkInRate` null at zero tickets |
| Controller (`@WebMvcTest`) | ORGANIZER gets 403 **and the service is never invoked**; SUPER_ADMIN gets 200; `sort` outside the whitelist gets 400 |

The controller test asserts non-invocation rather than status alone: the service layer would also refuse
an organizer, so a status-only assertion passes whether or not the web layer holds the boundary.

## Out of scope

- Sorting or filtering by computed statistics (see above).
- Any write or administrative action on a club beyond what `AdminController` already exposes.
- Frontend. This spec covers the API only.
