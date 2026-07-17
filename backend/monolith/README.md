# Modular monolith migration

This module is the single JVM target for the TVU Event & Ticket application. Auth, events, ticketing,
analytics and notification are deployed together; the Maven feature libraries exist only to keep the
module boundaries explicit at build time. The API gateway is retired.

Run the current compact runtime with:

```bash
cd backend/infra
docker compose -f docker-compose.app.yml up -d --build --wait
```
