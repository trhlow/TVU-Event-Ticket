import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

const seed = JSON.parse(open("./.seed.json"));

// DEVIATION from the task brief's literal script, made deliberately and documented here and in
// RESULTS.md: this scenario hits ticket-service DIRECTLY (host.docker.internal:8082), not the gateway.
//
// Why: the gateway rate-limits every /api/reservations/** call to replenishRate 10 / burstCapacity 20
// (api-gateway/src/main/resources/application.yml), keyed PER PRINCIPAL
// (GatewaySecurityConfig#clientKeyResolver keys on the JWT subject). Every approval in this run
// authenticates as the same organizer, so all 500 requests would share ONE token bucket through the
// gateway no matter how many k6 VUs fire them. A first attempt paced itself under that limit
// (constant-arrival-rate at 8/sec) to avoid drowning in 429s -- but at ~12ms response times that pacing
// meant requests essentially never overlapped in time. That proved capacity *accounting* is correct; it
// did NOT exercise the Redis DECR + DB-transaction pairing under real concurrency, which is the one thing
// this epic exists to demonstrate. A serialized trickle is not load.
//
// The rate limiter lives in the gateway; the race being tested lives in ticket-service. They are
// separable, and docker-compose.app.yml already publishes ticket-service directly on 8082. So: seeding
// still goes through the gateway (it exercises the real registration path end-to-end, and the gateway's
// rate limiter is legitimate anti-abuse protection for that path -- not a bug, and not being disabled).
// Only the approval hammer in THIS script bypasses the gateway, so its rate limiter cannot mask whether
// the approval path itself is race-free.
//
// Two things change by talking to ticket-service directly instead of through the gateway:
//   - Auth: ticket-service is an OAuth2 resource server reading the standard `Authorization: Bearer`
//     header. The gateway is what turns the browser's TVU_AUTH cookie into that bearer token, so this
//     script parses the JWT back out of seed.organizer.cookie (the raw cookie value IS the JWT) and
//     sends it as `Authorization: Bearer <jwt>`.
//   - CSRF: enforced by a gateway global filter, not by ticket-service, so the X-XSRF-TOKEN header is
//     simply dropped -- there's nothing on the other end to check it.
// Inside the k6 container the services are on the host, not on this container's loopback.
const TICKET_SERVICE = __ENV.TICKET_SERVICE_URL ?? "http://host.docker.internal:8082";

function extractBearerToken(cookieHeader) {
  const match = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith("TVU_AUTH="));
  if (!match) throw new Error(`no TVU_AUTH cookie found in seed.organizer.cookie: ${cookieHeader}`);
  return match.slice("TVU_AUTH=".length);
}

const BEARER_TOKEN = extractBearerToken(seed.organizer.cookie);

const approved = new Counter("approvals_succeeded");
const soldOut = new Counter("approvals_sold_out");
const rateLimited = new Counter("approvals_rate_limited");
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
    `${TICKET_SERVICE}/api/reservations/${id}/approve`,
    null,
    {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      tags: { name: "PATCH /api/reservations/{id}/approve" },
    },
  );

  if (response.status === 200) {
    approved.add(1);
  } else if (response.status === 409) {
    soldOut.add(1);
  } else if (response.status === 429) {
    // Not expected when talking to ticket-service directly (the rate limiter is a gateway-only filter),
    // but kept as its own bucket rather than folded into sold-out or unexpected, in case something
    // upstream (e.g. a shared proxy) still throttles.
    rateLimited.add(1);
    console.error(`rate-limited (429) for ${id}`);
  } else {
    unexpected.add(1);
    console.error(`unexpected ${response.status} for ${id}: ${String(response.body).slice(0, 200)}`);
  }

  check(response, {
    "approval resolved cleanly (200 or 409, never 5xx)": (r) => r.status === 200 || r.status === 409,
  });
}
