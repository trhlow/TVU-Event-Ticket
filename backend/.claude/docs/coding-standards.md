# Coding Standards — TVU Event & Ticket backend

Reference doc (read on demand, not auto-loaded). The authoritative invariants live in `../../CLAUDE.md`; this
file covers day-to-day code style.

> **Overrides the `java-springboot` skill.** That skill recommends *feature-based* packaging. This project
> uses **both**: feature-based at the top level (`vn.edu.tvu.auth`, `.event`, `.ticket`, `.notification` —
> each a bounded context, and the seam to split along if the monolith is ever broken up again), and
> layer-based *inside* each feature. When the skill and this document conflict, follow this document.

## Package layout (layer-based)

Under `vn.edu.tvu.<feature>` (`auth`, `event`, `ticket`, `notification`):

```
controller/   service/  (+ impl/)   repository/   domain/        # @Entity
dto/  ├── request/  └── response/    mapper/        # MapStruct
config/   security/   exception/     messaging/     # ticket only (RabbitMQ publisher)
```

Two packages sit outside that scheme:

- `vn.edu.tvu.shared` — types more than one feature needs (`web.ErrorResponse`, `web.PageResponse`,
  `web.PageableFactory`, `domain.UserRole`, `audit.AuditRecorder`, `messaging.*`). Beanless types only;
  it is deliberately **not** component-scanned. Put something here when a second feature needs it, not
  in anticipation.
- `vn.edu.tvu.monolith` — the composition root, and the only place allowed to depend on two features at
  once (`stats` composes across auth/event/ticket; `ticket.InProcessEventLookup` implements ticket's
  `EventLookup` by calling `EventService`). A feature reaching directly into another feature's package
  belongs here instead.

`MonolithApplication` sits in `vn.edu.tvu` and scans only `vn.edu.tvu.monolith`; each feature is pulled
in explicitly by `@Import` of its `*FeatureConfiguration`, which owns that feature's component scan.

## Dependency injection

- **Constructor injection only**, fields `private final`. No field `@Autowired`.
- One `@Service`/`@RestController`/`@Repository` per responsibility; keep controllers thin (validation +
  delegation), business logic in services.

## Configuration & profiles

- `application.yml` = common config, default profile `dev`.
- `application-dev.yml` = localhost values (docker-compose).
- `application-prod.yml` = everything from **env vars, no fallback defaults**.
- Prefer `@ConfigurationProperties` (type-safe) over scattered `@Value`.

## DTOs & API contract

- Backend exposes OpenAPI via `springdoc-openapi`. The frontend generates TS types from that spec.
- **Do not hand-write DTOs that form the frontend contract.** Keep request/response DTOs in `dto/request` and
  `dto/response`; map to/from entities with MapStruct mappers in `mapper/` — never expose `@Entity` directly.

## Error handling

- Centralize in the `exception/` package via `@RestControllerAdvice` returning a consistent error body.
- Throw domain exceptions from services; translate to HTTP status in the advice, not in controllers.

## Secrets

- **Environment variables only.** Never a literal secret in code or committed config. `application-prod.yml`
  references `${...}` with no defaults. (A PreToolUse hook blocks commits/commands that embed secrets — see
  `.claude/hooks/block-secrets.sh`.)

## Migrations

- Flyway owns the schema; entities validated against it. See the `db-migration` skill. Migrations are
  immutable once applied.

## Testing

- JUnit 5 + AssertJ; follow the `java-junit` / `spring-boot-testing` skills (project is on Spring Boot 3.3 /
  JUnit 5 — prefer JUnit 5 forms if a skill shows newer APIs). The overbooking-under-concurrency test is
  mandatory, not optional (see `agents/qa-tester.md`).
