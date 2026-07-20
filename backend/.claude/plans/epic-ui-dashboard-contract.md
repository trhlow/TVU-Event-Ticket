# EPIC UI design - closing the Admin/Organizer dashboard API contract (TU.3, TU.4, TU.5)

**Date:** 2026-07-16
**Status:** design approved, pending implementation plan
**Branch:** `hlow`

## Why this exists

`BACKEND_STATUS_FOR_FRONTEND.md` records the attendee JSON API as available, and an endpoint does exist. But
the plan's `TU.4` acceptance criteria require `status`, `keyword`, `page`, `size` and `sort` so the frontend
table does not have to pull every attendee; the current `GET /api/ticketing/events/{eventId}/attendees` returns
a bare `List<AttendeeResponse>` with none of them. The frontend compensates by filtering client-side
(`AttendeesPage.tsx`), which is exactly the load TU.4 was written to prevent.

So EPIC UI has three gaps, not two:

- **TU.3** - `GET /api/ticketing/events/{id}/dashboard` does not exist.
- **TU.4** - the attendees endpoint exists but has no pagination, filtering, or sorting.
- **TU.5** - `GET /api/admin/audit-log` does not exist (the `audit_log` table and its writer do).

Everything else in EPIC UI (`TU.1`, `TU.2`, `TU.6`) is already served by EPIC 4 and EPIC 6 endpoints.

## Shared foundation: `PageResponse<T>`

No endpoint in the codebase paginates today, so this design sets the project-wide precedent.

`PageResponse<T>` is a record: `content`, `page`, `size`, `totalElements`, `totalPages`. Returning Spring Data's
`Page<T>` directly is rejected: Spring itself warns its JSON shape is unstable across versions, and the frontend
generates its types from the OpenAPI spec, so an unstable shape becomes a broken build later. `Pageable`/`Page`
are still used at the repository layer; the mapping to `PageResponse` happens at the controller boundary only.

Each service declares its own copy. There is no shared module, and creating one for a single record would
violate the project's service-isolation invariant for no benefit.

Rules applying to both paginated endpoints:

- `page` defaults to 0; `size` defaults to 20 and is **hard-capped at 100** (over the cap returns 400).
- `sort` is validated against a **per-endpoint whitelist of field names**. An unknown field returns 400 rather
  than being passed through to Spring Data, which would otherwise let a client sort by (and thereby probe)
  arbitrary entity properties.

## TU.3 - `GET /api/ticketing/events/{eventId}/dashboard` (ORGANIZER, ticket-service)

Response: `EventDashboardResponse(eventId, clubId, totalCapacity, remaining, approved, checkedIn, checkInRate)`.
Implemented as `DashboardService.eventDashboard(CurrentUser actor, UUID eventId)`.

- `totalCapacity`, `approved`, `clubId` come from `TicketInventory`.
- `checkedIn` comes from a new `TicketRepository.countByEventIdAndStatus(eventId, CHECKED_IN)`.
- `remaining` is obtained by **calling `TicketingService.availability(eventId)`** rather than reimplementing it.
  That method's seed-if-missing plus negative-counter fallback is subtle; a second copy would drift from the
  original. The cost is a `DashboardService` -> `TicketingService` dependency, which is accepted deliberately.
- `checkInRate` = `checkedIn / approved`, and is `null` when `approved == 0` - consistent with the existing club
  dashboard rather than reporting a misleading `0`.
- 404 when no inventory exists for the event; 403 when `inventory.clubId != actor.clubId` or the actor is not an
  ORGANIZER, reusing the scoping pattern already established by `TicketingService.attendees()`.

Event scope comes from the JWT's club claim. The event id is a path variable, but it is authorized against the
actor's club, so it cannot be used to read another club's event.

## TU.4 - `GET /api/ticketing/events/{eventId}/attendees` (ORGANIZER, ticket-service)

Adds `status`, `keyword`, `page`, `size`, `sort`; returns `PageResponse<AttendeeResponse>`.

- `status` is an optional `TicketStatus`.
- `keyword` matches case-insensitively against `student_email` **or** `student_mssv`.
- Sort whitelist: `issuedAt`, `checkedInAt`, `studentEmail`, `studentMssv`. Default `issuedAt,desc`.
- Club scoping is unchanged.

`GET .../attendees.csv` accepts the same `status` and `keyword` filters but **ignores pagination and always
exports every matching row**. An export truncated to one page of 20 is not useful, and "export what I'm looking
at" is the behaviour an organizer expects from a filtered table.

**This is a breaking change.** `frontend/src/services/ticketService.ts` currently expects a bare array. It is
updated in the same change to read `.content`, and `AttendeesPage.tsx` drops its client-side filter and passes
`keyword` to the server. Backend and frontend live in the same branch, so leaving a knowingly-broken caller
behind is not justified.

## TU.5 - `GET /api/admin/audit-log` (SUPER_ADMIN, auth-service)

Response: `PageResponse<AuditLogResponse>`, where
`AuditLogResponse(id, actorId, actorEmail, action, targetType, targetId, detail, createdAt)`.

- Filters: `actorId`, `action`, `from`, `to` (both bounds applied to `createdAt`).
- Default sort `createdAt,desc`; whitelist: `createdAt`, `action`.
- `actorEmail` comes from a **LEFT JOIN onto `users`**. `AuditLog` stores only `actorId`, and an audit screen
  rendering bare UUIDs is close to useless. `actorEmail` is `null` for system-generated entries or deleted
  actors; that is a valid state, not an error.
- Authorization is inherited from `AdminController`'s class-level `@PreAuthorize("hasRole('SUPER_ADMIN')")`.

Both the join and the filtering stay inside auth-service, which already owns `users` and `audit_log`, so no
data-ownership boundary is crossed.

## Security

Gateway needs **no change**. This was verified by tracing rule order rather than assumed:
`/api/ticketing/events/*/dashboard` falls through to the existing `/api/ticketing/**` -> ORGANIZER rule
(the earlier `/api/ticketing/events/*/availability` permitAll and `/api/ticketing/stats` rules do not match it),
and `/api/admin/**` -> SUPER_ADMIN already covers the audit log.

One service-level rule is added in ticket-service `SecurityConfig`:
`GET /api/ticketing/events/*/dashboard` -> `hasRole("ORGANIZER")`. Without it the path falls to
`anyRequest().authenticated()`, meaning the service itself would admit any authenticated student and rely
entirely on the gateway plus the service-layer role check. The explicit rule keeps defence in depth consistent
with how every other ticketing endpoint is declared.

## Testing

- Repository tests (Testcontainers) for the paginated/filtered attendee query, the `countByEventIdAndStatus`
  aggregate, and the audit-log filter + LEFT JOIN, including an entry whose actor does not exist.
- Unit tests for `DashboardService.eventDashboard`: happy path, `approved == 0` yielding a null rate, and an
  event outside the actor's club yielding 403.
- RBAC tests for all three endpoints.
- Contract tests for `size > 100` -> 400 and an unknown sort field -> 400.
- OpenAPI tests asserting the two new paths appear in the generated spec.
- Frontend: the existing vitest suite covering `ticketService` is updated alongside the shape change.

## Out of scope

- No backend aggregate endpoint for the SUPER_ADMIN overview; the frontend composes the slices (TU.2 decision,
  unchanged).
- No change to `@Testcontainers(disabledWithoutDocker = true)`, introduced on the frontend branch. It is noted
  as a follow-up risk: it makes the overbooking concurrency test skip silently on machines without Docker.
