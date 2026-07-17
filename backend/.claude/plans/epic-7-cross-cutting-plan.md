# EPIC 7 Implementation Plan - cross-cutting: resource config, CI, monitoring, load test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Finish EPIC 7 — pin the resource-constrained runtime config, make CI actually run and refuse to pass
on silently-skipped tests, fix the compose boot-order race with real healthchecks, and prove under load that
concurrent approval never overbooks.

**Architecture:** Most of EPIC 7 already exists (Dockerfile, compose, CI matrix, actuator). This plan closes the
gaps. The load test runs locally against the `docker-compose.app.yml` stack: a dependency-free Node seed script
builds the fixture through the public API, then k6 (run via the `grafana/k6` container, nothing to install)
fires 500 concurrent approvals at an event with capacity 100.

**Tech Stack:** Spring Boot 4.0.7 / Java 25, Docker Compose, GitHub Actions, k6 (`grafana/k6` image), Node 22
(built-in `fetch`, no npm packages).

**Spec:** `backend/.claude/plans/epic-7-cross-cutting.md`

## Global Constraints

- `JAVA_HOME` must point at JDK 25 (`/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot`). The machine
  default is JDK 21 and fails with `release version 25 not supported`.
- Run Maven from `backend/`. **Always `mvn clean test` / `mvn clean verify`, never the bare form** — stale
  bytecode has produced a false green in this repo.
- Testcontainers tests **skip silently** without Docker. Any run whose output does not say `Skipped: 0` proves
  nothing.
- No `Co-Authored-By` trailers and no AI attribution in commit messages, ever. Verify with
  `git log --format=%B` after committing.
- Commit convention: `feat(<service>): ...`, `fix(<service>): ...`, `chore: ...`, `test: ...`, `docs: ...`.
- All work happens on branch `hlow`. Do not create branches or worktrees. Do not push.
- `git add` only the files a step names, by explicit path. Never `git add -A`.
- **Do NOT add `spring.main.lazy-initialization` to any `application.yml`.** It stays a Dockerfile `ENV`. It
  applies to tests otherwise, deferring bean-wiring failures from startup to first use — a false-green
  mechanism this project has already been bitten by.
- **If the load test finds real overbooking, that is a finding to report, not something to patch here.** Do not
  modify EPIC 4's approval logic under this plan.

## Task order

Tasks 1, 2 and 3 are independent of each other. Task 5 depends on Task 4, and Task 4 benefits from Task 2's
healthchecks (a reliable "stack is ready" signal). Run them in order: 1 → 2 → 3 → 4 → 5.

## API contract the load test depends on (verified against the code, use verbatim)

- Everything goes through the gateway at `http://localhost:8080`.
- **Auth is cookie-based; the JWT is NOT in the response body.** `POST /api/auth/login` with
  `{"credential": "<email>", "displayName": "<name>"}` returns `{"profile": {...}}` and sets two cookies:
  `TVU_AUTH` (the JWT, httpOnly) and `XSRF-TOKEN`.
- **Every mutation except login requires CSRF:** send the `XSRF-TOKEN` cookie's value back in the
  `X-XSRF-TOKEN` header. The gateway compares them (`SignedCsrfGlobalFilter`); mismatch or absence is a 403.
- The dev profile's `DevStubIdentityProvider` accepts any string containing `@` as a credential and derives the
  identity from it, so arbitrary student accounts can be created by logging in.
- The bootstrap SUPER_ADMIN is `admin@example.com` in the dev profile. Login resolves users by email first, so
  logging in with that address yields SUPER_ADMIN.
- `POST /api/admin/clubs` → `{"name": "...", "description": "..."}` → returns a club with `id`.
- `POST /api/admin/organizers` → `{"email": "...", "displayName": "...", "clubId": "<uuid>"}`.
- `POST /api/events` (ORGANIZER) → `{"title","description","capacity","registrationOpenAt",
  "registrationCloseAt","startAt","endAt","location"}`, all timestamps ISO-8601 → returns an event with `id`.
- `PATCH /api/events/{id}/status` → `{"status": "OPEN"}`. `EventStatus` is `DRAFT | OPEN | CLOSED`.
- `PATCH /api/auth/me/profile` → `{"mssv": "...", "classCode": "..."}` — **required before a student may
  register** (`submit()` rejects a blank `mssv` with 409). `mssv` is UNIQUE, so every student needs a distinct
  one. This re-issues the JWT cookie with the `mssv` claim.
- `POST /api/reservations` (SINH_VIEN) → `{"eventId": "<uuid>"}` plus an `Idempotency-Key` header.
  **Registration does NOT enforce capacity** — 500 PENDING reservations against capacity 100 is expected and is
  what makes the test meaningful. The ticket inventory is auto-created on the first registration, so it does
  not need to be created explicitly.
- One reservation per student per event is enforced, so 500 distinct students yield 500 reservations.
- `GET /api/reservations/pending` (ORGANIZER) → the pending reservations for the organizer's club.
- `PATCH /api/reservations/{id}/approve` (ORGANIZER) → **this is the path under test.** It pairs a Redis `DECR`
  with a database transaction; this is where overbooking would occur.
- `GET /api/ticketing/events/{id}/availability` → `{eventId, totalCapacity, approvedCount, remaining}` (public).

---

### Task 1: T7.1 — pin the resource-constrained runtime config

**Files:**
- Modify: `backend/auth-service/src/main/resources/application.yml`
- Modify: `backend/event-service/src/main/resources/application.yml`
- Modify: `backend/ticket-service/src/main/resources/application.yml`
- Modify: `backend/notification-service/src/main/resources/application.yml`
- Modify: `backend/Dockerfile`
- **Do NOT modify** `backend/api-gateway/src/main/resources/application.yml` — see below.

**Interfaces:**
- Produces: no code interfaces. Later tasks assume the Dockerfile still builds with `ARG MODULE`.

**Background you need:**

The master plan's invariant #8 asks for `spring.main.lazy-initialization: true` and
`server.tomcat.threads.max: 20` in every `application.yml`. Only the second one goes there — see the Global
Constraints for why lazy-init must stay a Dockerfile `ENV`.

`api-gateway` is **reactive** (Spring WebFlux / Netty), not Tomcat. `server.tomcat.threads.max` is meaningless
there and must NOT be added to it — a Tomcat key in a Netty app is dead config that misleads the next reader.
So this task edits four `application.yml` files, not five. Read each file first and place the key under the
existing top-level `server:` block if one exists; create it if not.

- [ ] **Step 1: Add the Tomcat thread cap to the four servlet services**

In each of `auth-service`, `event-service`, `ticket-service`, `notification-service`'s `application.yml`, add:

```yaml
server:
  tomcat:
    threads:
      max: 20
```

If the file already has a top-level `server:` key, merge into it rather than adding a second one — a duplicate
top-level key silently overrides the first in YAML.

- [ ] **Step 2: Verify each service still starts and the setting took effect**

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl auth-service,event-service,ticket-service,notification-service clean test
```

Expected: BUILD SUCCESS, `Skipped: 0`. The context-loading tests prove the YAML is valid and the property
binds; an invalid key would fail startup.

- [ ] **Step 3: Correct the thread stack size in the Dockerfile**

In `backend/Dockerfile`, change:

```dockerfile
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss256k -XX:MaxRAMPercentage=70.0"
```

to:

```dockerfile
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xss512k -XX:MaxRAMPercentage=70.0"
```

The master plan specifies 512k. 256k is aggressive for Hibernate and Spring proxy call stacks and risks a
`StackOverflowError` on deep chains.

- [ ] **Step 4: Verify the image still builds and the flags apply**

```bash
cd backend && docker build --build-arg MODULE=auth-service -t tvu-auth-t71 .
docker run --rm tvu-auth-t71 java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -i threadstacksize
```

Expected: the build succeeds, and `ThreadStackSize` reports `512`.

If Docker Desktop is not running, start it — this step cannot be skipped or assumed.

- [ ] **Step 5: Commit**

```bash
git add backend/auth-service/src/main/resources/application.yml \
        backend/event-service/src/main/resources/application.yml \
        backend/ticket-service/src/main/resources/application.yml \
        backend/notification-service/src/main/resources/application.yml \
        backend/Dockerfile
git commit -m "chore(backend): cap tomcat threads and correct the JVM thread stack size"
```

---

### Task 2: T7.5 — healthchecks, readiness gating, and monitoring notes

**Files:**
- Modify: `backend/infra/docker-compose.app.yml`
- Modify: `backend/.claude/docs/deployment.md`

**Interfaces:**
- Produces: a compose stack where `docker compose up --wait` returns only once every service is genuinely
  healthy. Task 4's runner script depends on that.

**Background you need:**

`docker-compose.app.yml` currently uses bare `depends_on`, which waits only for a container to *start*, not to
be *ready*. This is the exact race that crashed notification-service on boot in EPIC 5. The symptom was fixed
by removing an eager RabbitMQ connect; the race itself is still there for every service.

All five services already expose `/actuator/health`, and Spring Boot auto-configures the db/redis/rabbit health
indicators wherever the matching starter is present — so the endpoint already reflects dependency health with
no extra wiring.

Ports inside the compose network: api-gateway 8080, event-service 8081, ticket-service 8082,
notification-service 8083, auth-service 8084.

The service images are built `FROM eclipse-temurin:25-jre`. **That image has no `curl` and no `wget`** — a
curl-based healthcheck fails with "executable not found" and reports unhealthy forever. It does have `bash`, so
the check uses bash's `/dev/tcp`. I verified all of this empirically before writing this plan: the image
contents, the exact YAML below marking a container `(healthy)` against a `{"status":"UP"}` endpoint, **and**
the same check correctly reporting `(unhealthy)` against `{"status":"DOWN"}` — a healthcheck that cannot fail
would be worse than none.

Note the YAML quoting: the check is written as a **list form** with single-quoted inner strings. A
double-quoted YAML scalar would interpret `\r\n` itself and corrupt the `printf`. Use the form below verbatim.

- [ ] **Step 1: Add healthchecks to the three dependencies**

In `backend/infra/docker-compose.app.yml`, add to the `postgres`, `redis` and `rabbitmq` services. Note these
are declared via `extends` from `docker-compose.yml`; add the `healthcheck` key alongside the existing
`extends` key in `docker-compose.app.yml` (a compose service may both extend and add its own keys).

```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tvu"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s
```

for postgres;

```yaml
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12
```

for redis; and

```yaml
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s
```

for rabbitmq. Check the postgres user in `docker-compose.yml` and use the real one rather than assuming `tvu`.

- [ ] **Step 2: Add healthchecks to the five services**

Add this to each service, substituting that service's own port (api-gateway 8080, event-service 8081,
ticket-service 8082, notification-service 8083, auth-service 8084). This is the exact form I verified; copy the
quoting precisely.

```yaml
    healthcheck:
      test:
        - CMD
        - bash
        - -c
        - 'exec 3<>/dev/tcp/localhost/8082 && printf ''GET /actuator/health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'' >&3 && grep -q ''"status":"UP"'' <&3'
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 40s
```

The `start_period: 40s` matters: these are JVM apps, and a cold start takes tens of seconds. Too short a period
marks a still-booting service as failed.

- [ ] **Step 3: Gate every `depends_on` on health**

Convert each service's `depends_on` from the short list form to the long form. For example, ticket-service's:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
```

and api-gateway's, which depends on other services:

```yaml
    depends_on:
      auth-service:
        condition: service_healthy
      event-service:
        condition: service_healthy
      ticket-service:
        condition: service_healthy
      redis:
        condition: service_healthy
```

Apply the same transformation to `auth-service`, `event-service` and `notification-service`, preserving exactly
which services each currently depends on — read the file, do not guess.

- [ ] **Step 4: Verify the whole stack comes up healthy from cold**

```bash
cd backend/infra
docker compose -f docker-compose.app.yml down -v
docker compose -f docker-compose.app.yml up -d --build --wait
docker compose -f docker-compose.app.yml ps
```

Expected: `up --wait` exits 0, and every service shows `(healthy)`. This is the real test of this task — if
`--wait` hangs or a service never goes healthy, the healthcheck is wrong. Fix it; do not lengthen the timeout
to hide a broken check.

Then confirm the gateway actually serves:

```bash
curl -s http://localhost:8080/actuator/health
```

Expected: a JSON body with `"status":"UP"`.

- [ ] **Step 5: Tear the stack down**

```bash
cd backend/infra && docker compose -f docker-compose.app.yml down
```

- [ ] **Step 6: Document monitoring in deployment.md**

Read `backend/.claude/docs/deployment.md` first and match its existing structure and tone. Add a short section
covering:
- The UptimeRobot ping target: `GET /actuator/health` on the gateway, which transitively reflects db, Redis and
  RabbitMQ health because Spring Boot's auto-configured indicators are aggregated into it.
- Container log rotation: Docker's default `json-file` driver grows without bound; set
  `max-size`/`max-file` via the daemon's `log-opts` or per-service `logging:` config on the deployment host.
- That the compose stack now gates startup on health, so `docker compose up --wait` is the correct way to bring
  it up and know it is ready.

- [ ] **Step 7: Commit**

```bash
git add backend/infra/docker-compose.app.yml backend/.claude/docs/deployment.md
git commit -m "fix(infra): gate service startup on real healthchecks and document monitoring"
```

No `Dockerfile` change is needed for the healthcheck — `bash` is already present in the runtime image.

---

### Task 3: T7.4 — make CI run, build images, and refuse to pass on skipped tests

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: no code interfaces.

**Background you need:**

`ci.yml` currently triggers on `push` to `main` and PRs targeting `main`. All development happens on `hlow`, so
**EPIC 5, 6 and UI have never been through CI even once** — every green was a manual local run.

The `build` job runs `mvn -B -pl ${{ matrix.module }} -am verify` per changed module. GitHub's
`ubuntu-latest` runner has Docker, so Testcontainers works there — but `@Testcontainers(disabledWithoutDocker
= true)` means that if Docker were ever unavailable, the suite would **skip silently and report success**.
There is no Testcontainers flag that inverts this, so the guard has to be external: read the surefire XML and
fail on any skip.

Do not remove the annotation. Removing it breaks the local build for a teammate without Docker; the CI guard
gets what actually matters without that cost.

- [ ] **Step 1: Run CI on the working branch**

Change the trigger block:

```yaml
on:
  push:
    branches: [main, hlow]
  pull_request:
    branches: [main]
```

- [ ] **Step 2: Fail the build if any test was skipped**

Add this step to the `build` job, immediately after the existing "Build & test" step:

```yaml
      - name: Fail if any test was skipped
        working-directory: backend
        run: |
          reports=$(find ${{ matrix.module }}/target/surefire-reports -name 'TEST-*.xml' 2>/dev/null || true)
          if [ -z "$reports" ]; then
            echo "No surefire reports found for ${{ matrix.module }} — the suite did not run."
            exit 1
          fi
          skipped=$(grep -ho 'skipped="[0-9]*"' $reports | grep -o '[0-9]*' | awk '{s+=$1} END {print s+0}')
          if [ "$skipped" -ne 0 ]; then
            echo "$skipped test(s) were skipped. Testcontainers tests skip silently without Docker —"
            echo "a skipped run is not a passing run. Failing the build."
            grep -l 'skipped="[1-9]' $reports || true
            exit 1
          fi
          echo "No tests were skipped."
```

The "no reports at all" branch matters as much as the skip count: if the suite never ran, `find` returns
nothing and a naive sum would be `0`, which would read as success.

- [ ] **Step 3: Build the Docker image for each changed module**

Add this step to the `build` job, after the skip guard:

```yaml
      - name: Build Docker image for ${{ matrix.module }}
        working-directory: backend
        run: docker build --build-arg MODULE=${{ matrix.module }} -t tvu/${{ matrix.module }}:ci .
```

Build only — no registry push. This proves the Dockerfile still works without needing registry credentials or
a tagging scheme the project has no deployment target for.

- [ ] **Step 4: Validate the workflow file parses**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"
```

Expected: `YAML OK`. If `python` is unavailable, use `docker run --rm -v "$PWD:/w" -w /w mikefarah/yq e '.' .github/workflows/ci.yml > /dev/null && echo "YAML OK"`.

- [ ] **Step 5: Verify the skip guard's logic locally against real reports**

The guard is shell, so test it against real surefire output rather than trusting it by inspection:

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.3.9-hotspot"
cd backend && mvn -pl auth-service clean test
skipped=$(grep -ho 'skipped="[0-9]*"' $(find auth-service/target/surefire-reports -name 'TEST-*.xml') | grep -o '[0-9]*' | awk '{s+=$1} END {print s+0}')
echo "skipped total = $skipped"
```

Expected with Docker running: `skipped total = 0`.

Then prove the guard actually catches a skip — stop Docker Desktop, re-run
`mvn -pl auth-service clean test`, and confirm the same command now reports a **non-zero** total. Restart
Docker afterwards. Paste both outputs into your report: a guard never seen firing is not a verified guard.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run on hlow, build module images, and fail on silently skipped tests"
```

---

### Task 4: T7.6a — the load-test seed script

**Files:**
- Create: `backend/load-test/seed.mjs`
- Create: `backend/load-test/.gitignore`

**Interfaces:**
- Produces: `backend/load-test/seed.mjs`, run as `node seed.mjs`, which writes
  `backend/load-test/.seed.json`:

```json
{
  "baseUrl": "http://localhost:8080",
  "eventId": "<uuid>",
  "capacity": 100,
  "organizer": { "cookie": "TVU_AUTH=...; XSRF-TOKEN=...", "xsrf": "<xsrf token value>" },
  "reservationIds": ["<uuid>", "..."]
}
```

Task 5's k6 script reads exactly this file and these field names.

**Background you need:**

Read the "API contract the load test depends on" section at the top of this plan — it has every endpoint,
payload and gotcha, verified against the code. The three that will bite you:

1. **The JWT is in the `TVU_AUTH` cookie, not the response body.** Node's `fetch` has no cookie jar; parse
   `response.headers.getSetCookie()` yourself.
2. **Every mutation except login needs the `X-XSRF-TOKEN` header** set to the `XSRF-TOKEN` cookie's value.
3. **A student cannot register until `PATCH /api/auth/me/profile` sets a unique `mssv`** — and that call
   re-issues the cookies, so you must re-capture them afterwards.

Node 22 is available (the frontend uses it). Use built-in `fetch` only — do not add npm packages, and do not
create a `package.json` here.

- [ ] **Step 1: Create the gitignore for run artifacts**

`backend/load-test/.gitignore`:

```gitignore
.seed.json
results.json
```

The seed output and raw k6 output are per-run scratch, not source. The human-readable report Task 5 produces
IS committed.

- [ ] **Step 2: Write the seed script**

`backend/load-test/seed.mjs`:

```javascript
// Seeds one event (capacity 100) with 500 PENDING reservations, through the public API only.
// Registration deliberately does not enforce capacity — that is what makes the approval race testable.
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const CAPACITY = Number(process.env.CAPACITY ?? 100);
const STUDENTS = Number(process.env.STUDENTS ?? 500);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const RUN = Date.now();

function parseCookies(response, previous = {}) {
  const jar = { ...previous };
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) jar[name] = value;
  }
  return jar;
}

const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function call(path, { method = "GET", body, jar = {} } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (Object.keys(jar).length) headers.Cookie = cookieHeader(jar);
  if (method !== "GET" && jar["XSRF-TOKEN"]) headers["X-XSRF-TOKEN"] = jar["XSRF-TOKEN"];
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return { json: text ? JSON.parse(text) : null, jar: parseCookies(response, jar) };
}

async function login(credential, displayName) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, displayName }),
  });
  if (!response.ok) {
    throw new Error(`login ${credential} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  await response.text();
  return parseCookies(response);
}

async function seedStudent(index) {
  const email = `load-${RUN}-student-${index}@tvu.edu.vn`;
  let jar = await login(email, `Student ${index}`);
  // Registration is rejected with 409 until the profile carries an mssv, and this call re-issues the
  // cookies with the mssv claim — so the new jar must replace the old one.
  ({ jar } = await call("/api/auth/me/profile", {
    method: "PATCH",
    jar,
    body: { mssv: `L${RUN}${String(index).padStart(4, "0")}`, classCode: "DA20TTA" },
  }));
  const { json } = await call("/api/reservations", {
    method: "POST",
    jar,
    body: { eventId: eventId },
  });
  return json.id;
}

// --- fixture ---------------------------------------------------------------

const adminJar = await login(ADMIN_EMAIL, "Bootstrap Admin");
const { json: club } = await call("/api/admin/clubs", {
  method: "POST",
  jar: adminJar,
  body: { name: `Load Test Club ${RUN}`, description: "Created by the EPIC 7 load test" },
});

const organizerEmail = `load-${RUN}-organizer@tvu.edu.vn`;
await call("/api/admin/organizers", {
  method: "POST",
  jar: adminJar,
  body: { email: organizerEmail, displayName: "Load Test Organizer", clubId: club.id },
});

const organizerJar = await login(organizerEmail, "Load Test Organizer");
const now = Date.now();
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
const { json: event } = await call("/api/events", {
  method: "POST",
  jar: organizerJar,
  body: {
    title: `Load Test Event ${RUN}`,
    description: "Capacity-race scenario for EPIC 7",
    capacity: CAPACITY,
    registrationOpenAt: iso(-60 * 60 * 1000),
    registrationCloseAt: iso(24 * 60 * 60 * 1000),
    startAt: iso(48 * 60 * 60 * 1000),
    endAt: iso(50 * 60 * 60 * 1000),
    location: "TVU Hall",
  },
});
const eventId = event.id;

await call(`/api/events/${eventId}/status`, {
  method: "PATCH",
  jar: organizerJar,
  body: { status: "OPEN" },
});

// The inventory is auto-created on the first registration, so it is not created explicitly here.
const reservationIds = [];
const BATCH = 20;
for (let start = 0; start < STUDENTS; start += BATCH) {
  const batch = [];
  for (let i = start; i < Math.min(start + BATCH, STUDENTS); i++) batch.push(seedStudent(i));
  reservationIds.push(...(await Promise.all(batch)));
  process.stdout.write(`\rseeded ${reservationIds.length}/${STUDENTS} reservations`);
}
process.stdout.write("\n");

if (reservationIds.length !== STUDENTS) {
  throw new Error(`expected ${STUDENTS} reservations, got ${reservationIds.length}`);
}

writeFileSync(
  new URL("./.seed.json", import.meta.url),
  JSON.stringify(
    {
      baseUrl: BASE,
      eventId,
      capacity: CAPACITY,
      organizer: { cookie: cookieHeader(organizerJar), xsrf: organizerJar["XSRF-TOKEN"] },
      reservationIds,
    },
    null,
    2,
  ),
);
console.log(`seeded event ${eventId} (capacity ${CAPACITY}) with ${reservationIds.length} PENDING reservations`);
```

Note `seedStudent` references `eventId` before its declaration in source order but is only *called* after it is
assigned, which is valid for a module-scope `const` accessed at call time. If you find this fragile, hoist
`eventId` to a `let` declared above `seedStudent` — but do not restructure further.

- [ ] **Step 3: Bring the stack up**

```bash
cd backend/infra
docker compose -f docker-compose.app.yml up -d --build --wait
```

Expected: exits 0 with every service healthy (Task 2 made this reliable).

- [ ] **Step 4: Run the seed and verify it against the API, not just its own output**

```bash
cd backend/load-test && node seed.mjs
```

Expected: `seeded 500/500 reservations` and a final line naming the event id.

Now verify independently — the script's own success message is not evidence:

```bash
cd backend/load-test
EVENT=$(node -e "console.log(require('./.seed.json').eventId)")
curl -s "http://localhost:8080/api/ticketing/events/$EVENT/availability"
```

Expected: `totalCapacity` is 100, `approvedCount` is 0, `remaining` is 100 — 500 pending registrations must not
have consumed any capacity. If `approvedCount` is not 0, stop and report: registration is consuming capacity,
which contradicts the design this whole test rests on.

- [ ] **Step 5: Commit**

```bash
git add backend/load-test/seed.mjs backend/load-test/.gitignore
git commit -m "test(load): add the EPIC 7 load-test fixture seed script"
```

---

### Task 5: T7.6b — the k6 approval-race scenario, the runner, and the report

**Depends on:** Task 4.

**Files:**
- Create: `backend/load-test/approval-capacity.js`
- Create: `backend/load-test/run.sh`
- Create: `backend/load-test/README.md`
- Create: `backend/load-test/RESULTS.md`

**Interfaces:**
- Consumes: `backend/load-test/.seed.json` written by Task 4's `seed.mjs`, with fields `baseUrl`, `eventId`,
  `capacity`, `organizer.cookie`, `organizer.xsrf`, `reservationIds`.

**Background you need:**

This is the point of EPIC 7. Approval pairs a Redis `DECR` with a database transaction; if that pairing is
wrong under concurrency, the system issues more tickets than the event's capacity — the single worst bug this
project could ship. 500 approvals are fired at an event with capacity 100.

**Counting tickets alone is not enough.** A request that fails silently would make an overbooked run look
correct. The run is only valid if `approved + soldOut == 500` — every request must be accounted for.

k6 runs via `docker run grafana/k6`, so nothing is installed. Inside that container the gateway is not
`localhost`; reach the host with `host.docker.internal` (Docker Desktop on Windows/macOS provides it).

- [ ] **Step 1: Write the k6 scenario**

`backend/load-test/approval-capacity.js`:

```javascript
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

const seed = JSON.parse(open("./.seed.json"));
// Inside the k6 container the gateway is on the host, not on this container's loopback.
const BASE = __ENV.K6_BASE_URL ?? seed.baseUrl.replace("localhost", "host.docker.internal");

const approved = new Counter("approvals_succeeded");
const soldOut = new Counter("approvals_sold_out");
const unexpected = new Counter("approvals_unexpected_status");

export const options = {
  scenarios: {
    approve: {
      executor: "shared-iterations",
      vus: 50,
      iterations: seed.reservationIds.length,
      maxDuration: "3m",
    },
  },
  thresholds: {
    // A sold-out rejection is a correct outcome, so http_req_failed is not a useful signal here.
    approvals_unexpected_status: ["count==0"],
    http_req_duration: ["p(95)<2000"],
  },
};

export default function () {
  const id = seed.reservationIds[exec.scenario.iterationInTest];
  const response = http.patch(
    `${BASE}/api/reservations/${id}/approve`,
    null,
    {
      headers: {
        Cookie: seed.organizer.cookie,
        "X-XSRF-TOKEN": seed.organizer.xsrf,
        "Content-Type": "application/json",
      },
      tags: { name: "PATCH /api/reservations/{id}/approve" },
    },
  );

  if (response.status === 200) {
    approved.add(1);
  } else if (response.status === 409) {
    soldOut.add(1);
  } else {
    unexpected.add(1);
    console.error(`unexpected ${response.status} for ${id}: ${String(response.body).slice(0, 200)}`);
  }

  check(response, {
    "approval resolved cleanly (200 or 409, never 5xx)": (r) => r.status === 200 || r.status === 409,
  });
}
```

- [ ] **Step 2: Write the runner**

`backend/load-test/run.sh`:

```bash
#!/usr/bin/env bash
# One command: bring the stack up, seed the fixture, hammer approvals, reconcile the result.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$HERE/../infra"
BASE="${BASE_URL:-http://localhost:8080}"

echo "==> bringing the stack up"
docker compose -f "$INFRA/docker-compose.app.yml" up -d --build --wait

echo "==> seeding the fixture"
( cd "$HERE" && node seed.mjs )

EVENT=$(node -e "console.log(require('$HERE/.seed.json').eventId)")
CAPACITY=$(node -e "console.log(require('$HERE/.seed.json').capacity)")
TOTAL=$(node -e "console.log(require('$HERE/.seed.json').reservationIds.length)")

echo "==> before: $(curl -s "$BASE/api/ticketing/events/$EVENT/availability")"

echo "==> running k6 ($TOTAL concurrent approvals against capacity $CAPACITY)"
docker run --rm -i \
  -v "$HERE:/scripts" -w /scripts \
  --add-host=host.docker.internal:host-gateway \
  grafana/k6 run --summary-export=/scripts/results.json approval-capacity.js

AFTER=$(curl -s "$BASE/api/ticketing/events/$EVENT/availability")
echo "==> after: $AFTER"

APPROVED_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).approvedCount)" "$AFTER")
REMAINING=$(node -e "console.log(JSON.parse(process.argv[1]).remaining)" "$AFTER")

echo
echo "==> verdict"
FAILED=0
[ "$APPROVED_COUNT" -eq "$CAPACITY" ] || { echo "FAIL: approvedCount=$APPROVED_COUNT, expected exactly $CAPACITY (OVERBOOKING or under-issue)"; FAILED=1; }
[ "$REMAINING" -eq 0 ] || { echo "FAIL: remaining=$REMAINING, expected 0"; FAILED=1; }
[ "$REMAINING" -ge 0 ] || { echo "FAIL: remaining is negative"; FAILED=1; }
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: exactly $CAPACITY tickets issued, remaining 0, no overbooking."
fi
echo "k6 counters (approvals_succeeded + approvals_sold_out must equal $TOTAL) are in $HERE/results.json"
exit "$FAILED"
```

Make it executable: `chmod +x backend/load-test/run.sh`.

- [ ] **Step 3: Run it for real**

```bash
cd backend/load-test && ./run.sh
```

This is the task's actual deliverable. Capture the complete output.

**Do not proceed until you have a real run.** If `approvedCount` is not exactly 100, or `remaining` is not 0,
or the counters do not reconcile to 500, or any status other than 200/409 appears — **that is a finding, and
this plan forbids you from patching the approval logic to make it pass.** Report it with the evidence and stop.

If the run fails for a mechanical reason (k6 cannot reach `host.docker.internal`, the seed expired the
organizer's 15-minute JWT, the container cannot read `.seed.json`), fix the harness and re-run. Distinguish
clearly in your report between a harness problem you fixed and a system finding you must not fix.

- [ ] **Step 4: Reconcile the counters explicitly**

```bash
cd backend/load-test
node -e "
const r = require('./results.json');
const ok = r.metrics.approvals_succeeded?.count ?? 0;
const sold = r.metrics.approvals_sold_out?.count ?? 0;
const bad = r.metrics.approvals_unexpected_status?.count ?? 0;
console.log('approved=' + ok, 'soldOut=' + sold, 'unexpected=' + bad, 'total=' + (ok + sold + bad));
"
```

Expected: `approved=100 soldOut=400 unexpected=0 total=500`. If the total is not 500, requests vanished — say
so; do not round the numbers into agreement.

- [ ] **Step 5: Write the report**

`backend/load-test/RESULTS.md` — record the real measured numbers from your run, not the expected ones. Include:
the date, the scenario (500 concurrent approvals, capacity 100, 50 VUs), the measured `approvedCount`,
`remaining`, the three counters and their reconciliation, p95 and error rate from k6's summary, the hardware it
ran on, and the verdict. If anything was surprising, write that down too.

- [ ] **Step 6: Write the README**

`backend/load-test/README.md`: what the test proves and why approval (not registration) is the path under test;
how to run it (`./run.sh`, prerequisites: Docker Desktop running, Node 22); how to change the numbers
(`CAPACITY`, `STUDENTS`, `BASE_URL` env vars); how to read the verdict; and an explicit note that it is
deliberately **not** in CI, because a CI runner's p95 is meaningless and standing up five services per PR is
slow for no gain.

- [ ] **Step 7: Tear down**

```bash
cd backend/infra && docker compose -f docker-compose.app.yml down -v
```

- [ ] **Step 8: Commit**

```bash
git add backend/load-test/approval-capacity.js backend/load-test/run.sh \
        backend/load-test/README.md backend/load-test/RESULTS.md
git commit -m "test(load): prove concurrent approval never overbooks under load"
```

---

## Definition of done

- The four servlet services cap Tomcat threads at 20; the gateway is untouched (it is reactive).
- The Dockerfile uses `-Xss512k` and still builds.
- `docker compose -f docker-compose.app.yml up --wait` returns only when every service is genuinely healthy.
- CI runs on `hlow`, builds a Docker image per changed module, and **fails** if any test was skipped — with the
  guard observed firing, not merely written.
- `backend/load-test/run.sh` seeds and runs the approval race in one command.
- A committed `RESULTS.md` records real measured figures showing exactly 100 tickets issued from 500 concurrent
  approvals, `remaining` 0, and `approved + soldOut == 500`.
