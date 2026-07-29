# TVU Event & Ticket — Frontend

React + TypeScript + Vite workspace for the TVU Event & Ticketing Platform. Talks to the backend at a single
base URL (`VITE_API_BASE_URL`), using an HttpOnly JWT cookie + double-submit CSRF cookie. The backend is
one modular-monolith application — the API gateway it used to sit behind was removed in the 2026-07
migration, and no URL the frontend calls changed. See the repo root [README.md](../README.md) and
[BACKEND_STATUS_FOR_FRONTEND.md](../backend/docs/BACKEND_STATUS_FOR_FRONTEND.md) for the backend contract, and
[backend/docs/BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md) /
[docs/FRONTEND_IMPLEMENTATION_STATUS.md](../docs/FRONTEND_IMPLEMENTATION_STATUS.md) for what is
still incomplete and why.

## Running locally

```bash
npm install
cp .env.example .env   # then edit values as needed
npm run dev
```

## Environment variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API (must include `/api`) | Never point production at `localhost` |
| `VITE_APP_ENV` | `development` \| `production` | Defaults to Vite's own build mode if unset |
| `VITE_MICROSOFT_CLIENT_ID` / `VITE_MICROSOFT_TENANT_ID` / `VITE_MICROSOFT_REDIRECT_URI` | MSAL config for the Microsoft login button | Required for student sign-in |

App startup validates this configuration (`src/lib/env.ts`). Never put real secrets in a `VITE_*`
variable — everything with that prefix is bundled into the client-side JS and is publicly readable.

## Auth model

- Students log in via Microsoft OAuth/OIDC. Role, `clubId`, and
  profile data always come from the backend session (`GET /auth/me`) — the frontend never lets a
  user pick their own role.
- The session cache (`src/state/authSession.ts`) is an in-memory mirror of the authenticated
  profile, not the JWT itself. The JWT lives only in an HttpOnly cookie the frontend cannot read;
  nothing auth-related is ever written to `localStorage`/`sessionStorage`.
- **Organizer and Super Admin sign in with a mailed one-time code**, not a password. The "Ban tổ
  chức CLB · Quản trị viên" panel on the login page posts to `/auth/otp/request` and then
  `/auth/otp/verify`. There is deliberately no password anywhere: club accounts are shared between a
  chair and a vice-chair and handed over each year, so control of the mailbox is the real credential.
- The role decides the method, and the server does not trust which box was used. A student address
  typed into the code panel behaves exactly like an unknown one — every outcome is the same silent
  202 on request and the same 401 on verify, so neither flow reveals which addresses are admins.
- Ticking "Ghi nhớ thiết bị này trong 30 ngày" stores a rotating device token; `/auth/session/refresh`
  then mints a session without a code. The token is single-use and rotates on every exchange, and
  concurrent refresh attempts are deduplicated client-side onto a single in-flight request.
- A code costs a send slot: one mail per address per minute and ten per day. Asking again too soon
  changes nothing on screen — the request still answers 202 — but no new mail is sent and the code
  already in the inbox stays valid for its full ten minutes.

## Production safety

- The frontend contains no demo-account, fixture or mock-data mode. Service layers always call the
  real backend API.
- `npm run build:production` verifies that no mock/test import or mock chunk reached the bundle.

## Design system & motion

Design tokens live as CSS custom properties in `src/index.css` (`@theme` block): brand/secondary/accent
colors, semantic status tokens (`--color-success-*`, `--color-warning-*`, `--color-danger-*`, `--color-info-*`),
surface/border/text tokens, and motion tokens (`--ease-premium`, `--motion-fast/base/slow`). Components consume
these tokens (e.g. `bg-success-50`, `text-danger-600`) instead of hard-coding raw palette colours.

Shared building blocks:
- `PageHeader` — eyebrow + title + description + actions, used across Student/Organizer/Super Admin routes.
  It still accepts an optional `breadcrumb`, but no route passes one: breadcrumbs were dropped from every
  page in the 2026-07 redesign, so `Breadcrumb` survives only as an unused component.
- `EmptyState`, `BackendPendingNotice`, `StatisticCard`, `EventCard`, `TicketCard`,
  `QRDisplayCard` — all theme-token driven.

Motion primitives (`src/hooks/`):
- `useCardTilt` — pointer-driven 3D tilt + spotlight written to CSS variables (no per-pixel React re-render);
  auto-disabled on touch devices and under `prefers-reduced-motion`.
- `useCountUp` — KPI count-up on scroll-into-view via IntersectionObserver + rAF; snaps to final value under
  reduced motion.

Per-route page transitions come from keying the layout content by `location.pathname` so the `.page-enter`
animation re-triggers on navigation. All non-essential animation is disabled under
`@media (prefers-reduced-motion: reduce)`.

## Build & lint

```bash
npm run lint       # oxlint
npm run typecheck  # tsc -b --pretty false
npm run build       # tsc -b && vite build
```

CI (`.github/workflows/ci.yml`, job `frontend`) runs `npm ci`, lint, production build verification,
`npm audit`, and a guard check that no real `.env` file is committed.

## Known backend limitations

The following are **not frontend bugs** — the frontend is deliberately showing an honest "waiting
on backend" state instead of fabricating data. Full detail in
[backend/docs/BACKEND_SECURITY_REQUIREMENTS.md](../backend/docs/BACKEND_SECURITY_REQUIREMENTS.md):

- Organizer/Super Admin accounts intentionally have no password: they sign in with an emailed OTP.
  Super Admin can provision Organizer accounts with email, display name, and club assignment.
- Organizer dashboards, per-event dashboards, school-wide statistics, per-club statistics, users,
  MSSV verification, and audit logs are connected to live backend APIs.
- `EventResponse`/`ReservationResponse` don't include a club display name or a student display
  name — those fields render as a neutral placeholder rather than a fabricated value.
- **No endpoint returns a student's signed ticket QR.** It is delivered by email once, at approval.
  `qrCodeValue` is therefore optional on `Ticket`, and a student who loses the mail cannot recover the
  code in the app. Rendering itself is wired up: `QRDisplayCard` draws a real scannable image with
  `qrcode.react` whenever a value is present.
