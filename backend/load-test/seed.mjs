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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// DEVIATION from the brief's literal code: the gateway rate-limits /api/auth/** and the ticket-service routes
// to replenishRate 10/burstCapacity 20 per api-gateway/src/main/resources/application.yml (spam/bot protection,
// not identity or business logic per its own comment). The seed script's concurrent batches of 20 students each
// fire 2 auth-service calls (login + profile patch), so 40 requests can land in the same instant and get 429s.
// This is unrelated to the capacity-not-enforced design point under test, so 429s are retried with backoff
// rather than failing the run.
async function fetchWithRetry(url, options, label) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt >= 8) return response;
    await response.text();
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 200 * 2 ** attempt + Math.random() * 100;
    await sleep(delay);
  }
}

async function call(path, { method = "GET", body, jar = {}, extraHeaders = {} } = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (Object.keys(jar).length) headers.Cookie = cookieHeader(jar);
  if (method !== "GET" && jar["XSRF-TOKEN"]) headers["X-XSRF-TOKEN"] = jar["XSRF-TOKEN"];
  const response = await fetchWithRetry(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, `${method} ${path}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return { json: text ? JSON.parse(text) : null, jar: parseCookies(response, jar) };
}

async function login(credential, displayName) {
  const response = await fetchWithRetry(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, displayName }),
  }, `login ${credential}`);
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
    // The controller requires this header (`@RequestHeader("Idempotency-Key")`, no default) and 400s
    // without it — the brief's literal snippet omits it, so it is added here per-student.
    extraHeaders: { "Idempotency-Key": crypto.randomUUID() },
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
// DEVIATION from the brief's literal code: TicketReservationService.submit() auto-creates the
// TicketInventory row via a non-atomic find-or-save (ticket-service/.../TicketReservationService.java:110-113)
// against a column with a UNIQUE constraint on event_id (V2__ticket_reservation_core.sql:3). Firing the very
// first batch of registrations concurrently races every request that sees "no inventory yet" into trying to
// insert it, and all but one fail with a generic 409 "The request conflicts with existing data"
// (DataIntegrityViolationException). This is unrelated to the capacity-not-enforced design point under test
// (it fires before capacity is ever consulted), so student 0 is seeded alone first to create the inventory
// row deterministically, then the remaining students are batched concurrently as originally written.
const reservationIds = [await seedStudent(0)];
process.stdout.write(`\rseeded ${reservationIds.length}/${STUDENTS} reservations`);
const BATCH = 20;
for (let start = 1; start < STUDENTS; start += BATCH) {
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
