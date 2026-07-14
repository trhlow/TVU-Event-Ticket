# EPIC 6 implementation plan - lightweight analytics (T6.1, T6.2)

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
   defense-in-depth pattern in this codebase. See "Security fixes" below for two gateway route-ordering bugs
   this plan must close *before* or *alongside* adding the new endpoints, not after.

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

## Security fixes required (found during design review, not pre-existing on `hlow`)

Reading `GatewaySecurityConfig` and each service's `SecurityConfig` surfaced two route-ordering bugs that
**must** be fixed as part of adding these endpoints, or the new SUPER_ADMIN routes will misbehave:

1. **Gateway would 403 a SUPER_ADMIN calling `GET /api/ticketing/stats`.** The existing catch-all
   `.pathMatchers("/api/ticketing/**").hasRole("ORGANIZER")` matches first; SUPER_ADMIN has no `ROLE_ORGANIZER`.
   Fix: add `.pathMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")` **before** that
   catch-all (first-match-wins ordering in `authorizeExchange`).
2. **Gateway would treat `GET /api/events/stats` as public.** The existing
   `.pathMatchers(HttpMethod.GET, "/api/events/**").permitAll()` matches any GET sub-path, including `/stats`.
   Fix: add `.pathMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")` **before** that rule —
   same pattern already used for `/api/events/mine`.

Matching service-level fixes (defense in depth — required even though the gateway fix above narrows the same
gap, because each service must independently reject the wrong role):

3. **event-service `SecurityConfig`**: `.requestMatchers(HttpMethod.GET, "/api/events/*", "/api/events")
   .permitAll()` would also swallow `/api/events/stats` (single-segment wildcard). Add
   `.requestMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")` before it.
4. **ticket-service `SecurityConfig`**: no catch-all rule exists for `/api/ticketing/**` today — unmatched paths
   fall through to `.anyRequest().authenticated()` (any authenticated role, not role-restricted). Add explicit
   `.requestMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")` and
   `.requestMatchers(HttpMethod.GET, "/api/ticketing/dashboard/club").hasRole("ORGANIZER")`.
5. **auth-service**: no change needed. `AdminController` is already class-level
   `@PreAuthorize("hasRole('SUPER_ADMIN')")` under `/api/admin` — the new `/api/admin/stats` method inherits
   this automatically.

## Testing

- `@DataJpaTest`/repository-level aggregation tests per service with fixture data (multiple clubs/events/
  reservations) asserting exact counts.
- RBAC tests per endpoint (correct role -> 200, wrong role -> 403), following the existing
  `TicketControllerSecurityTest` / `SecurityConfigTest` pattern. Explicit case: an organizer from club A cannot
  see club B's dashboard numbers (scoped by JWT `club_id`, not a request param, so this is really "club A's
  token always produces club A's numbers" rather than a cross-club leak test).
- `checkInRate` division-by-zero -> `null`, not an exception.
- `registrationsByDay` zero-fill -> a day with no reservations still appears with `count: 0`.
- Gateway route tests (extend `GatewaySecurityConfigTest`): SUPER_ADMIN can reach `/api/ticketing/stats` and
  `/api/events/stats`; ORGANIZER/SINH_VIEN get 403 on both; ORGANIZER can reach `/api/ticketing/dashboard/club`.
- OpenAPI annotations on all four new endpoints.

## Definition of done

T6.1 and T6.2 endpoints implemented and RBAC-correct at both gateway and service layers, all tests above green,
`mvn -B verify` passes for the full reactor, and a manual smoke check (curl as SUPER_ADMIN and as an ORGANIZER)
confirms each endpoint's numbers against known fixture data.
