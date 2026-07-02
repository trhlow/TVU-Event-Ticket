# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This directory (`backend/`) is the **backend subfolder** of a team monorepo (teammate owns `frontend/` React at
the repo root — see `../README.md`). The proposal [../decuongTVUEventTicket.md](../decuongTVUEventTicket.md) is
the authoritative spec for business rules (whole system, written in Vietnamese).

The Maven multi-module reactor is **scaffolded and compiles** (`mvn clean install` passes from this directory):
5 services with layer-based packages, Flyway wired up, dev/prod profiles, logging. **No business logic yet** —
`domain/controller/service/repository` packages are empty (`.gitkeep` placeholders). See [Commands](#commands)
below.

Cross-service contracts (internal JWT, JWKS, CSRF token, QR payload, RabbitMQ message + audit schemas) are
documented in [.claude/docs/contracts.md](.claude/docs/contracts.md) — the single source of truth for anything
shared between services.

This is a 3-person academic capstone (Đồ án Công nghệ phần mềm) at TVU, built over 4 Scrum sprints, deployed
entirely on **free-tier cloud** (target cost: $0). The proposal is written in Vietnamese; domain terms below
match it.

## Working scope — backend/ only (IMPORTANT)

The user only works on the backend. **Keep all Claude Code tooling — skills, agents, commands, hooks, settings,
MCP indexes (e.g. GitNexus) — confined to this `backend/` directory.** Do not touch `.claude/`, `CLAUDE.md`, or
similar tooling at the repo root or in `frontend/` (the teammate's workspace) unless explicitly asked. The only
root-level exception is `.github/workflows/*.yml` (GitHub Actions only reads workflows from the repo root).
Point tools that default to the git root back at `backend/` (e.g. GitNexus `--skip-git`).

## Commands

Run from this directory ([README.md](README.md) has the full list):

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres, Redis, RabbitMQ for local dev
mvn clean install                                   # build all modules
mvn -pl ticket-service -am spring-boot:run           # run one service (dev profile by default)
mvn -pl ticket-service test -Dtest=SomeTest          # run a single test class
```

## Commit messages

Do not add a "Co-Authored-By" line or any other Claude/AI attribution to commit messages — in this repo, never.

## What the system is

A distributed (microservices) event-management and e-ticketing platform for TVU university clubs (CLB). Core
business flow: create event → open registration → student requests a spot → **organizer approves** → ticket +
signed QR emailed → QR scanned for check-in → analytics. Explicitly out of scope: paid tickets, native mobile
apps.

**Auth deviates from proposal §6.8 on purpose:** login accepts **any Microsoft account** (the team could not
get the school tenant); students complete their profile (MSSV) afterward, and the club catalog is owned by
**auth-service**, not event-service. See invariant #3 for the anti-fake-registration mitigations this requires.

## Repo layout

The monorepo root (one level up) looks like this — see `../README.md`:

```
TVU-Event-Ticket/                 # repo root
├── .github/workflows/ci.yml      # path-filtered CI (paths are backend/-prefixed, working-directory: backend)
├── decuongTVUEventTicket.md       # proposal — covers the whole system, not just backend
├── README.md                     # top-level orientation (points here + to frontend/)
├── frontend/                     # React — teammate's workspace, own conventions, not covered by this file
└── backend/                      # <- this directory
    ├── pom.xml                    # Maven reactor parent (spring-boot-starter-parent, Java 21)
    ├── api-gateway/               # Spring Cloud Gateway — CORS, JWT, RBAC, rate limiting, routing
    ├── auth-service/              # Spring Boot — identity, internal JWT (RS256+JWKS), users, clubs, RBAC, audit log
    ├── event-service/             # Spring Boot — events (club_id stored as a value, not an FK)
    ├── ticket-service/             # Spring Boot — reservations, tickets, check-in
    ├── notification-service/       # Spring Boot — consumes RabbitMQ, generates QR, sends email
    ├── infra/                     # docker-compose.yml + init-db/ (Postgres, Redis, RabbitMQ for local dev)
    ├── .claude/                   # project-scoped Claude Code config, backend-specific (skills, agents, hooks, docs/contracts.md)
    ├── README.md                  # build/run/test commands
    └── CLAUDE.md                  # this file
```

Monorepo rationale (§6.1): one repo so an API change and its frontend consumer land in the same PR. `.claude/`
stays scoped to `backend/` (its skills are Java/Spring-specific).

Each service uses **layer-based** packages under `vn.edu.tvu.<svc>`
(`controller/service/repository/domain/dto/mapper/config/security/exception`) with the
`@SpringBootApplication` in the root package (chosen over feature-based: each microservice is already one
bounded context). Schema is **Flyway**-managed (`db/migration/`, immutable versions; Hibernate
`ddl-auto: validate`). Config: `application.yml` (common, default `dev`) + `application-{dev,prod}.yml`.

## Tech stack

- **Frontend**: React, TypeScript, Recharts. Deployed on Cloudflare Pages. PWA (browser-camera QR scanning, no native app).
- **API Gateway**: Spring Cloud Gateway — the single entry point for CORS, JWT auth, RBAC checks, and rate limiting.
- **Auth Service**: Java Spring Boot (port 8084) — owns identity, users, clubs, RBAC, and the central audit log; issues the internal JWT (RS256) and exposes JWKS.
- **Services**: Java Spring Boot (Event, Ticket, Notification). Services are loosely coupled and communicate asynchronously via the broker.
- **Atomic counter / lock**: Redis (ticket-remaining counter, rate-limit counter).
- **Async messaging**: RabbitMQ (CloudAMQP), Topic Exchange + Dead Letter Queue.
- **Transactional DB**: PostgreSQL (Neon).
- **Analytics warehouse**: Oracle Autonomous Data Warehouse (ADW).
- **Auth**: Microsoft Identity Platform (OAuth2/OIDC via MSAL, **multi-tenant — any Microsoft account**, not restricted to `@tvu.edu.vn`; see invariant #3) → auth-service issues an internal RS256 JWT (JWKS-validated by every service). Pluggable identity provider (`DevStub` for dev/test, `Microsoft` for prod).
- **Packaging/CI**: Docker, Docker Compose, GitHub Actions. Backend runs on Oracle Cloud Always Free (Ampere A1 / ARM).
- **Load testing**: k6 or JMeter.

## Critical design decisions (the invariants that make this project work)

These are the non-obvious rules the proposal commits to. Preserve them; they are the point of the whole project.

1. **Reservation is atomic and happens at APPROVAL time, not at submit time.** A student clicking "register"
   only creates a `PENDING` row and **deducts no ticket**. When an organizer approves, the system does the
   atomic `Redis DECR` on the event's remaining-ticket counter (Lua script if needed); a negative result →
   "sold out", the registration stays pending. Only on success does it go `APPROVED`, publish to RabbitMQ, and
   issue the ticket. Registration lifecycle: `PENDING → APPROVED | REJECTED`. (Proposal §6.3, §6.11)

2. **Overbooking defense is layered.** Redis DECR is the primary atomic guard; a JPA optimistic lock
   (`@Version`) on the ticket write in PostgreSQL is the second layer in case Redis fails. Fallback if Redis is
   dropped for time reasons: `SELECT ... FOR UPDATE`.

3. **Anti-fake-registration relies on identity, not IP.** Every registration is tied to an authenticated
   login (no anonymous/manual entry). Dedup via a DB `UNIQUE(event_id, student_id)` constraint
   (max 1 ticket/event/account) plus an idempotency key per request. **IP rate limiting at the gateway is only
   for spam/bot protection — never for identity or "block re-registration"** (shared campus Wi-Fi/NAT would
   false-positive). Do not add IP-based blocking as an identity mechanism.

   **Revised for multi-tenant login (§6.8 deviation):** any Microsoft account can register, so mitigations are
   (a) partial unique index `UNIQUE(mssv) WHERE mssv IS NOT NULL`; (b) mandatory `profileComplete` before
   `POST /api/reservations`; (c) `mssv_status [UNVERIFIED|VERIFIED]` for later manual verification (auto MSSV
   verification isn't possible without the school tenant — note this limitation in the report).

4. **RBAC + per-club multi-tenancy.** Three roles: `SINH_VIEN` (student), `ORGANIZER` (bound to a `club_id`),
   `SUPER_ADMIN` (school admin). An organizer's queries are always scoped by the `club_id` embedded in their
   JWT; the gateway and services enforce role + `club_id` on every request so one club cannot see another's
   data. Each organizer gets an individual account under a shared club (for audit-log traceability), not one
   shared login. School admin provisions/locks/deletes club accounts. (§6.11)

5. **QR safety.** QR payload is never raw data — it is HMAC-SHA256-signed (or a short-lived JWT) containing
   `ticket_id`, `event_id`, expiry. Check-in is a single-use atomic update: `SET status = CHECKED_IN WHERE
   status = 'VALID'` so a screenshotted ticket can't be scanned twice. (§6.6)

6. **Frontend/backend DTOs are generated, never hand-written.** Backend exposes OpenAPI via `springdoc-openapi`;
   frontend generates TS types with `openapi-typescript` (or `orval`) in CI. Do not hand-define shared types. (§6.7)

7. **CORS + JWT are centralized at the gateway**, not per-controller. Uses `allowCredentials: true` with
   explicit `allowedOrigins` (never `*`), JWT carried in an HTTP-only cookie. (§6.2)

8. **Resource-constrained by design.** Services must run on minimum published free-tier resources, so JVM flags
   are mandatory when running Spring Boot containers: `-XX:+UseSerialGC`, `-Xss256k` (or 512k),
   `-XX:MaxRAMPercentage=70.0`, plus `spring.main.lazy-initialization=true` and `server.tomcat.threads.max=20`.
   Do not store blobs/images in Postgres (Neon storage cap) — store metadata only. CloudAMQP free tier limits
   (~1M msg/month, ~20 connections, ~100 queues) require consumers fast enough to avoid backlog. (§6.5, §7)

## MVP cut lines (if timeline slips)

Per §9, the fallback order is: merge Notification-Service into Ticket-Service; trim Dashboard/ADW analytics.
Always preserve the core flow: **register → QR → check-in**.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **TVU-Event-Ticket-backend** (101 symbols, 94 relationships, 0 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/TVU-Event-Ticket-backend/context` | Codebase overview, check index freshness |
| `gitnexus://repo/TVU-Event-Ticket-backend/clusters` | All functional areas |
| `gitnexus://repo/TVU-Event-Ticket-backend/processes` | All execution flows |
| `gitnexus://repo/TVU-Event-Ticket-backend/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
