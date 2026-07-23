# Modular monolith migration

This module is the single JVM target for the TVU Event & Ticket application. Auth, events, ticketing,
analytics and notification are deployed together. Feature packages keep the boundaries explicit;
there is no API gateway or independently deployable backend service.

Run the current compact runtime with:

```bash
cd backend/infra
docker compose -f docker-compose.monolith.yml up -d --build --wait
```
