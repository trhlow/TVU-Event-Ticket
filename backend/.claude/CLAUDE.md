# CLAUDE.md

**TVU Event & Ticket** — modular-monolith e-ticketing platform for TVU university clubs: event creation → registration → organizer approval (atomic) → QR-signed ticket + email → check-in → analytics. Backend capstone for a 3-person team.

## Docs & References

**Rules (always applied):**
- @.claude/rules/architecture.md
- @.claude/rules/workflow.md

**On-demand reference:**
- `.claude/docs/contracts.md` — feature-boundary contracts (JWT/JWKS/CSRF/QR/RabbitMQ)
- `.claude/docs/coding-standards.md` — package layout, DI, DTO ↔ OpenAPI
- `.claude/docs/deployment.md` — free-tier topology, JVM flags, CI/CD

## GitNexus — Code Intelligence

Indexed as **TVU-Event-Ticket-backend** (101 symbols, 94 relationships). **Always run impact analysis before editing** (`impact({target: "symbolName", direction: "upstream"})`) and **detect_changes() before commit** to verify scope.

**Skills (use when needed):**
- **Understand code:** `/gitnexus-exploring`
- **Blast radius:** `/gitnexus-impact-analysis`
- **Trace bugs:** `/gitnexus-debugging`
- **Refactor/rename:** `/gitnexus-refactoring`
- **Index/status:** `/gitnexus-cli`

**Stale index?** Run `node .gitnexus/run.cjs analyze` from project root (or `npx gitnexus analyze` if missing).

## Commit Message Convention

**DO NOT add Co-Authored-By line.** Format: `<type>: <subject>` + optional body (no trailer lines).
- Type: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
- Subject: imperative, under 70 chars
- Body (if needed): separate blank line, wrap ~72 chars
- **Example:** `feat: add RBAC guards to admin endpoints`
