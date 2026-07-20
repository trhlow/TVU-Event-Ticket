# TVU Event & Ticket

Modular-monolith event-management and e-ticketing platform for TVU university clubs. The delivered core flow is
**sign in → create/open event → register → organizer approval → signed QR ticket email → one-time check-in**.
See [decuongTVUEventTicket.md](decuongTVUEventTicket.md) for the original project proposal.

## Quick start

Prerequisites: Docker Desktop, Java 25, Maven, Node.js 22+.

```bash
# Terminal 1: start the single backend runtime and its local dependencies.
cd backend/infra
docker compose -f docker-compose.app.yml up -d --build --wait

# Terminal 2: start the frontend against the monolith.
cd ../../frontend
npm ci
VITE_API_BASE_URL=http://localhost:8080/api npm run dev
```

The monolith API is at `http://localhost:8080`; Mailpit is available at `http://localhost:8025` in the local
Compose stack. Stop the stack with `cd backend/infra && docker compose -f docker-compose.app.yml down`.

## Repository layout

```
backend/     Java 25 + Spring Boot 4 modular monolith, Docker Compose, load test
frontend/    React + TypeScript + Vite application
docs/        Close-out notes and frontend/backend integration constraints
```

Start with the relevant guide:

- [Backend guide](backend/README.md) — monolith runtime, container stack, testing and load test.
- [Frontend guide](frontend/README.md) — environment and production-safety checks.
- [Frontend API status](backend/docs/BACKEND_STATUS_FOR_FRONTEND.md) — current endpoint contracts and known gaps.
- [Deployment guide](backend/.claude/docs/deployment.md) — free-tier topology, readiness and production config.
- [Project close-out](docs/PROJECT_CLOSEOUT.md) — delivered scope, verification and remaining risks.
