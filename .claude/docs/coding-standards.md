# Coding Standards — TVU Event & Ticket backend

Reference doc (read on demand, not auto-loaded). The authoritative invariants live in `../../CLAUDE.md`; this
file covers day-to-day code style.

> **Overrides the `java-springboot` skill.** That skill recommends *feature-based* packaging. This project
> deliberately uses **layer-based** packaging (each microservice is already a single bounded context, so the
> service boundary gives the "easy to split later" benefit). When the two conflict, follow this document.

## Package layout (layer-based)

Under `vn.edu.tvu.<svc>` (`event`, `ticket`, `notification`, `gateway`):

```
controller/   service/  (+ impl/)   repository/   domain/        # @Entity
dto/  ├── request/  └── response/    mapper/        # MapStruct
config/   security/   exception/     messaging/     # ticket-service only (RabbitMQ publisher)
```

The main `@SpringBootApplication` class sits in the **root** package (`vn.edu.tvu.<svc>`) so component scan
covers only our code.

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
