# TVU Event & Ticket

Distributed event-management and e-ticketing platform for TVU university clubs (CLB). See
[decuongTVUEventTicket.md](decuongTVUEventTicket.md) for the full project proposal (đề cương).

## Frontend integration status

Frontend devs should start with [BACKEND_STATUS_FOR_FRONTEND.md](BACKEND_STATUS_FOR_FRONTEND.md).
It lists the current backend progress, live endpoints, request/response contracts, and known gaps.

## Repo layout

```
backend/     Java 25 + Spring Boot 4 Maven multi-module: API Gateway + auth/event/ticket/notification services.
frontend/    React + TypeScript + Vite workspace.
```

Each subproject has its own `README.md` with build commands and stack-specific notes. Backend agent/workflow
rules live under `backend/.claude/`. CI (`.github/workflows/ci.yml`) builds/tests only the backend module(s)
actually touched by a change.
