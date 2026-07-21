import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

const seed = JSON.parse(open("./.seed.json"));

// The single monolith keeps the public API at :8080. The capacity race is exercised
// through its normal endpoint using a bearer token; CSRF remains required only for
// browser cookie authentication.
const TICKET_SERVICE = __ENV.TICKET_SERVICE_URL ?? "http://host.docker.internal:8080";

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
    // Kept separate if an upstream proxy adds throttling.
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
