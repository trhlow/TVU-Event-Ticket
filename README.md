# TVU Event & Ticket

Distributed event-management and e-ticketing platform for TVU university clubs (CLB). See
[decuongTVUEventTicket.md](decuongTVUEventTicket.md) for the full project proposal (đề cương).

## Repo layout

```
backend/     Java Spring Boot (Maven multi-module) — API Gateway + 3 microservices. See backend/README.md.
frontend/    React + TypeScript — teammate's workspace (not yet added).
```

Each subproject has its own `README.md` / `CLAUDE.md` with build commands and conventions specific to that
stack. CI (`.github/workflows/ci.yml`) builds/tests only the backend module(s) actually touched by a change.
